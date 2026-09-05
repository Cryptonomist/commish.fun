"use client";

/* Create a pool. The first screen that spends money.
 *
 * Three things this page owes the person using it, in order of how badly they
 * hurt when they are missing:
 *
 * 1. REFUSE BEFORE THE WALLET, NOT AFTER. Everything `create_pool` validates
 *    about time is validated here first. A wallet popup followed by a red
 *    "custom program error: 0x1773" is the worst possible way to learn that a
 *    48-hour dispute window does not fit a schedule.
 *
 * 2. SAY WHAT IS ABOUT TO BE TRUE. The vault address and the fact that nobody
 *    — including the commissioner — can move what is in it are shown before the
 *    button, not in a docs page.
 *
 * 3. NEVER LIE ABOUT WHAT HAPPENED. A signature that has not confirmed is not
 *    a created pool, and the UI says which of those it is.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { Laces, Wordmark } from "@/components/Laces";
import { WalletButton } from "@/components/WalletButton";
import { WEEK_1_KICKOFF } from "@/lib/nfl";
import { shortAddress, toBaseUnits, formatUsdc } from "@/lib/format";
import {
  buildCreatePool,
  configPda,
  randomNonce,
  readableProgramError,
  POOL_SURVIVOR,
  MAX_NAME,
  MIN_MEMBERS,
  MAX_MEMBERS,
} from "@/lib/program";
import {
  seasonLockSchedule,
  refundDeadlineFor,
  validateSchedule,
  DEFAULT_DISPUTE_WINDOW_SECS,
} from "@/lib/schedule";

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
const explorer = (kind: "tx" | "address", id: string) =>
  `https://explorer.solana.com/${kind}/${id}?cluster=${CLUSTER}`;

type Status =
  | { at: "idle" }
  | { at: "sending" }
  | { at: "confirming"; signature: string }
  | { at: "done"; signature: string; pool: string }
  | { at: "error"; message: string };

export default function NewPool() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();

  const [name, setName] = useState("");
  const [buyIn, setBuyIn] = useState("25");
  const [maxMembers, setMaxMembers] = useState("50");
  const [disputeHours, setDisputeHours] = useState(
    String(DEFAULT_DISPUTE_WINDOW_SECS / 3600),
  );
  const [status, setStatus] = useState<Status>({ at: "idle" });

  /* The program's Config is created once per cluster by `init_config`. Until it
   * exists nothing can be created, and the failure would otherwise surface as
   * an opaque AccountNotInitialized after a wallet signature. */
  const [configReady, setConfigReady] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    connection
      .getAccountInfo(configPda())
      .then((info) => live && setConfigReady(info !== null))
      .catch(() => live && setConfigReady(null));
    return () => {
      live = false;
    };
  }, [connection]);

  const locks = useMemo(() => seasonLockSchedule(WEEK_1_KICKOFF), []);
  const disputeWindowSecs = Math.round(Number(disputeHours) * 3600);

  const problem = useMemo(
    () =>
      validateSchedule({
        locks,
        disputeWindowSecs,
        startWeek: 1,
        nowSecs: Math.floor(Date.now() / 1000),
      }),
    [locks, disputeWindowSecs],
  );

  const buyInUnits = useMemo(() => {
    try {
      return toBaseUnits(buyIn || "0");
    } catch {
      return null;
    }
  }, [buyIn]);

  const members = Number(maxMembers);
  const nameBytes = new TextEncoder().encode(name).length;

  const formError: string | null =
    nameBytes === 0
      ? "Give the pool a name."
      : nameBytes > MAX_NAME
        ? `Names are limited to ${MAX_NAME} characters.`
        : buyInUnits === null
          ? "That buy-in is not a number."
          : !Number.isInteger(members) ||
              members < MIN_MEMBERS ||
              members > MAX_MEMBERS
            ? `Between ${MIN_MEMBERS} and ${MAX_MEMBERS} members.`
            : (problem?.message ?? null);

  const busy = status.at === "sending" || status.at === "confirming";
  const canSubmit = connected && !formError && !busy && configReady !== false;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKey || !canSubmit || buyInUnits === null) return;

    setStatus({ at: "sending" });
    try {
      const nonce = randomNonce();
      const { instruction, pool } = buildCreatePool({
        commissioner: publicKey,
        nonce,
        name,
        poolType: POOL_SURVIVOR,
        buyIn: buyInUnits,
        maxMembers: members,
        startWeek: 1,
        lockTs: locks,
        refundDeadlineTs: refundDeadlineFor(locks),
        disputeWindowSecs,
      });

      const tx = new Transaction().add(instruction);
      const signature = await sendTransaction(tx, connection);
      setStatus({ at: "confirming", signature });

      /* Confirm before claiming success. `sendTransaction` resolving means the
       * cluster accepted the bytes, not that the pool exists. */
      const latest = await connection.getLatestBlockhash();
      const result = await connection.confirmTransaction(
        { signature, ...latest },
        "confirmed",
      );
      if (result.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
      }

      setStatus({ at: "done", signature, pool: pool.toBase58() });
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
        <h1 className="display text-4xl uppercase sm:text-5xl">Start a pool</h1>
        <p className="mt-3 leading-relaxed text-cream-dim">
          Set the buy-in and share the join link. The vault is created on-chain
          when you confirm — nobody, you included, can move what is in it except
          through payout logic.
        </p>

        {configReady === false ? (
          <p className="mt-6 rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
            The program has not been initialised on <b>{CLUSTER}</b> yet. Run{" "}
            <code className="text-leather">init_config</code> once — see
            SETUP.md — before any pool can be created.
          </p>
        ) : null}

        {status.at === "done" ? (
          <Created
            pool={status.pool}
            signature={status.signature}
            buyIn={buyInUnits ?? BigInt(0)}
            name={name}
          />
        ) : (
          <form className="mt-10 flex flex-col gap-6" onSubmit={onSubmit}>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
                POOL NAME
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sunday Regulars"
                maxLength={MAX_NAME}
                className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 text-cream outline-none placeholder:text-cream-dim/50 focus:border-leather"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
                BUY-IN (USDC)
              </span>
              <input
                value={buyIn}
                onChange={(e) => setBuyIn(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 font-bold text-gold outline-none focus:border-leather"
              />
              <span className="text-xs text-cream-dim">
                Every member pays this once. It is the only money that ever
                enters the vault.
              </span>
            </label>

            <div className="grid gap-6 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
                  MAX MEMBERS
                </span>
                <input
                  value={maxMembers}
                  onChange={(e) =>
                    setMaxMembers(e.target.value.replace(/[^\d]/g, ""))
                  }
                  inputMode="numeric"
                  className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 text-cream outline-none focus:border-leather"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
                  DISPUTE WINDOW (HOURS)
                </span>
                <input
                  value={disputeHours}
                  onChange={(e) =>
                    setDisputeHours(e.target.value.replace(/[^\d]/g, ""))
                  }
                  inputMode="numeric"
                  className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 text-cream outline-none focus:border-leather"
                />
                <span className="text-xs text-cream-dim">
                  How long members have to vote down a bad result before it
                  counts.
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-night-3 bg-night-2/60 p-4 text-sm">
              <span className="flex items-center gap-2 font-bold text-cream">
                <Laces size={12} className="text-leather" />
                Picks lock at first kickoff
              </span>
              <p className="mt-1.5 text-cream-dim">
                {WEEK_1_KICKOFF.toLocaleString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </p>
              <p className="mt-3 border-t border-night-3 pt-3 text-xs text-cream-dim">
                The vault will be this pool&apos;s own token account, derived by
                the program. There is no instruction anywhere in it that sends
                money to an address of your choosing.
              </p>
            </div>

            {formError && connected ? (
              <p className="rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
                {formError}
              </p>
            ) : null}

            {status.at === "error" ? (
              <p className="rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
                {status.message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              className="h-14 rounded-xl bg-leather text-sm font-bold tracking-wide text-night transition-colors hover:bg-leather-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
            >
              {!connected
                ? "Connect a wallet to continue"
                : status.at === "sending"
                  ? "Confirm in your wallet…"
                  : status.at === "confirming"
                    ? "Waiting for the network…"
                    : "Create pool"}
            </button>

            {status.at === "confirming" ? (
              <p className="text-center text-xs text-cream-dim">
                Sent.{" "}
                <a
                  className="text-leather underline"
                  href={explorer("tx", status.signature)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(status.signature, 6)}
                </a>{" "}
                — not confirmed yet.
              </p>
            ) : publicKey ? (
              <p className="text-center text-xs text-cream-dim">
                Commissioner: {shortAddress(publicKey.toBase58())}
              </p>
            ) : null}
          </form>
        )}
      </main>
    </div>
  );
}

function Created({
  pool,
  signature,
  buyIn,
  name,
}: {
  pool: string;
  signature: string;
  buyIn: bigint;
  name: string;
}) {
  return (
    <div className="mt-10 flex flex-col gap-4 rounded-xl border border-alive/40 bg-alive/10 p-6">
      <h2 className="display text-2xl uppercase">{name} is live</h2>
      <p className="text-sm text-cream-dim">
        Buy-in <span className="font-bold text-gold">{formatUsdc(buyIn)}</span>.
        The vault exists and is owned by the pool, not by you.
      </p>
      <dl className="flex flex-col gap-2 text-xs">
        <div className="flex justify-between gap-4">
          <dt className="text-cream-dim">Pool</dt>
          <dd>
            <a
              className="text-leather underline"
              href={explorer("address", pool)}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(pool, 6)}
            </a>
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-cream-dim">Transaction</dt>
          <dd>
            <a
              className="text-leather underline"
              href={explorer("tx", signature)}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(signature, 6)}
            </a>
          </dd>
        </div>
      </dl>
      <p className="text-xs text-cream-dim">
        Next: joining. You are not a member of this pool yet — the commissioner
        joins like everyone else, and that screen is not built.
      </p>
    </div>
  );
}
