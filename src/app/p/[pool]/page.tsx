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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import Link from "next/link";

import { Laces } from "@/components/Laces";
import SharePool from "@/components/SharePool";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { JoinChecklist, SOL_NEEDED_LAMPORTS } from "@/components/JoinChecklist";
import { LeaguePanel } from "@/components/LeaguePanel";
import { PickGrid } from "@/components/PickGrid";
import { ReclaimDues } from "@/components/ReclaimDues";
import { ResultsPanel } from "@/components/ResultsPanel";
import { SponsorSeat } from "@/components/SponsorSeat";
import { formatUsdc, shortAddress } from "@/lib/format";
import {
  buildJoinPool,
  createAtaIdempotentIx,
  decodePool,
  decodeMember,
  isLeague,
  memberPda,
  ataFor,
  readableProgramError,
  PROGRAM_ID,
  USDC_MINT,
  MAX_DISPLAY_NAME,
  POOL_LOSER,
  STATUS_OPEN,
  STATUS_SETTLED,
  type PoolView,
  type MemberView,
} from "@/lib/program";

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

type Status =
  | { at: "idle" }
  | { at: "signing" }
  | { at: "confirming"; signature: string }
  | { at: "joined"; signature: string }
  | { at: "error"; message: string };

export default function PoolPage() {
  const params = useParams<{ pool: string }>();
  const { connection } = useConnection();
  const { publicKey, connected, connecting, signTransaction, wallets } =
    useWallet();

  const [pool, setPool] = useState<PoolView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vaultAmount, setVaultAmount] = useState<bigint | null>(null);
  const [usdcAmount, setUsdcAmount] = useState<bigint | null>(null);
  /* Null means unread, which is not the same as zero. A rate-limited RPC that
   * read as "funded" would hand somebody a green tick and then a failure. */
  const [solLamports, setSolLamports] = useState<number | null>(null);
  const [member, setMember] = useState<MemberView | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<Status>({ at: "idle" });
  /* Once true, a failed refresh leaves the last good page alone. */
  const loadedOnce = useRef(false);
  /* Distinguishes "not a member" from "not read yet", which otherwise look
   * identical and let somebody submit a second join over the top of their
   * first one. */
  const [walletRead, setWalletRead] = useState(false);

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

      /* WHOSE POOL IS IT? Anchor derives a discriminator from the account's
       * NAME, not from the program id, so a Pool written by a DIFFERENT
       * deployment decodes perfectly and renders a completely normal joinable
       * page that fails at signing with an error nothing here can name. One
       * comparison closes it. */
      if (!info.owner.equals(PROGRAM_ID)) {
        setLoadError(
          "That account is not a Commish pool. It exists on this cluster but " +
            "belongs to another program.",
        );
        setPool(null);
        return;
      }

      let decoded: PoolView;
      try {
        decoded = decodePool(info.data);
      } catch {
        /* Anything that is not a Pool: a wallet address, a token account, a
         * Member PDA, a mint — all of which people paste out of explorers —
         * throws here. Without this the raw Borsh message reaches the screen. */
        setLoadError("That address is not a pool. Check the link.");
        setPool(null);
        return;
      }
      setPool(decoded);
      setLoadError(null);
      loadedOnce.current = true;

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

        /* Fees and rent, which the join screen never checked. Somebody with
         * the buy-in but no lamports used to get a failed transaction rather
         * than a reason. */
        setSolLamports(await connection.getBalance(publicKey).catch(() => null));

        setWalletRead(true);
      } else {
        setMember(null);
        setUsdcAmount(null);
        setSolLamports(null);
        setWalletRead(false);
      }
    } catch (e) {
      /* A REFRESH THAT FAILS MUST NOT REPLACE A PAGE THAT LOADED.
       *
       * `refresh` runs again the moment a join confirms, and the render tests
       * `loadError` before anything else. So one throttled RPC call in that
       * instant used to wipe the entire page — heading, vault, membership, the
       * lot — and leave a single grey error line, one second after somebody
       * paid. The first load may report; every later one fails quietly and
       * leaves the last good view on screen. */
      if (loadedOnce.current) return;

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

  /* An error describes the attempt that produced it, not the one being typed.
   * It used to survive until the next submit, so somebody who fixed the actual
   * problem still read the old cause sitting above the button. Every failure
   * on this page routes into that one box, which makes a stale message there
   * more confusing than none at all. */
  useEffect(() => {
    setStatus((s) => (s.at === "error" ? { at: "idle" } : s));
  }, [displayName, publicKey]);

  /* A pool that ran out of road: past the refund deadline and never settled.
   * Checked once per render rather than on a ticking clock, because the
   * deadline is months out and nobody is watching this page for the second it
   * flips. */
  const refundOpen =
    !!pool &&
    pool.status !== STATUS_SETTLED &&
    Date.now() / 1000 >= pool.refundDeadlineTs;

  const nameBytes = new TextEncoder().encode(displayName).length;
  const short = usdcAmount !== null && pool !== null && usdcAmount < pool.buyIn;

  /* ORDERED BY WHAT SOMEBODY CANNOT FIX BY TYPING.
   *
   * This chain used to ask for a display name before it mentioned money, so a
   * person with an empty wallet was told "Pick a name the others will see",
   * typed one, and only then learned they could not join at all. Money and
   * fees outrank the name every time, because the name is the only one of
   * these a keyboard can solve. */
  const problem: string | null =
    !pool || !poolKey
      ? null
      : pool.status !== STATUS_OPEN
        ? "This pool is closed to new members."
        : pool.memberCount >= pool.maxMembers
          ? "This pool is full."
          : member
            ? "You are already in this pool."
            : short
              ? `You need ${formatUsdc(pool.buyIn)} of USDC to join.`
              : solLamports !== null && solLamports < SOL_NEEDED_LAMPORTS
                ? "You need a little SOL to cover the network fee."
                : nameBytes === 0
                  ? "Pick a name the others will see."
                  : nameBytes > MAX_DISPLAY_NAME
                    ? `Names are limited to ${MAX_DISPLAY_NAME} characters.`
                    : null;

  const busy = status.at === "signing" || status.at === "confirming";
  const canJoin =
    connected && !!pool && !problem && !busy && walletRead;

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

      /* A BLOCKHASH EXPIRING IS NOT A FAILED JOIN, AND SAYING SO IS THE WORST
       * THING THIS PAGE CAN DO.
       *
       * The blockhash is fetched before the wallet popup opens and is good for
       * roughly a minute. A hardware wallet, a phone that switches to a wallet
       * app and back, or somebody who reads the popup carefully will routinely
       * exceed that, and `confirmTransaction` then throws
       * TransactionExpiredBlockheightExceeded. The transaction may still have
       * landed. Telling somebody their money did not move when it did is worse
       * than any other error here, so an expiry asks the chain rather than
       * assuming. */
      let confirmed = false;
      try {
        const result = await connection.confirmTransaction(
          { signature, ...latest },
          "confirmed",
        );
        if (result.value.err) {
          throw new Error(
            `Transaction failed: ${JSON.stringify(result.value.err)}`,
          );
        }
        confirmed = true;
      } catch (err) {
        const st = await connection
          .getSignatureStatus(signature, { searchTransactionHistory: true })
          .catch(() => null);
        const landed =
          !!st?.value &&
          !st.value.err &&
          (st.value.confirmationStatus === "confirmed" ||
            st.value.confirmationStatus === "finalized");
        if (!landed) throw err;
        confirmed = true;
      }

      if (confirmed) setStatus({ at: "joined", signature });
      await refresh();
    } catch (err) {
      setStatus({ at: "error", message: readableProgramError(err) });
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 sm:px-8">
      <SiteNav />

      <main className="py-10">
        {loadError ? (
          <p className="rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
            {loadError}
          </p>
        ) : !pool ? (
          <p className="text-cream-dim">Reading the pool…</p>
        ) : (
          <>
            <h1 className="display text-2xl uppercase sm:text-3xl">{pool.name}</h1>
            {/* A league has no weeks. Saying "week 1" on one is not a cosmetic
                slip — it tells a member to expect a pick screen that will
                never appear. */}
            <p className="mt-3 flex items-center gap-2 text-cream-dim">
              <Laces size={12} className="text-action" />
              {isLeague(pool)
                ? "League · dues held in escrow"
                : `${pool.poolType === POOL_LOSER ? "Loser" : "Survivor"} · week ${pool.currentWeek}`}
            </p>

            {/* A pool that has not filled is not a pool, and the commissioner
                needs the link in front of nine people rather than in front of
                themselves. Shown while the pool is still taking members; once
                it is locked there is nobody left to invite. */}
            {pool.status === STATUS_OPEN ? (
              <SharePool
                className="mt-6"
                pool={params.pool}
                name={pool.name}
                buyIn={pool.buyIn}
                spotsLeft={Math.max(0, pool.maxMembers - pool.memberCount)}
                kind={
                  isLeague(pool)
                    ? "League"
                    : pool.poolType === POOL_LOSER
                      ? "Loser"
                      : "Survivor"
                }
              />
            ) : null}

            {/* The other half of filling a pool. A link reaches the friends
                who can pay their own way; this reaches the ones who cannot,
                by letting the commissioner buy their seat. It renders only for
                the commissioner, because the program refuses anybody else. */}
            {pool.status === STATUS_OPEN && poolKey ? (
              <SponsorSeat
                className="mt-6"
                poolKey={poolKey}
                pool={pool}
                onChanged={refresh}
              />
            ) : null}

            {/* Set the moment a join confirms and, until now, rendered
                nowhere. The page did change underneath them — the form became
                a pick grid — but nothing said "that worked", and nothing gave
                them the receipt. Money moving deserves an acknowledgement. */}
            {status.at === "joined" ? (
              <p className="mt-6 rounded-xl border border-alive/40 bg-alive/5 p-4 text-sm text-cream">
                <span className="font-bold">You are in.</span>{" "}
                {formatUsdc(pool.buyIn)} moved into the vault.{" "}
                <a
                  href={`https://explorer.solana.com/tx/${status.signature}?cluster=${CLUSTER}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {shortAddress(status.signature, 6)}
                </a>
              </p>
            ) : null}

            <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-night-3 bg-night-3 sm:grid-cols-3">
              <Stat label="BUY-IN" value={formatUsdc(pool.buyIn)} gold />
              <Stat
                label="IN THE VAULT"
                value={vaultAmount === null ? "…" : formatUsdc(vaultAmount)}
                gold
              />
              <Stat
                label="MEMBERS"
                value={`${pool.paidMembers} / ${pool.maxMembers}`}
              />
            </dl>

            <p className="mt-6 rounded-xl border border-night-3 bg-night-2/60 p-4 text-sm text-cream-dim">
              The vault is this pool&apos;s own token account. The commissioner
              collects nothing and can move nothing. Money leaves only by a
              winner&apos;s claim or, past the refund deadline, back to everyone
              who paid.
            </p>

            {/* The deadman outranks the season. Once a pool is past its refund
                deadline without settling, getting the money back is the only
                thing on this page anybody needs, so it goes first. */}
            {poolKey && refundOpen ? (
              <ReclaimDues
                poolKey={poolKey}
                pool={pool}
                member={member}
                onChanged={refresh}
              />
            ) : null}

            {/* Two products, one page. A league has no picks, no weeks and no
                eliminations — it collects dues and pays a sheet — so it gets
                its own panel rather than a pick pool's with the parts that do
                not apply hidden. */}
            {poolKey && isLeague(pool) ? (
              <LeaguePanel
                poolKey={poolKey}
                pool={pool}
                member={member}
                vaultAmount={vaultAmount}
                onChanged={refresh}
              />
            ) : poolKey ? (
              <ResultsPanel
                poolKey={poolKey}
                pool={pool}
                member={member}
                onChanged={refresh}
              />
            ) : null}

            {member && poolKey && !isLeague(pool) ? (
              <PickGrid
                poolKey={poolKey}
                pool={pool}
                member={member}
                onPicked={refresh}
              />
            ) : member ? (
              /* A league member has no pick grid and used to get nothing at
                 all: no form, no confirmation, no sign their money arrived.
                 The panel above shows the pot; this says they are in it. */
              <p className="mt-8 rounded-xl border border-alive/40 bg-alive/5 p-4 text-sm text-cream">
                You are in as{" "}
                <span className="font-bold">{member.displayName}</span>. Your{" "}
                {formatUsdc(pool.buyIn)} is in the vault and comes back to you
                if this pool never pays out.
              </p>
            ) : (
              <form className="mt-8 flex flex-col gap-4" onSubmit={onJoin}>
                {/* THE RULES, ONE TAP AWAY, AT THE MOMENT THEY MATTER.
                    This screen is where somebody handed a link decides to pay,
                    and until now the only full statement of what they were
                    agreeing to was the Terms. A missed pick being a loss and a
                    team being spent once used are not things to discover in
                    week three. */}
                <p className="text-sm text-cream-dim">
                  New to this?{" "}
                  <Link className="text-action underline" href="/how">
                    How it works
                  </Link>
                  {". How picks work, how you go out, and how the money is paid."}
                </p>
                {/* Before the name field, because the name is the only one of
                    these a keyboard can solve. All three at once, so somebody
                    fixes everything in one trip rather than being told about
                    the next thing each time they come back. */}
                <JoinChecklist
                  hasWallet={wallets.length === 0 ? false : true}
                  connected={connected}
                  connecting={connecting}
                  solLamports={solLamports}
                  usdc={usdcAmount}
                  buyIn={pool.buyIn}
                  formatUsdc={formatUsdc}
                />

                <label className="flex flex-col gap-2">
                  <span className="font-matrix text-[10px] leading-4 text-cream-dim">
                    YOUR NAME IN THIS POOL
                  </span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Julia"
                    maxLength={MAX_DISPLAY_NAME}
                    className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 text-cream outline-none placeholder:text-cream-dim/50 focus:border-action"
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
                  className="h-14 rounded-xl bg-action text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
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

      <SiteFooter />
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
      <dt className="font-matrix text-[10px] leading-4 text-cream-dim">
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
