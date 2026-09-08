"use client";

/* Your pools.
 *
 * THE GAP THIS FILLS. A pool was reachable only by its address, and the
 * address was only ever handed out as a share link. Create a pool, close the
 * tab, and this site offered no route back to it — the money sat safe and
 * visible on chain while the way in was a URL in somebody's browser history.
 * The commissioner is the person most likely to need it and the one with
 * nowhere to look.
 *
 * TWO LISTS, NOT ONE, because they answer different questions. "Pools I
 * started" is the commissioner's shelf: the things awaiting a lock, a payout,
 * a week rolled forward. "Pools I joined" is the player's: what am I in, and
 * is it waiting on me. A pool can appear in both, and does whenever somebody
 * joins their own pool, which is the normal case.
 *
 * IT ASKS THE CHAIN, NOT A DATABASE. Two filtered getProgramAccounts calls
 * against this program — the only shape the RPC proxy forwards. So this
 * survives a wiped browser, a different computer and a lost link, and it works
 * for a wallet that has never touched this site before.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";


import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { formatUsdc, shortAddress } from "@/lib/format";
import {
  decodeMember,
  decodePool,
  membershipsByWallet,
  poolsByCommissioner,
  PROGRAM_ID,
  POOL_LEAGUE,
  POOL_LOSER,
  STATUS_ABANDONED,
  STATUS_FINALIZED,
  STATUS_LOCKED,
  STATUS_OPEN,
  STATUS_RESULTS_POSTED,
  STATUS_SETTLED,
  STATUS_SHEET_FINALIZED,
  STATUS_SHEET_POSTED,
  type PoolView,
} from "@/lib/program";

type Row = { address: string; pool: PoolView; started: boolean; joined: boolean };

const KIND = (t: number) =>
  t === POOL_LEAGUE ? "League dues" : t === POOL_LOSER ? "Loser pool" : "Survivor";

/* The chain's word for where a pool is, in the reader's. `status` is one byte
 * and means different things per pool kind, so a league's "locked" is not a
 * pick pool's. */
function state(p: PoolView): string {
  const league = p.poolType === POOL_LEAGUE;
  switch (p.status) {
    case STATUS_OPEN:
      return league ? "Collecting dues" : "Open to join";
    case STATUS_LOCKED:
      return league ? "Dues locked — post the payout" : "Running";
    case STATUS_RESULTS_POSTED:
      return "Results posted — in the dispute window";
    case STATUS_FINALIZED:
      return "Week finalized";
    case STATUS_SETTLED:
      return "Settled";
    case STATUS_ABANDONED:
      return "Abandoned";
    case STATUS_SHEET_POSTED:
      return "Payout posted — in the dispute window";
    case STATUS_SHEET_FINALIZED:
      return "Payout final — claimable";
    default:
      return `Status ${p.status}`;
  }
}

export default function MyPools() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) return;
    setFailed(null);
    setRows(null);
    try {
      /* Both scans at once. The membership scan returns Member accounts, whose
       * `pool` field names the pool — so the pools themselves still have to be
       * fetched, but by address rather than by another scan. */
      const [mine, memberships] = await Promise.all([
        connection.getProgramAccounts(PROGRAM_ID, {
          filters: poolsByCommissioner(publicKey),
        }),
        connection.getProgramAccounts(PROGRAM_ID, {
          filters: membershipsByWallet(publicKey),
        }),
      ]);

      const by = new Map<string, Row>();
      for (const a of mine) {
        by.set(a.pubkey.toBase58(), {
          address: a.pubkey.toBase58(),
          pool: decodePool(a.account.data),
          started: true,
          joined: false,
        });
      }

      const joinedKeys = memberships.map(
        (m) => decodeMember(m.account.data).pool,
      );
      const missing = joinedKeys.filter((k) => !by.has(k.toBase58()));
      if (missing.length) {
        const infos = await connection.getMultipleAccountsInfo(missing);
        infos.forEach((info, i) => {
          if (!info) return;
          by.set(missing[i].toBase58(), {
            address: missing[i].toBase58(),
            pool: decodePool(info.data),
            started: false,
            joined: true,
          });
        });
      }
      for (const k of joinedKeys) {
        const row = by.get(k.toBase58());
        if (row) row.joined = true;
      }

      setRows([...by.values()]);
    } catch (e) {
      /* A filtered scan is the one call a busy public RPC drops first, and a
       * silent empty list would read as "you have no pools" — which is the one
       * thing this page must never say when it does not know. */
      setFailed(e instanceof Error ? e.message : "Could not read the chain.");
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void load();
  }, [load]);

  /* FINISHED POOLS MOVE OUT OF THE WAY.
   *
   * A settled pool is not a thing anybody has to do something about, and left
   * in the same list it competes for attention with the ones that do — which
   * is the opposite of what this page is for. It stays reachable, because the
   * chain keeps it forever and somebody will want to look at what a pool paid
   * six months from now.
   *
   * SETTLED AND ABANDONED ONLY. Not STATUS_SHEET_FINALIZED, which looks
   * finished and is not: the payout is agreed but the money is still in the
   * vault waiting to be claimed, and a claim is exactly the kind of thing this
   * page exists to remind somebody about. A pool becomes past when the last
   * claim empties it and the program marks it settled. */
  const isPast = (r: Row) =>
    r.pool.status === STATUS_SETTLED || r.pool.status === STATUS_ABANDONED;

  const live = rows?.filter((r) => !isPast(r)) ?? [];
  const started = live.filter((r) => r.started);
  const joinedOnly = live.filter((r) => !r.started && r.joined);
  /* Started and joined are not split here. Once a pool is over, which side of
   * it somebody was on stops being how they look for it. */
  const past = rows?.filter(isPast) ?? [];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 sm:px-8">
      <SiteNav />

      <main className="flex flex-col gap-8 py-6">
        <div className="flex flex-col gap-3">
          <h1 className="display text-2xl uppercase sm:text-3xl">Your pools</h1>
          <p className="field-type max-w-xl text-sm font-medium leading-relaxed">
            Read from the chain, not from this browser. Any wallet, any device,
            no link needed.
          </p>
        </div>

        {!connected ? (
          <p className="panel p-5 text-sm leading-relaxed text-cream-dim">
            Connect a wallet to see the pools it started or joined.
          </p>
        ) : failed ? (
          <div className="panel flex flex-col gap-3 p-5">
            <p className="text-sm leading-relaxed text-cream">
              Could not read your pools.
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
        ) : rows === null ? (
          <p className="panel p-5 text-sm text-cream-dim">Reading the chain…</p>
        ) : rows.length === 0 ? (
          <div className="panel flex flex-col gap-3 p-5">
            <p className="text-sm leading-relaxed text-cream">
              This wallet is not in any pool yet.
            </p>
            <Link href="/pools/new" className="btn btn-primary self-start">
              Start one
            </Link>
          </div>
        ) : (
          <>
            <Group title="POOLS YOU STARTED" rows={started} />
            <Group title="POOLS YOU JOINED" rows={joinedOnly} />
            {/* Dimmed rather than hidden: a finished pool is a record, and the
                chain keeps it whether this page lists it or not. */}
            <Group title="FINISHED" rows={past} muted />
            {live.length === 0 && past.length > 0 ? (
              <p className="text-sm leading-relaxed text-cream-dim">
                Nothing live. Every pool this wallet has been in is finished.
              </p>
            ) : null}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function Group({
  title,
  rows,
  muted,
}: {
  title: string;
  rows: Row[];
  muted?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section className={`flex flex-col gap-3 ${muted ? "opacity-70" : ""}`}>
      <h2
        className={`font-matrix text-[11px] leading-4 ${muted ? "text-cream-dim" : "text-chalk"}`}
      >
        {title}
      </h2>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.address}>
            <Link
              href={`/p/${r.address}`}
              className="panel flex flex-col gap-1.5 p-4 transition-colors hover:border-action"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold text-cream">
                  {r.pool.name || shortAddress(r.address, 4)}
                </span>
                <span className="font-matrix text-[10px] leading-4 text-cream-dim">
                  {KIND(r.pool.poolType)}
                </span>
              </div>
              <p className="text-sm text-cream-dim">
                {state(r.pool)} · {r.pool.paidMembers} paid ·{" "}
                {Number(r.pool.buyIn) === 0
                  ? "no buy-in"
                  : `${formatUsdc(r.pool.buyIn)} each`}
                {r.started && r.joined ? " · you are in it" : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
