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
import SharePool from "@/components/SharePool";
import { SiteFooter } from "@/components/SiteFooter";
import { shortAddress, toBaseUnits, formatUsdc } from "@/lib/format";
import {
  buildCreatePool,
  configPda,
  randomNonce,
  readableProgramError,
  POOL_SURVIVOR,
  POOL_LEAGUE,
  POOL_LOSER,
  MAX_PRIZE_SLOTS,
  MAX_SLOT_LABEL,
  BPS_DENOM,
  MAX_NAME,
  MIN_MEMBERS,
  MAX_MEMBERS,
} from "@/lib/program";
import {
  firstKickoffFor,
  seasonLockSchedule,
  refundDeadlineFor,
  validateSchedule,
  DEFAULT_DISPUTE_WINDOW_SECS,
  FAST_CLOCK,
  WEEKS,
} from "@/lib/schedule";
import { weekOf } from "@/lib/season";

/* The dispute window is entered in hours, and the field strips anything that
 * is not a digit. On a fast clock the minimum is thirty SECONDS, which cannot
 * be typed in hours at all, so the unit moves with the clock. A form whose
 * smallest legal value is unreachable is a form that cannot create a pool. */
const WINDOW_UNIT_SECS = FAST_CLOCK ? 1 : 3600;
const WINDOW_UNIT_LABEL = FAST_CLOCK ? "SECONDS" : "HOURS";

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
  const { publicKey, connected, signTransaction } = useWallet();

  const [name, setName] = useState("");
  const [buyIn, setBuyIn] = useState("25");
  const [maxMembers, setMaxMembers] = useState("50");
  const [disputeWindow, setDisputeWindow] = useState(
    String(DEFAULT_DISPUTE_WINDOW_SECS / WINDOW_UNIT_SECS),
  );
  const [week, setWeek] = useState("1");

  /* TWO PRODUCTS BEHIND ONE FORM.
   *
   * A pick pool runs a season of picks. A league runs no season at all: it
   * collects dues until a deadline and pays a sheet the commissioner posts.
   * They share the escrow, the veto and the deadman refund, and share almost
   * nothing else, so half these fields are meaningless in the other mode and
   * are hidden rather than disabled. */
  const [mode, setMode] = useState<"survivor" | "loser" | "league">("survivor");
  const isLeagueMode = mode === "league";
  const poolType =
    mode === "league" ? POOL_LEAGUE : mode === "loser" ? POOL_LOSER : POOL_SURVIVOR;

  /* Joining closes here and `lock_dues` opens. A week is the usual gap between
   * agreeing a league and everybody having actually paid. */
  const [duesDeadline, setDuesDeadline] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    // datetime-local wants local time with no zone, which is what toISOString
    // is not, hence the offset.
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  });

  /* The split, as percentages a person can read. The program stores basis
   * points and requires them to add to exactly 10000, so the conversion and
   * that check both happen below. Sixty/thirty/ten is the ordinary league
   * payout and a better starting point than an empty table. */
  const [slots, setSlots] = useState<{ label: string; pct: string }[]>([
    { label: "1st", pct: "60" },
    { label: "2nd", pct: "30" },
    { label: "3rd", pct: "10" },
  ]);
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

  /* A pool does not have to start in week one. `create_pool` takes any week
   * from 1 to 18 and only requires that the one it starts on has not kicked off
   * yet, which is what lets somebody organise a pool in October. The form used
   * to hardcode week one and quietly withhold that. */
  const startWeek = Math.min(WEEKS, Math.max(1, Number(week) || 1));

  /* On a fast clock the season anchor has to keep moving: `create_pool` refuses
   * a first lock already in the past, and a form left open while somebody
   * thinks about a buy-in would propose a week that has already kicked off. It
   * also shifts with the start week, so a week-eleven pool is five minutes away
   * rather than fifty. On a real clock this is a fixed date and the interval
   * never runs. */
  const [firstKickoff, setFirstKickoff] = useState(() =>
    firstKickoffFor(startWeek),
  );
  useEffect(() => {
    setFirstKickoff(firstKickoffFor(startWeek));
    if (!FAST_CLOCK) return;
    const t = setInterval(
      () => setFirstKickoff(firstKickoffFor(startWeek)),
      15_000,
    );
    return () => clearInterval(t);
  }, [startWeek]);

  const locks = useMemo(() => seasonLockSchedule(firstKickoff), [firstKickoff]);
  const disputeWindowSecs = Math.round(
    Number(disputeWindow) * WINDOW_UNIT_SECS,
  );

  const problem = useMemo(
    () =>
      validateSchedule({
        locks,
        disputeWindowSecs,
        startWeek,
        nowSecs: Math.floor(Date.now() / 1000),
      }),
    [locks, disputeWindowSecs, startWeek],
  );

  /** The lock that actually matters: the week this pool opens on. */
  const startLock = new Date((locks[startWeek - 1] ?? 0) * 1000);
  const startByes = weekOf(startWeek)?.byes ?? [];

  const buyInUnits = useMemo(() => {
    try {
      return toBaseUnits(buyIn || "0");
    } catch {
      return null;
    }
  }, [buyIn]);

  const members = Number(maxMembers);
  const nameBytes = new TextEncoder().encode(name).length;

  /* Percentages to basis points, rounded once and summed as integers. Summing
   * the percentages as floats and multiplying at the end lets 33.33 three
   * times look like 100 on screen and arrive as 9999 on chain, where the
   * program refuses it. Rounding each slot first means what is added up here
   * is exactly what gets sent. */
  const slotBps = useMemo(
    () => slots.map((s) => Math.round((Number(s.pct) || 0) * 100)),
    [slots],
  );
  const bpsTotal = slotBps.reduce((n, b) => n + b, 0);
  const duesDeadlineTs = useMemo(
    () => Math.floor(new Date(duesDeadline).getTime() / 1000),
    [duesDeadline],
  );
  const badLabel = slots.find(
    (s) =>
      s.label.trim().length === 0 ||
      new TextEncoder().encode(s.label).length > MAX_SLOT_LABEL,
  );

  const leagueError: string | null = !isLeagueMode
    ? null
    : !Number.isFinite(duesDeadlineTs)
      ? "Pick a date for dues to close."
      : duesDeadlineTs <= Math.floor(Date.now() / 1000)
        ? "Dues have to close in the future."
        : badLabel
          ? `Prize names are 1 to ${MAX_SLOT_LABEL} characters.`
          : bpsTotal !== BPS_DENOM
            ? `The split adds up to ${(bpsTotal / 100).toFixed(2)}%. It has to be exactly 100%, or the difference would be stuck in the vault with nothing able to release it.`
            : null;

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
            : isLeagueMode
              ? leagueError
              : (problem?.message ?? null);

  const busy = status.at === "sending" || status.at === "confirming";
  const canSubmit = connected && !formError && !busy && configReady !== false;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKey || !canSubmit || buyInUnits === null) return;
    if (!signTransaction) {
      setStatus({ at: "error", message: "This wallet cannot sign transactions." });
      return;
    }

    setStatus({ at: "sending" });
    try {
      const nonce = randomNonce();
      const { instruction, pool } = buildCreatePool({
        commissioner: publicKey,
        nonce,
        name,
        poolType,
        buyIn: buyInUnits,
        maxMembers: members,
        startWeek,
        /* A league has no schedule and the program never reads these, but the
         * instruction still takes eighteen of them. */
        lockTs: isLeagueMode ? locks.map(() => 0) : locks,
        /* The deadman. For a league it only has to be later than the dues
         * deadline; a month is long enough that reaching it means the league
         * really was abandoned, and short enough that the money is not stuck
         * for a season. */
        refundDeadlineTs: isLeagueMode
          ? duesDeadlineTs + 30 * 24 * 60 * 60
          : refundDeadlineFor(locks),
        disputeWindowSecs,
        ...(isLeagueMode
          ? {
              duesDeadlineTs,
              prizeSlots: slots.map((s, i) => ({
                label: s.label.trim(),
                bps: slotBps[i],
              })),
            }
          : {}),
      });

      /* SIGN HERE, SEND OURSELVES.
       *
       * `sendTransaction` from wallet-adapter asks the WALLET to broadcast,
       * and the wallet uses whatever RPC it is configured for — not the one
       * this app is talking to. Point the app at a local validator while the
       * wallet is set to devnet and the transaction is built against one chain
       * and submitted to another, which fails as an unhelpful "Unexpected
       * error" from inside the extension.
       *
       * Asking only for a signature and broadcasting through `connection`
       * makes the wallet's network setting irrelevant: the blockhash, the
       * submission and the confirmation all come from the same cluster. */
      const latest = await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }).add(instruction);

      const signed = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      setStatus({ at: "confirming", signature });

      /* Confirm before claiming success. A signature that has been accepted for
       * processing is not a pool that exists. */
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
          when you confirm. Nobody, you included, can move what is in it except
          through payout logic.
        </p>

        {configReady === false ? (
          <p className="mt-6 rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
            The program has not been initialised on <b>{CLUSTER}</b> yet. Run{" "}
            <code className="text-action">init_config</code> once (see
            SETUP.md) before any pool can be created.
          </p>
        ) : null}

        {status.at === "done" ? (
          <Created
            pool={status.pool}
            signature={status.signature}
            buyIn={buyInUnits ?? BigInt(0)}
            name={name}
            kind={
              poolType === POOL_LEAGUE
                ? "League"
                : poolType === POOL_LOSER
                  ? "Loser"
                  : "Survivor"
            }
          />
        ) : (
          <form className="mt-10 flex flex-col gap-6" onSubmit={onSubmit}>
            {/* Chosen first, because it decides what the rest of the form even
                means. A league has no weeks and a Survivor pool has no payout
                sheet, so the fields that do not apply are gone rather than
                greyed out. */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
                WHAT KIND
              </span>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    {
                      key: "survivor" as const,
                      title: "Survivor",
                      blurb:
                        "Pick a team to WIN each week. Wrong and you are out.",
                    },
                    {
                      key: "loser" as const,
                      title: "Loser pool",
                      blurb:
                        "Pick a team to LOSE each week. If they win, you are out.",
                    },
                    {
                      key: "league" as const,
                      title: "League dues",
                      blurb:
                        "Your season runs elsewhere. Commish just holds the pot.",
                    },
                  ]
                ).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMode(m.key)}
                    aria-pressed={mode === m.key}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      mode === m.key
                        ? "border-action bg-action/10"
                        : "border-night-3 bg-night-2 hover:border-action/50"
                    }`}
                  >
                    <span className="display block text-base uppercase text-cream">
                      {m.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-cream-dim">
                      {m.blurb}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
                POOL NAME
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sunday Regulars"
                maxLength={MAX_NAME}
                className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 text-cream outline-none placeholder:text-cream-dim/50 focus:border-action"
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
                className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 font-bold text-gold outline-none focus:border-action"
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
                  className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 text-cream outline-none focus:border-action"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
                  DISPUTE WINDOW ({WINDOW_UNIT_LABEL})
                </span>
                <input
                  value={disputeWindow}
                  onChange={(e) =>
                    setDisputeWindow(e.target.value.replace(/[^\d]/g, ""))
                  }
                  inputMode="numeric"
                  className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 text-cream outline-none focus:border-action"
                />
                <span className="text-xs text-cream-dim">
                  How long members have to vote down a bad result before it
                  counts.
                </span>
              </label>

              {isLeagueMode ? (
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
                    DUES CLOSE
                  </span>
                  <input
                    type="datetime-local"
                    value={duesDeadline}
                    onChange={(e) => setDuesDeadline(e.target.value)}
                    className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 text-cream outline-none focus:border-action"
                  />
                  <span className="text-xs text-cream-dim">
                    Nobody can join after this, and the payout cannot be posted
                    until it passes.
                  </span>
                </label>
              ) : (
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
                    START WEEK
                  </span>
                  <input
                    value={week}
                    onChange={(e) => setWeek(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 text-cream outline-none focus:border-action"
                  />
                  <span className="text-xs text-cream-dim">
                    A pool does not have to start in week 1. Anything from 1 to{" "}
                    {WEEKS}, as long as that week has not kicked off yet.
                  </span>
                </label>
              )}
            </div>

            {/* The split is fixed at creation and can never be edited, which is
                the property that makes it worth agreeing before the season
                rather than arguing about after it. */}
            {isLeagueMode ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
                  HOW THE POT SPLITS
                </span>

                <ul className="flex flex-col gap-2">
                  {slots.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <input
                        value={s.label}
                        onChange={(e) =>
                          setSlots((all) =>
                            all.map((x, j) =>
                              j === i ? { ...x, label: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="1st"
                        maxLength={MAX_SLOT_LABEL}
                        className="min-w-0 grow rounded-xl border border-night-3 bg-night-2 px-4 py-3 text-cream outline-none placeholder:text-cream-dim/50 focus:border-action"
                      />
                      <div className="flex w-28 shrink-0 items-center rounded-xl border border-night-3 bg-night-2 pr-3 focus-within:border-action">
                        <input
                          value={s.pct}
                          onChange={(e) =>
                            setSlots((all) =>
                              all.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      pct: e.target.value.replace(/[^\d.]/g, ""),
                                    }
                                  : x,
                              ),
                            )
                          }
                          inputMode="decimal"
                          className="w-full min-w-0 bg-transparent px-4 py-3 text-right font-bold text-gold outline-none"
                        />
                        <span className="text-sm text-cream-dim">%</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSlots((all) => all.filter((_, j) => j !== i))
                        }
                        disabled={slots.length <= 1}
                        aria-label={`Remove ${s.label || "prize"}`}
                        className="shrink-0 rounded-xl border border-night-3 px-3 text-cream-dim transition-colors hover:border-out hover:text-out disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setSlots((all) => [...all, { label: "", pct: "" }])
                    }
                    disabled={slots.length >= MAX_PRIZE_SLOTS}
                    className="rounded-xl border border-night-3 px-4 py-2 text-sm font-bold text-cream transition-colors hover:border-action disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Add a prize
                  </button>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      bpsTotal === BPS_DENOM ? "text-alive" : "text-out"
                    }`}
                  >
                    {(bpsTotal / 100).toFixed(2)}% of 100%
                  </span>
                </div>

                <span className="text-xs text-cream-dim">
                  Up to {MAX_PRIZE_SLOTS} prizes, and they have to add to
                  exactly 100%. Anything less would leave the difference in the
                  vault with no instruction able to release it, so the program
                  refuses the pool rather than stranding the dues.
                </span>
              </div>
            ) : null}

            <div className="rounded-xl border border-night-3 bg-night-2/60 p-4 text-sm">
              <span className="flex items-center gap-2 font-bold text-cream">
                <Laces size={12} className="text-action" />
                {isLeagueMode
                  ? "Joining closes when dues close"
                  : `Week ${startWeek} picks lock at its first kickoff`}
              </span>
              <p className="mt-1.5 text-cream-dim">
                {(isLeagueMode
                  ? new Date(duesDeadlineTs * 1000)
                  : startLock
                ).toLocaleString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </p>
              {isLeagueMode ? (
                <p className="mt-1.5 text-xs text-cream-dim">
                  If nobody ever posts a payout, every member can take their
                  dues back a month after that. Nobody has to agree to it and
                  nobody can stop it.
                </p>
              ) : startByes.length > 0 ? (
                <p className="mt-1.5 text-xs text-cream-dim">
                  {startByes.join(" ")} are on a bye that week and will not be
                  pickable.
                </p>
              ) : null}
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
              className="h-14 rounded-xl bg-action text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
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
                  className="text-action underline"
                  href={explorer("tx", status.signature)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(status.signature, 6)}
                </a>{" "}
                , not confirmed yet.
              </p>
            ) : publicKey ? (
              <p className="text-center text-xs text-cream-dim">
                Commissioner: {shortAddress(publicKey.toBase58())}
              </p>
            ) : null}
          </form>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function Created({
  pool,
  signature,
  buyIn,
  name,
  kind,
}: {
  pool: string;
  signature: string;
  buyIn: bigint;
  name: string;
  kind: "Survivor" | "Loser" | "League";
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
              className="text-action underline"
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
              className="text-action underline"
              href={explorer("tx", signature)}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(signature, 6)}
            </a>
          </dd>
        </div>
      </dl>
      <Link
        href={`/p/${pool}`}
        className="mt-2 flex h-12 items-center justify-center rounded-xl bg-action text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi"
      >
        Open the pool and join
      </Link>
      <p className="text-xs text-cream-dim">
        You are not a member yet. The commissioner joins like everyone else and
        pays the same buy-in.
      </p>

      {/* The moment somebody wants to send this to nine people. Before this
          the answer was to select the address bar, which is a poor answer on
          the phone where most of this sharing happens. A pool that does not
          fill is not a pool. */}
      <SharePool
        pool={pool}
        name={name}
        buyIn={buyIn}
        kind={kind}
        className="mt-2 border-t border-alive/30 pt-5"
      />
    </div>
  );
}
