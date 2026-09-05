"use client";

/* A pool, and the button that puts money into it.
 *
 * This is the screen a join link points at, so it is the first thing most
 * members will ever see of Commish. It has one job beyond joining: make the
 * deal legible BEFORE the wallet opens. The buy-in, how many have paid, what
 * the vault holds, and the fact that the commissioner cannot touch it.
 *
 * THE COMMISSIONER IS NOT SPECIAL HERE. `create_pool` does not make them a
 * member; they join through this same screen, paying the same buy-in, and the
 * program has no branch that treats them differently. That is deliberate, and
 * it is why the page makes no distinction either.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { Laces, Wordmark } from "@/components/Laces";
import { WalletButton } from "@/components/WalletButton";
import { PickGrid } from "@/components/PickGrid";
import { formatUsdc, shortAddress } from "@/lib/format";
import {
  buildJoinPool,
  createAtaIdempotentIx,
  decodePool,
  decodeMember,
  memberPda,
  ataFor,
  readableProgramError,
  USDC_MINT,
  MAX_DISPLAY_NAME,
  STATUS_OPEN,
  type PoolView,
  type MemberView,
} from "@/lib/program";

type Status =
  | { at: "idle" }
  | { at: "signing" }
  | { at: "confirming"; signature: string }
  | { at: "joined"; signature: string }
  | { at: "error"; message: string };

export default function PoolPage() {
  const params = useParams<{ pool: string }>();
  const { connection } = useConnection();
  const { publicKey, connected, signTransaction } = useWallet();

  const [pool, setPool] = useState<PoolView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vaultAmount, setVaultAmount] = useState<bigint | null>(null);
  const [usdcAmount, setUsdcAmount] = useState<bigint | null>(null);
  const [member, setMember] = useState<MemberView | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<Status>({ at: "idle" });

  const poolKey = useMemo(() => {
    try {
      return new PublicKey(params.pool);
    } catch {
      return null;
    }
  }, [params.pool]);

  /* One loader for everything on-chain this page shows, re-run after a join so
   * the counts the member just changed are the counts they see. */
  const refresh = useCallback(async () => {
    if (!poolKey) {
      setLoadError("That is not a pool address.");
      return;
    }
    try {
      const info = await connection.getAccountInfo(poolKey);
      if (!info) {
        setLoadError("No pool at that address on this cluster.");
        setPool(null);
        return;
      }
      const decoded = decodePool(info.data);
      setPool(decoded);
      setLoadError(null);

      const vault = await connection
        .getTokenAccountBalance(ataFor(poolKey, USDC_MINT))
        .catch(() => null);
      setVaultAmount(vault ? BigInt(vault.value.amount) : BigInt(0));

      if (publicKey) {
        const mine = await connection.getAccountInfo(
          memberPda(poolKey, publicKey),
        );
        setMember(mine ? decodeMember(mine.data) : null);

        const wallet = await connection
          .getTokenAccountBalance(ataFor(publicKey, USDC_MINT))
          .catch(() => null);
        setUsdcAmount(wallet ? BigInt(wallet.value.amount) : BigInt(0));
      } else {
        setMember(null);
        setUsdcAmount(null);
      }
    } catch (e) {
      /* An unreachable RPC is by far the most common failure here, and web3.js
       * reports it as "failed to get info about account …: TypeError: Failed to
       * fetch" — which sends people looking at the address rather than at their
       * cluster. Name the actual problem. */
      const raw = e instanceof Error ? e.message : String(e);
      setLoadError(
        /failed to fetch|fetch failed|networkerror/i.test(raw)
          ? `Could not reach the cluster at ${connection.rpcEndpoint}.`
          : raw,
      );
    }
  }, [connection, poolKey, publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const nameBytes = new TextEncoder().encode(displayName).length;
  const short = usdcAmount !== null && pool !== null && usdcAmount < pool.buyIn;

  const problem: string | null =
    !pool || !poolKey
      ? null
      : pool.status !== STATUS_OPEN
        ? "This pool is closed to new members."
        : pool.memberCount >= pool.maxMembers
          ? "This pool is full."
          : member
            ? "You are already in this pool."
            : nameBytes === 0
              ? "Pick a name the others will see."
              : nameBytes > MAX_DISPLAY_NAME
                ? `Names are limited to ${MAX_DISPLAY_NAME} characters.`
                : short
                  ? `You need ${formatUsdc(pool.buyIn)} of USDC to join.`
                  : null;

  const busy = status.at === "signing" || status.at === "confirming";
  const canJoin = connected && !!pool && !problem && !busy;

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKey || !poolKey || !canJoin) return;
    if (!signTransaction) {
      setStatus({ at: "error", message: "This wallet cannot sign transactions." });
      return;
    }

    setStatus({ at: "signing" });
    try {
      const { instruction } = buildJoinPool({
        pool: poolKey,
        wallet: publicKey,
        displayName,
      });

      const latest = await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      })
        .add(createAtaIdempotentIx(publicKey, publicKey, USDC_MINT))
        .add(instruction);

      const signed = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      setStatus({ at: "confirming", signature });

      const result = await connection.confirmTransaction(
        { signature, ...latest },
        "confirmed",
      );
      if (result.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
      }

      setStatus({ at: "joined", signature });
      await refresh();
    } catch (err) {
      setStatus({ at: "error", message: readableProgramError(err) });
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <Link href="/" aria-label="Commish home">
          <Wordmark size={20} />
        </Link>
        <WalletButton />
      </header>

      <main className="py-10">
        {loadError ? (
          <p className="rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
            {loadError}
          </p>
        ) : !pool ? (
          <p className="text-cream-dim">Reading the pool…</p>
        ) : (
          <>
            <h1 className="display text-4xl uppercase sm:text-5xl">{pool.name}</h1>
            <p className="mt-3 flex items-center gap-2 text-cream-dim">
              <Laces size={12} className="text-leather" />
              Survivor · week {pool.currentWeek}
            </p>

            <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-night-3 bg-night-3 sm:grid-cols-3">
              <Stat label="BUY-IN" value={formatUsdc(pool.buyIn)} gold />
              <Stat
                label="IN THE VAULT"
                value={vaultAmount === null ? "—" : formatUsdc(vaultAmount)}
                gold
              />
              <Stat
                label="MEMBERS"
                value={`${pool.paidMembers} / ${pool.maxMembers}`}
              />
            </dl>

            <p className="mt-6 rounded-xl border border-night-3 bg-night-2/60 p-4 text-sm text-cream-dim">
              The vault is this pool&apos;s own token account. The commissioner
              collects nothing and can move nothing — money leaves only by a
              winner&apos;s claim or, past the refund deadline, back to everyone
              who paid.
            </p>

            {member && poolKey ? (
              <PickGrid
                poolKey={poolKey}
                pool={pool}
                member={member}
                onPicked={refresh}
              />
            ) : (
              <form className="mt-8 flex flex-col gap-4" onSubmit={onJoin}>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
                    YOUR NAME IN THIS POOL
                  </span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Julia"
                    maxLength={MAX_DISPLAY_NAME}
                    className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 text-cream outline-none placeholder:text-cream-dim/50 focus:border-leather"
                  />
                </label>

                {connected && problem ? (
                  <p className="rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
                    {problem}
                  </p>
                ) : null}

                {status.at === "error" ? (
                  <p className="rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
                    {status.message}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={!canJoin}
                  className="h-14 rounded-xl bg-leather text-sm font-bold tracking-wide text-night transition-colors hover:bg-leather-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
                >
                  {!connected
                    ? "Connect a wallet to join"
                    : status.at === "signing"
                      ? "Confirm in your wallet…"
                      : status.at === "confirming"
                        ? "Waiting for the network…"
                        : `Join for ${formatUsdc(pool.buyIn)}`}
                </button>

                {usdcAmount !== null ? (
                  <p className="text-center text-xs text-cream-dim">
                    You hold {formatUsdc(usdcAmount)} USDC
                  </p>
                ) : null}
              </form>
            )}

            <p className="mt-10 text-center text-xs text-cream-dim">
              Pool {shortAddress(params.pool, 6)} · commissioner{" "}
              {shortAddress(pool.commissioner.toBase58(), 4)}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  gold,
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div className="bg-night-2 p-4">
      <dt className="text-xs font-bold tracking-[0.18em] text-cream-dim">
        {label}
      </dt>
      <dd
        className={`mt-1 text-lg font-bold ${gold ? "text-gold" : "text-cream"}`}
      >
        {value}
      </dd>
    </div>
  );
}
