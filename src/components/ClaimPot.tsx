"use client";

/* The pool is decided. Somebody gets paid.
 *
 * THIS IS THE SCREEN THE WHOLE PRODUCT IS AN ARGUMENT FOR. The pitch is that a
 * Survivor pot stops living in one person's Venmo, and the proof is a winner
 * taking their share without asking anyone, from a vault whose commissioner
 * cannot touch it. So the claim is a member's own action against the escrow: no
 * approval step, no commissioner, nothing to chase.
 *
 * IT SHOWS THE OUTCOME TO EVERYONE, not just the winners. A member who lost in
 * week six still wants to see how it ended, and a pool that only renders for
 * the people it pays looks like it has something to hide.
 */

import { useCallback, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { formatUsdc } from "@/lib/format";
import {
  buildClaimPot,
  createAtaIdempotentIx,
  isPotWinner,
  readableProgramError,
  WEEK_NONE,
  type MemberView,
  type PoolView,
} from "@/lib/program";

type Status =
  | { at: "idle" }
  | { at: "signing" }
  | { at: "confirming" }
  | { at: "error"; message: string };

export function ClaimPot({
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

  const won = !!member && isPotWinner(pool, member);
  const claimed = !!member && member.claimed;
  const busy = status.at === "signing" || status.at === "confirming";

  const claim = useCallback(async () => {
    if (!publicKey || !won || claimed || busy) return;
    if (!signTransaction) {
      setStatus({ at: "error", message: "This wallet cannot sign transactions." });
      return;
    }

    setStatus({ at: "signing" });
    try {
      const { instruction } = buildClaimPot({
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
        /* The winner may never have held USDC. `sponsor_join` lets somebody
         * else pay a member in, so the holder of a sponsored seat can reach
         * this screen with no token account at all, and `claim_pot` takes
         * `member_ata` as a typed TokenAccount: it would fail at
         * deserialization, before any of the program's own checks, with an
         * error that says nothing about what to do. */
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
    won,
    claimed,
    busy,
    signTransaction,
    poolKey,
    pool.vault,
    pool.usdcMint,
    connection,
    onChanged,
  ]);

  const shared = pool.winnersCount > 1;

  return (
    <section className="mt-8 rounded-xl border border-gold/40 bg-night-2/60 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-2xl uppercase">This pool is settled</h2>
        <p className="text-sm">
          <span className="text-cream-dim">Each winner takes </span>
          <span className="font-bold text-gold">
            {formatUsdc(pool.potPerWinner)}
          </span>
        </p>
      </div>

      <p className="mt-2 text-sm text-cream-dim">
        {pool.winnersWeek === WEEK_NONE ? (
          <>
            {shared
              ? `${pool.winnersCount} members are still standing`
              : "One member is still standing"}
            {" "}
            after week {pool.finalizedWeek}.
          </>
        ) : (
          /* The ending every paper design forgets: the last survivors all go
           * out together. The pot cannot belong to nobody, so it belongs to
           * whoever was alive when that week began. */
          <>
            Everybody went out in week {pool.winnersWeek}, so the pot belongs to
            the {pool.winnersCount} who were alive when that week started.
          </>
        )}{" "}
        The vault pays each winner directly. Nobody has to release it.
      </p>

      {status.at === "error" ? (
        <p className="mt-4 rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
          {status.message}
        </p>
      ) : null}

      {!member ? (
        <p className="mt-4 text-sm text-cream-dim">
          Only members of this pool can claim.
        </p>
      ) : claimed ? (
        <p className="mt-4 rounded-xl border border-alive/40 bg-alive/10 p-4 text-sm text-cream">
          You have taken your {formatUsdc(pool.potPerWinner)}. Nothing else is
          owed to you from this pool.
        </p>
      ) : won ? (
        <button
          type="button"
          onClick={claim}
          disabled={busy}
          className="mt-4 h-14 w-full rounded-xl bg-action text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
        >
          {status.at === "signing"
            ? "Confirm in your wallet…"
            : status.at === "confirming"
              ? "Waiting for the network…"
              : `Claim ${formatUsdc(pool.potPerWinner)}`}
        </button>
      ) : (
        <p className="mt-4 text-sm text-cream-dim">
          You went out in week {member.eliminatedWeek}, so there is nothing to
          claim. The pot goes to {shared ? "the winners" : "the winner"} above.
        </p>
      )}
    </section>
  );
}
