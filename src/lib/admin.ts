/* What needs attention, across every pool the program has ever created.
 *
 * WHAT THIS IS FOR. The results oracle cranks the ordinary week by itself:
 * posts when two scoreboards agree, finalizes when the dispute window closes,
 * settles every member, advances. So this list is not a to-do list in the
 * normal case. It is the list of pools where that did NOT happen, which is the
 * only operational question worth a page: is anything stuck, and for how long.
 *
 * STALENESS IS THE SIGNAL, not the state. A pool sitting in RESULTS_POSTED is
 * healthy for the length of its dispute window and broken an hour after it. So
 * every item carries `actionableSince`, the moment the pool became somebody's
 * problem, and the page sorts by it. A week overdue by two days means the
 * oracle is down and nobody noticed, which is exactly the thing that costs a
 * commissioner their reputation and this site its pitch.
 *
 * IT READS THE CHAIN AND NOTHING ELSE. Every field here comes from a Pool or
 * Member account, so this needs no database, no tracking, no event log and no
 * privacy policy change. It is the same two `getProgramAccounts` calls the
 * leaderboard already makes.
 */

import { formatUsdc } from "@/lib/format";
import { MIN_POST_DELAY_SECS, WEEKS } from "@/lib/schedule";
import {
  POOL_LEAGUE,
  SLOT_FINALIZED,
  SLOT_PENDING,
  STATUS_ABANDONED,
  STATUS_FINALIZED,
  STATUS_LOCKED,
  STATUS_OPEN,
  STATUS_RESULTS_POSTED,
  STATUS_SETTLED,
  STATUS_SHEET_FINALIZED,
  STATUS_SHEET_POSTED,
  WEEK_NONE,
  type PoolView,
} from "@/lib/program";

/* Why a pool is on the list, worst first.
 *
 * The order is the order a person should work them, and `SEVERITY` below is
 * the same order as a number so a table can sort on it. Money at risk beats
 * money merely late, and money late beats a window that is simply open. */
export type AttentionKind =
  /** Past its refund deadline and never settled. Anyone paid in can now take
   *  their share and flip the pool to ABANDONED, which ends it for everyone
   *  else. The most urgent thing on this page. */
  | "refund-open"
  /** The dispute window closed and nobody called finalize_week. The week is
   *  decided and the pool cannot move until somebody cranks it. */
  | "finalize-due"
  /** Finalized, with members still to settle before the week can advance. */
  | "settle-due"
  /** Every member settled and advance_week not yet called. */
  | "advance-due"
  /** A league's payout sheet is past its dispute window and not finalized. */
  | "sheet-due"
  /** Locked, past the earliest legal posting time, and no results proposed.
   *  Either the oracle is down or the two scoreboards still disagree. */
  | "results-overdue"
  /** A pending posting is drawing veto votes and may be struck down. */
  | "veto-pressure"
  /** Settled, and the pot has not been fully claimed. Nothing is wrong; the
   *  winners simply have not come to collect. */
  | "unclaimed-pot"
  /** A finalized sheet with prize slots nobody has claimed. */
  | "unclaimed-slots";

const SEVERITY: Record<AttentionKind, number> = {
  "refund-open": 0,
  "finalize-due": 1,
  "settle-due": 2,
  "advance-due": 3,
  "sheet-due": 4,
  "results-overdue": 5,
  "veto-pressure": 6,
  "unclaimed-pot": 7,
  "unclaimed-slots": 8,
};

export type AttentionItem = {
  pool: string;
  name: string;
  kind: AttentionKind;
  /** One line a person can act on without opening the pool. */
  detail: string;
  /** Unix seconds when this became actionable. Sort key for staleness. */
  actionableSince: number;
  /** The instruction that clears it, or null when nothing is owed. */
  crank: string | null;
};

/** How the sort works: worst kind first, then longest-waiting first. */
export function compareAttention(a: AttentionItem, b: AttentionItem): number {
  const s = SEVERITY[a.kind] - SEVERITY[b.kind];
  return s !== 0 ? s : a.actionableSince - b.actionableSince;
}

/* When a locked week's results become postable.
 *
 * `post_results` is refused until MIN_POST_DELAY_SECS after the lock, so a
 * pool is not late until then, however long the games actually took. */
function postableFrom(pool: PoolView): number | null {
  const week = pool.currentWeek;
  if (week < 1 || week > WEEKS) return null;
  const lock = pool.lockTs[week - 1];
  if (!lock) return null;
  return lock + MIN_POST_DELAY_SECS;
}

/** A majority of the paid roster is what strikes a posting down. */
export function vetoMajority(paidMembers: number): number {
  return Math.floor(paidMembers / 2) + 1;
}

/* Everything wrong with one pool, right now.
 *
 * A pool can be on the list more than once, because a veto piling up on a
 * posting and that posting's window having closed are different problems with
 * different answers. */
export function attentionFor(
  pool: PoolView,
  address: string,
  now: number,
): AttentionItem[] {
  const out: AttentionItem[] = [];
  const at = (
    kind: AttentionKind,
    detail: string,
    actionableSince: number,
    crank: string | null,
  ) => out.push({ pool: address, name: pool.name, kind, detail, actionableSince, crank });

  /* An abandoned pool is finished. Nothing can happen to it, so nothing about
   * it needs attention, however odd its other fields look. */
  if (pool.status === STATUS_ABANDONED) return out;

  const settled =
    pool.status === STATUS_SETTLED || pool.status === STATUS_SHEET_FINALIZED;

  /* THE DEADMAN IS LIVE. Past this line any paid member can take their share
   * and end the pool for everybody, so a pot that should have been won is one
   * transaction from being split pro rata instead. */
  if (!settled && pool.refundDeadlineTs > 0 && now >= pool.refundDeadlineTs) {
    at(
      "refund-open",
      `Refund deadline passed and the pool never settled. Any paid member can ` +
        `now reclaim and flip it to abandoned.`,
      pool.refundDeadlineTs,
      "reclaim_dues",
    );
  }

  if (pool.status === STATUS_RESULTS_POSTED) {
    const closes = pool.pendingPostedTs + pool.disputeWindowSecs;
    if (now >= closes) {
      at(
        "finalize-due",
        `Week ${pool.pendingWeek} closed its dispute window and is waiting on ` +
          `finalize_week.`,
        closes,
        "finalize_week",
      );
    }
    const needed = vetoMajority(pool.paidMembers);
    if (pool.vetoCount > 0 && now < closes) {
      at(
        "veto-pressure",
        `Week ${pool.pendingWeek} has ${pool.vetoCount} of the ${needed} veto ` +
          `votes that would strike it down.`,
        pool.pendingPostedTs,
        null,
      );
    }
  }

  if (pool.status === STATUS_FINALIZED) {
    const left = pool.aliveAtWeekStart - pool.processedThisWeek;
    if (left > 0) {
      at(
        "settle-due",
        `Week ${pool.finalizedWeek} is finalized with ${left} of ` +
          `${pool.aliveAtWeekStart} members still to settle.`,
        pool.pendingPostedTs + pool.disputeWindowSecs,
        "settle_member",
      );
    } else {
      at(
        "advance-due",
        `Week ${pool.finalizedWeek} is fully settled and waiting on advance_week.`,
        pool.pendingPostedTs + pool.disputeWindowSecs,
        "advance_week",
      );
    }
  }

  if (pool.status === STATUS_LOCKED) {
    const from = postableFrom(pool);
    if (from !== null && now >= from) {
      at(
        "results-overdue",
        `Week ${pool.currentWeek} locked and no results have been proposed.`,
        from,
        "post_results",
      );
    }
  }

  if (pool.status === STATUS_SHEET_POSTED) {
    const closes = pool.pendingPostedTs + pool.disputeWindowSecs;
    if (now >= closes) {
      at(
        "sheet-due",
        `The payout sheet closed its dispute window and is waiting on ` +
          `finalize_sheet.`,
        closes,
        "finalize_sheet",
      );
    }
  }

  /* Money sitting in a vault that somebody has already won. Not a fault, but
   * it is the thing a commissioner gets asked about. */
  if (pool.status === STATUS_SETTLED && pool.potPerWinner > BigInt(0)) {
    at(
      "unclaimed-pot",
      `Settled with ${pool.winnersCount} winner${pool.winnersCount === 1 ? "" : "s"} ` +
        `owed ${formatUsdc(pool.potPerWinner)} each.`,
      pool.refundDeadlineTs,
      "claim_pot",
    );
  }

  if (pool.status === STATUS_SHEET_FINALIZED) {
    const owed = pool.prizeSlots
      .slice(0, pool.slotCount)
      .filter((s) => s.state === SLOT_PENDING || s.state === SLOT_FINALIZED).length;
    if (owed > 0) {
      at(
        "unclaimed-slots",
        `${owed} prize slot${owed === 1 ? "" : "s"} finalized and unclaimed.`,
        pool.refundDeadlineTs,
        "claim_prize",
      );
    }
  }

  return out;
}

export type PoolWithAddress = { address: string; pool: PoolView };

/** Every pool that needs a person, worst and stalest first. */
export function triage(pools: PoolWithAddress[], now: number): AttentionItem[] {
  return pools
    .flatMap(({ address, pool }) => attentionFor(pool, address, now))
    .sort(compareAttention);
}

/* THE NUMBERS, which are all just counting.
 *
 * Everything here is derived from the same accounts as the triage, so the page
 * makes no extra network calls to show them. */
export type Totals = {
  pools: number;
  open: number;
  running: number;
  settled: number;
  abandoned: number;
  byType: { survivor: number; loser: number; league: number; other: number };
  members: number;
  paidMembers: number;
  /** Sum of every pool's recorded dues. What has been played for, all time. */
  volume: bigint;
  /** Dues held by pools that have not settled or been refunded. */
  escrowed: bigint;
  /** The largest single pool by dues. */
  biggest: bigint;
};

export function totals(pools: PoolWithAddress[]): Totals {
  const t: Totals = {
    pools: 0,
    open: 0,
    running: 0,
    settled: 0,
    abandoned: 0,
    byType: { survivor: 0, loser: 0, league: 0, other: 0 },
    members: 0,
    paidMembers: 0,
    volume: BigInt(0),
    escrowed: BigInt(0),
    biggest: BigInt(0),
  };

  for (const { pool } of pools) {
    t.pools += 1;
    t.members += pool.memberCount;
    t.paidMembers += pool.paidMembers;
    t.volume += pool.totalDues;
    if (pool.totalDues > t.biggest) t.biggest = pool.totalDues;

    if (pool.status === STATUS_OPEN) t.open += 1;
    else if (pool.status === STATUS_SETTLED || pool.status === STATUS_SHEET_FINALIZED)
      t.settled += 1;
    else if (pool.status === STATUS_ABANDONED) t.abandoned += 1;
    else t.running += 1;

    const live =
      pool.status !== STATUS_SETTLED &&
      pool.status !== STATUS_SHEET_FINALIZED &&
      pool.status !== STATUS_ABANDONED;
    if (live) t.escrowed += pool.totalDues;

    if (pool.poolType === POOL_LEAGUE) t.byType.league += 1;
    else if (pool.poolType === 0) t.byType.survivor += 1;
    else if (pool.poolType === 1) t.byType.loser += 1;
    else t.byType.other += 1;
  }
  return t;
}

/* A pool's one-word state, for a table.
 *
 * `WEEK_NONE` is 0 and a real week is never 0, which is what lets "no week
 * pending" be told apart from "week zero" without a second field. */
export function stateLabel(pool: PoolView): string {
  switch (pool.status) {
    case STATUS_OPEN:
      return "Open";
    case STATUS_LOCKED:
      return `Week ${pool.currentWeek} locked`;
    case STATUS_RESULTS_POSTED:
      return pool.pendingWeek === WEEK_NONE
        ? "Results posted"
        : `Week ${pool.pendingWeek} in dispute`;
    case STATUS_FINALIZED:
      return `Week ${pool.finalizedWeek} settling`;
    case STATUS_SETTLED:
      return "Settled";
    case STATUS_ABANDONED:
      return "Abandoned";
    case STATUS_SHEET_POSTED:
      return "Sheet in dispute";
    case STATUS_SHEET_FINALIZED:
      return "Sheet finalized";
    default:
      return `Status ${pool.status}`;
  }
}
