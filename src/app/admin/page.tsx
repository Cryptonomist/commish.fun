"use client";

/* The operations desk.
 *
 * WHAT IT IS FOR. The results oracle runs the ordinary week without anybody
 * watching, so the question that actually matters is the negative one: is
 * anything stuck, and how long has it been stuck. This page answers that and
 * counts the product on the way past. The triage rules live in `lib/admin.ts`
 * and are unit-tested there; this file only fetches and renders.
 *
 * IT ASKS THE CHAIN AND NOTHING ELSE. Two `getProgramAccounts` calls, the same
 * pair the leaderboard makes. No database, no event log, no tracking script,
 * and so no change to what the privacy page promises — which is worth keeping,
 * because that page says in as many words that no analytics run here and that
 * the shipped build was checked rather than the intention.
 *
 * THE GATE IS TIDINESS, NOT SECURITY, and saying so is better than implying
 * otherwise. Every number below is already public: a pool is a public account,
 * `getProgramAccounts` enumerates all of them, and this site's own leaderboard
 * already does exactly that. So the allowlist keeps the page out of the way of
 * people it would only confuse. It is not protecting a secret, and it must
 * never be extended to something that is — anything private belongs behind the
 * signature check the X linking flow uses, on a server route.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import {
  stateLabel,
  totals,
  triage,
  type AttentionItem,
  type PoolWithAddress,
} from "@/lib/admin";
import { formatUsdc, shortAddress } from "@/lib/format";
import { decodePool, discriminatorFilter, PROGRAM_ID } from "@/lib/program";

/* Who may open it. Comma-separated base58 addresses in the environment, and
 * an empty list closes the page rather than opening it: a missing variable in
 * production must not be the thing that publishes an internal screen. */
const ALLOWED = (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** How long ago, in the largest unit that still reads as a number. */
function ago(since: number, now: number): string {
  const secs = Math.max(0, now - since);
  if (secs < 90) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 90) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/* How loud a row is. `refund-open` is the only one where money is at stake
 * rather than merely late, so it is the only one painted as an error. */
const TONE: Record<string, string> = {
  "refund-open": "text-out",
  "finalize-due": "text-pot",
  "settle-due": "text-pot",
  "advance-due": "text-pot",
  "sheet-due": "text-pot",
  "results-overdue": "text-pot",
  "veto-pressure": "text-cream",
  "unclaimed-pot": "text-cream-dim",
  "unclaimed-slots": "text-cream-dim",
};

export default function AdminPage() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [pools, setPools] = useState<PoolWithAddress[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const allowed = !!publicKey && ALLOWED.includes(publicKey.toBase58());

  const load = useCallback(async () => {
    setFailed(null);
    setPools(null);
    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: discriminatorFilter("Pool"),
      });
      setPools(
        accounts.map((a) => ({
          address: a.pubkey.toBase58(),
          pool: decodePool(a.account.data),
        })),
      );
      setNow(Math.floor(Date.now() / 1000));
    } catch (e) {
      /* An unfiltered scan is the first call a busy public RPC drops, and an
       * empty list would read as "nothing is stuck", which is the one thing
       * this page must never say when it does not know. */
      setFailed(e instanceof Error ? e.message : "Could not read the chain.");
    }
  }, [connection]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const items = useMemo(
    () => (pools ? triage(pools, now) : []),
    [pools, now],
  );
  const sums = useMemo(() => (pools ? totals(pools) : null), [pools]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-5 sm:px-8">
      <SiteNav />

      <main className="flex flex-col gap-8 py-6">
        <div className="flex flex-col gap-3">
          <h1 className="display text-2xl uppercase sm:text-3xl">Operations</h1>
          <p className="field-type max-w-xl text-sm font-medium leading-relaxed">
            Every pool the program has ever created, read straight from the
            chain. Nothing here is collected or stored.
          </p>
        </div>

        {!connected ? (
          <p className="panel p-5 text-sm leading-relaxed text-cream-dim">
            Connect the operator wallet.
          </p>
        ) : !allowed ? (
          <div className="panel flex flex-col gap-3 p-5">
            <p className="text-sm leading-relaxed text-cream">
              This wallet is not on the operator list.
            </p>
            <p className="text-sm leading-relaxed text-cream-dim">
              Everything this page shows is public on chain anyway. The
              leaderboard and the pools list read the same accounts.
            </p>
          </div>
        ) : failed ? (
          <div className="panel flex flex-col gap-3 p-5">
            <p className="text-sm leading-relaxed text-cream">
              Could not read the chain, so nothing below is trustworthy.
            </p>
            <p className="text-sm leading-relaxed text-cream-dim">{failed}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="btn btn-secondary self-start"
            >
              Try again
            </button>
          </div>
        ) : pools === null ? (
          <p className="panel p-5 text-sm text-cream-dim">Reading the chain…</p>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="font-matrix text-[11px] leading-4 text-chalk">
                NEEDS A PERSON
              </h2>
              {items.length === 0 ? (
                <p className="panel p-5 text-sm leading-relaxed text-alive">
                  Nothing is stuck. Every pool is inside its own timers.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((item, i) => (
                    <AttentionRow key={`${item.pool}-${item.kind}-${i}`} item={item} now={now} />
                  ))}
                </ul>
              )}
            </section>

            {sums ? (
              <section className="flex flex-col gap-3">
                <h2 className="font-matrix text-[11px] leading-4 text-chalk">
                  THE NUMBERS
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Pools" value={String(sums.pools)} />
                  <Stat label="Running" value={String(sums.running)} />
                  <Stat label="Settled" value={String(sums.settled)} />
                  <Stat label="Open to join" value={String(sums.open)} />
                  <Stat label="Paid entries" value={String(sums.paidMembers)} />
                  <Stat label="Held in vaults" value={formatUsdc(sums.escrowed)} />
                  <Stat label="Played for, all time" value={formatUsdc(sums.volume)} />
                  <Stat label="Biggest pool" value={formatUsdc(sums.biggest)} />
                </div>
                <p className="text-xs leading-relaxed text-cream-dim">
                  Survivor {sums.byType.survivor} · Loser {sums.byType.loser} ·
                  League {sums.byType.league}
                  {sums.byType.other ? ` · Other ${sums.byType.other}` : ""}
                  {sums.abandoned ? ` · Abandoned ${sums.abandoned}` : ""}
                </p>
              </section>
            ) : null}

            <section className="flex flex-col gap-3">
              <h2 className="font-matrix text-[11px] leading-4 text-chalk">
                EVERY POOL
              </h2>
              <ul className="flex flex-col gap-1">
                {pools
                  .slice()
                  .sort((a, b) => Number(b.pool.totalDues - a.pool.totalDues))
                  .map(({ address, pool }) => (
                    <li
                      key={address}
                      className="flex items-baseline justify-between gap-3 border-b border-white/5 py-2 text-sm"
                    >
                      <Link href={`/p/${address}`} className="truncate text-cream underline-offset-2 hover:underline">
                        {pool.name || shortAddress(address)}
                      </Link>
                      <span className="shrink-0 text-xs text-cream-dim">
                        {pool.paidMembers}/{pool.maxMembers} ·{" "}
                        {formatUsdc(pool.totalDues)} · {stateLabel(pool)}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>

            <button
              type="button"
              onClick={() => void load()}
              className="btn btn-secondary self-start"
            >
              Refresh
            </button>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function AttentionRow({ item, now }: { item: AttentionItem; now: number }) {
  return (
    <li className="panel flex flex-col gap-1 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <Link
          href={`/p/${item.pool}`}
          className={`truncate text-sm font-semibold underline-offset-2 hover:underline ${TONE[item.kind] ?? "text-cream"}`}
        >
          {item.name || shortAddress(item.pool)}
        </Link>
        <span className="shrink-0 font-matrix text-[10px] leading-4 text-cream-dim">
          {ago(item.actionableSince, now)}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-cream-dim">{item.detail}</p>
      {item.crank ? (
        <p className="font-matrix text-[10px] leading-4 text-cream-dim">
          {item.crank}
        </p>
      ) : null}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel flex flex-col gap-1 p-3">
      <span className="font-matrix text-[10px] leading-4 text-cream-dim">
        {label}
      </span>
      <span className="text-lg text-cream">{value}</span>
    </div>
  );
}
