"use client";

/* The deadman switch.
 *
 * THIS IS THE PROMISE THE REST OF THE SITE IS WRITTEN AGAINST. Every claim the
 * landing page makes about not trusting one guy with the pot comes down to
 * this: if the pool never settles, because the commissioner vanished or the
 * season fell apart or nobody could agree on week nine, the money still comes
 * back. No vote, no approval, nobody to chase. It is the one path that works
 * precisely when nothing else is working.
 *
 * So it renders as the main thing on the page once it is available, rather than
 * as a footnote under a season that is not happening.
 *
 * THE FIRST CALLER FIXES THE NUMBER. `refund_per_member` is computed once, from
 * the vault as it stands at that moment, and every member after reads the same
 * figure. That is what stops the last person out being shortchanged by the ones
 * who moved first, and it means that before anybody has reclaimed, this screen
 * can only estimate. It says which of the two it is showing.
 */

import { useCallback, useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { formatUsdc } from "@/lib/format";
import {
  buildReclaimDues,
  canReclaim,
  createAtaIdempotentIx,
  estimatedRefund,
  readableProgramError,
  STATUS_ABANDONED,
  type MemberView,
  type PoolView,
} from "@/lib/program";

type Status =
  | { at: "idle" }
  | { at: "signing" }
  | { at: "confirming" }
  | { at: "error"; message: string };

export function ReclaimDues({
  poolKey,
  pool,
  member,
  onChanged,
}: {
  poolKey: PublicKey;
  pool: PoolView;
  member: MemberView | null;
  onChanged: () => void | Promise<void>;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [status, setStatus] = useState<Status>({ at: "idle" });
  const [vaultAmount, setVaultAmount] = useState<bigint | null>(null);

  /* The vault is read here rather than passed down because the estimate moves:
   * every refund taken shrinks it, and a stale figure on this screen is a
   * number somebody would hold us to. */
  useEffect(() => {
    let cancelled = false;
    void connection
      .getTokenAccountBalance(pool.vault, "confirmed")
      .then((b) => {
        if (!cancelled) setVaultAmount(BigInt(b.value.amount));
      })
      .catch(() => {
        if (!cancelled) setVaultAmount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, pool.vault, pool.refundPerMember]);

  const fixed = pool.refundPerMember > BigInt(0);
  const share =
    vaultAmount === null ? null : estimatedRefund(pool, vaultAmount);
  const eligible = !!member && canReclaim(member);
  const busy = status.at === "signing" || status.at === "confirming";

  const reclaim = useCallback(async () => {
    if (!publicKey || !eligible || busy) return;
    if (!signTransaction) {
      setStatus({ at: "error", message: "This wallet cannot sign transactions." });
      return;
    }

    setStatus({ at: "signing" });
    try {
      const { instruction } = buildReclaimDues({
        pool: poolKey,
        wallet: publicKey,
        vault: pool.vault,
        usdcMint: pool.usdcMint,
      });

      const latest = await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      })
        // Same trap as joining and claiming: a sponsored member may never have
        // held USDC, and `member_ata` is a typed TokenAccount.
        .add(createAtaIdempotentIx(publicKey, publicKey, pool.usdcMint))
        .add(instruction);

      const signed = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      setStatus({ at: "confirming" });

      const result = await connection.confirmTransaction(
        { signature, ...latest },
        "confirmed",
      );
      if (result.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
      }

      setStatus({ at: "idle" });
      await onChanged();
    } catch (err) {
      setStatus({ at: "error", message: readableProgramError(err) });
    }
  }, [
    publicKey,
    eligible,
    busy,
    signTransaction,
    poolKey,
    pool.vault,
    pool.usdcMint,
    connection,
    onChanged,
  ]);

  const emptied = vaultAmount !== null && vaultAmount === BigInt(0);

  return (
    <section className="mt-8 rounded-xl border border-out/40 bg-night-2/60 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-2xl uppercase">
          {pool.status === STATUS_ABANDONED
            ? "This pool was abandoned"
            : "Refunds are open"}
        </h2>
        {share !== null && !emptied ? (
          <p className="text-sm">
            <span className="text-cream-dim">{fixed ? "Your share " : "About "}</span>
            <span className="font-bold text-gold">{formatUsdc(share)}</span>
          </p>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-cream-dim">
        This pool passed its refund deadline without settling, so every member
        who paid in takes their share of the vault back. Nobody has to approve
        it and there is nobody to chase: the vault pays each member directly.
      </p>

      <p className="mt-3 text-sm text-cream-dim">
        {fixed ? (
          <>
            The share was fixed at{" "}
            <span className="font-bold text-cream">
              {formatUsdc(pool.refundPerMember)}
            </span>{" "}
            when the first member reclaimed, split{" "}
            {pool.paidMembers} ways. Everybody gets that same figure, so nobody
            is shortchanged for going last.
          </>
        ) : (
          <>
            Nobody has reclaimed yet, so this is an estimate: the vault split{" "}
            {pool.paidMembers} ways. The first member to reclaim fixes the exact
            figure for everyone, which is what stops the last one out being
            shortchanged by the ones before.
          </>
        )}
      </p>

      {status.at === "error" ? (
        <p className="mt-4 rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
          {status.message}
        </p>
      ) : null}

      {!member ? (
        <p className="mt-4 text-sm text-cream-dim">
          Only members who paid into this pool can reclaim.
        </p>
      ) : member.claimed ? (
        <p className="mt-4 rounded-xl border border-alive/40 bg-alive/10 p-4 text-sm text-cream">
          You have taken your refund. Nothing else is owed to you from this pool.
        </p>
      ) : !member.paid ? (
        <p className="mt-4 text-sm text-cream-dim">
          You never paid into this pool, so there is nothing to refund.
        </p>
      ) : (
        <button
          type="button"
          onClick={reclaim}
          disabled={busy}
          className="mt-4 h-14 w-full rounded-xl bg-action text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
        >
          {status.at === "signing"
            ? "Confirm in your wallet…"
            : status.at === "confirming"
              ? "Waiting for the network…"
              : share === null
                ? "Reclaim your dues"
                : `Reclaim ${formatUsdc(share)}`}
        </button>
      )}
    </section>
  );
}
