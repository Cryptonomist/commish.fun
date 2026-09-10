/* The operations triage: what needs a person, and how long it has waited.
 *
 * These tests build PoolViews by hand rather than reading a chain, so every
 * state a pool can be stuck in is reachable including the ones that need a
 * fortnight of real time to occur. The states themselves come from
 * `constants.rs`, and the two suites that pin the timing floors are
 * `schedule.test.ts` here and `the_timing_floors_are_what_we_think` there.
 */

import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";

import {
  attentionFor,
  compareAttention,
  stateLabel,
  totals,
  triage,
  vetoMajority,
  type PoolWithAddress,
} from "@/lib/admin";
import { formatUsdc } from "@/lib/format";
import {
  POOL_LEAGUE,
  SLOT_CLAIMED,
  SLOT_FINALIZED,
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
import { MIN_POST_DELAY_SECS, WEEKS } from "@/lib/schedule";

const NOW = 1_800_000_000;
const HOUR = 3600;
const DAY = 24 * HOUR;
const KEY = PublicKey.default;

/** A pool with every field at a harmless default, overridden per test. */
function poolAt(over: Partial<PoolView> = {}): PoolView {
  return {
    commissioner: KEY,
    usdcMint: KEY,
    vault: KEY,
    name: "Test Pool",
    poolType: 0,
    buyIn: BigInt(20_000_000),
    maxMembers: 50,
    memberCount: 10,
    paidMembers: 10,
    aliveCount: 10,
    totalDues: BigInt(200_000_000),
    status: STATUS_OPEN,
    currentWeek: 1,
    duesDeadlineTs: NOW - DAY,
    refundDeadlineTs: NOW + 30 * DAY,
    refundPerMember: BigInt(0),
    lockTs: Array.from({ length: WEEKS }, (_, i) => NOW - DAY + i * 7 * DAY),
    disputeWindowSecs: 48 * HOUR,
    pendingWeek: 0,
    pendingWinners: 0,
    pendingPushes: 0,
    pendingPostedTs: 0,
    vetoCount: 0,
    vetoEpoch: 0,
    finalizedWeek: 0,
    aliveAtWeekStart: 0,
    processedThisWeek: 0,
    feeTreasury: KEY,
    winnersWeek: 0,
    winnersCount: 0,
    potPerWinner: BigInt(0),
    prizeSlots: [],
    slotCount: 0,
    ...over,
  };
}

const kinds = (p: PoolView, now = NOW) =>
  attentionFor(p, "addr", now).map((i) => i.kind);

describe("operations triage", () => {
  it("says nothing about a healthy open pool", () => {
    expect(kinds(poolAt())).to.deep.equal([]);
  });

  /* An abandoned pool is over. Nothing can happen to it, so nothing about it
   * is anybody's problem however odd its other fields look. */
  it("says nothing about an abandoned pool, whatever else is set", () => {
    const dead = poolAt({
      status: STATUS_ABANDONED,
      refundDeadlineTs: NOW - 10 * DAY,
      potPerWinner: BigInt(50_000_000),
    });
    expect(kinds(dead)).to.deep.equal([]);
  });

  it("holds a dispute window open without complaint until it closes", () => {
    const posted = poolAt({
      status: STATUS_RESULTS_POSTED,
      pendingWeek: 3,
      pendingPostedTs: NOW - HOUR,
    });
    expect(kinds(posted)).to.deep.equal([]);
    // One second past the window and it is somebody's job.
    const closed = poolAt({
      status: STATUS_RESULTS_POSTED,
      pendingWeek: 3,
      pendingPostedTs: NOW - 48 * HOUR - 1,
    });
    expect(kinds(closed)).to.deep.equal(["finalize-due"]);
  });

  it("dates a finalize from when the window closed, not from now", () => {
    const posted = NOW - 50 * HOUR;
    const [item] = attentionFor(
      poolAt({ status: STATUS_RESULTS_POSTED, pendingWeek: 3, pendingPostedTs: posted }),
      "addr",
      NOW,
    );
    expect(item.actionableSince).to.equal(posted + 48 * HOUR);
    expect(item.crank).to.equal("finalize_week");
  });

  it("counts the members left to settle", () => {
    const p = poolAt({
      status: STATUS_FINALIZED,
      finalizedWeek: 4,
      aliveAtWeekStart: 9,
      processedThisWeek: 6,
      pendingPostedTs: NOW - 50 * HOUR,
    });
    const [item] = attentionFor(p, "addr", NOW);
    expect(item.kind).to.equal("settle-due");
    expect(item.detail).to.contain("3 of 9");
    expect(item.crank).to.equal("settle_member");
  });

  it("moves to advance once every member is settled", () => {
    const p = poolAt({
      status: STATUS_FINALIZED,
      finalizedWeek: 4,
      aliveAtWeekStart: 9,
      processedThisWeek: 9,
      pendingPostedTs: NOW - 50 * HOUR,
    });
    expect(kinds(p)).to.deep.equal(["advance-due"]);
    expect(attentionFor(p, "addr", NOW)[0].crank).to.equal("advance_week");
  });

  /* A locked week is not late until the program would even accept a posting. */
  it("does not call results late before the program would take them", () => {
    const lock = NOW - HOUR;
    const locks = Array.from({ length: WEEKS }, () => lock);
    const p = poolAt({ status: STATUS_LOCKED, currentWeek: 1, lockTs: locks });
    expect(kinds(p)).to.deep.equal([]);
    // Past the posting floor, it is overdue.
    expect(kinds(p, lock + MIN_POST_DELAY_SECS + 1)).to.deep.equal([
      "results-overdue",
    ]);
  });

  it("reports veto pressure against the majority that would strike it", () => {
    const p = poolAt({
      status: STATUS_RESULTS_POSTED,
      pendingWeek: 2,
      pendingPostedTs: NOW - HOUR,
      vetoCount: 3,
      paidMembers: 10,
    });
    const [item] = attentionFor(p, "addr", NOW);
    expect(item.kind).to.equal("veto-pressure");
    expect(item.detail).to.contain("3 of the 6");
    expect(item.crank).to.equal(null);
  });

  it("counts a veto majority the way the program does", () => {
    expect(vetoMajority(10)).to.equal(6);
    expect(vetoMajority(9)).to.equal(5);
    expect(vetoMajority(1)).to.equal(1);
    expect(vetoMajority(2)).to.equal(2);
  });

  /* THE MOST URGENT THING ON THE PAGE. Past the refund deadline any paid
   * member can take their share and end the pool for everyone else, so a pot
   * that should have been won is one transaction from a pro-rata split. */
  it("puts an open deadman above everything else", () => {
    const p = poolAt({
      status: STATUS_FINALIZED,
      finalizedWeek: 18,
      aliveAtWeekStart: 4,
      processedThisWeek: 1,
      pendingPostedTs: NOW - 50 * HOUR,
      refundDeadlineTs: NOW - DAY,
    });
    const items = attentionFor(p, "addr", NOW).sort(compareAttention);
    expect(items.map((i) => i.kind)).to.deep.equal(["refund-open", "settle-due"]);
    expect(items[0].crank).to.equal("reclaim_dues");
  });

  it("does not call the deadman on a pool that already settled", () => {
    const p = poolAt({
      status: STATUS_SETTLED,
      refundDeadlineTs: NOW - DAY,
      winnersCount: 1,
      potPerWinner: BigInt(194_000_000),
    });
    expect(kinds(p)).to.deep.equal(["unclaimed-pot"]);
    expect(attentionFor(p, "addr", NOW)[0].detail).to.contain("$194.00");
  });

  it("chases a league sheet only once its window has closed", () => {
    const open = poolAt({
      poolType: POOL_LEAGUE,
      status: STATUS_SHEET_POSTED,
      pendingPostedTs: NOW - HOUR,
    });
    expect(kinds(open)).to.deep.equal([]);
    const closed = poolAt({
      poolType: POOL_LEAGUE,
      status: STATUS_SHEET_POSTED,
      pendingPostedTs: NOW - 49 * HOUR,
    });
    expect(kinds(closed)).to.deep.equal(["sheet-due"]);
  });

  it("counts prize slots still owed, and ignores the claimed ones", () => {
    let n = 0;
    const slot = (state: number) => ({
      index: n++,
      label: "1st",
      bps: 5_000,
      assignee: KEY,
      state,
    });
    const p = poolAt({
      poolType: POOL_LEAGUE,
      status: STATUS_SHEET_FINALIZED,
      slotCount: 3,
      prizeSlots: [slot(SLOT_CLAIMED), slot(SLOT_FINALIZED), slot(SLOT_FINALIZED)],
    });
    const [item] = attentionFor(p, "addr", NOW);
    expect(item.kind).to.equal("unclaimed-slots");
    expect(item.detail).to.contain("2 prize slots");

    const done = poolAt({
      poolType: POOL_LEAGUE,
      status: STATUS_SHEET_FINALIZED,
      slotCount: 2,
      prizeSlots: [slot(SLOT_CLAIMED), slot(SLOT_CLAIMED)],
    });
    expect(kinds(done)).to.deep.equal([]);
  });
});

describe("sorting the triage", () => {
  /* Worst kind first, and within a kind the one that has waited longest. That
   * ordering is the whole point: a week overdue by two days means the oracle
   * is down and nobody noticed. */
  it("puts the worst first and the stalest first within a kind", () => {
    const stuck = (name: string, posted: number): PoolWithAddress => ({
      address: name,
      pool: poolAt({
        name,
        status: STATUS_RESULTS_POSTED,
        pendingWeek: 2,
        pendingPostedTs: posted,
      }),
    });
    const list = triage(
      [
        stuck("recent", NOW - 49 * HOUR),
        {
          address: "dead",
          pool: poolAt({ name: "dead", refundDeadlineTs: NOW - DAY }),
        },
        stuck("ancient", NOW - 10 * DAY),
      ],
      NOW,
    );
    expect(list.map((i) => i.name)).to.deep.equal(["dead", "ancient", "recent"]);
  });

  it("returns an empty list when everything is healthy", () => {
    expect(triage([{ address: "a", pool: poolAt() }], NOW)).to.deep.equal([]);
    expect(triage([], NOW)).to.deep.equal([]);
  });
});

describe("the totals", () => {
  it("counts pools by state and by type", () => {
    const t = totals([
      { address: "a", pool: poolAt({ status: STATUS_OPEN }) },
      { address: "b", pool: poolAt({ status: STATUS_LOCKED }) },
      { address: "c", pool: poolAt({ status: STATUS_SETTLED }) },
      { address: "d", pool: poolAt({ status: STATUS_ABANDONED }) },
      { address: "e", pool: poolAt({ poolType: POOL_LEAGUE, status: STATUS_OPEN }) },
      { address: "f", pool: poolAt({ poolType: 1, status: STATUS_OPEN }) },
    ]);
    expect(t.pools).to.equal(6);
    expect(t.open).to.equal(3);
    expect(t.running).to.equal(1);
    expect(t.settled).to.equal(1);
    expect(t.abandoned).to.equal(1);
    expect(t.byType).to.deep.equal({ survivor: 4, loser: 1, league: 1, other: 0 });
  });

  /* Volume is everything ever played for; escrow is only what a vault still
   * holds. A settled or abandoned pool has paid its money out and must not go
   * on being counted as held, which is the number that would embarrass you if
   * it appeared anywhere public. */
  it("separates all-time volume from money still held", () => {
    const dues = BigInt(200_000_000);
    const t = totals([
      { address: "a", pool: poolAt({ status: STATUS_OPEN, totalDues: dues }) },
      { address: "b", pool: poolAt({ status: STATUS_SETTLED, totalDues: dues }) },
      { address: "c", pool: poolAt({ status: STATUS_ABANDONED, totalDues: dues }) },
      { address: "d", pool: poolAt({ status: STATUS_FINALIZED, totalDues: dues }) },
    ]);
    expect(t.volume).to.equal(dues * BigInt(4));
    expect(t.escrowed).to.equal(dues * BigInt(2));
    expect(t.biggest).to.equal(dues);
  });

  it("counts an empty program as zero rather than throwing", () => {
    const t = totals([]);
    expect(t.pools).to.equal(0);
    expect(t.volume).to.equal(BigInt(0));
    expect(t.escrowed).to.equal(BigInt(0));
  });
});

describe("labels", () => {
  it("names each state the way an operator thinks of it", () => {
    expect(stateLabel(poolAt({ status: STATUS_OPEN }))).to.equal("Open");
    expect(stateLabel(poolAt({ status: STATUS_LOCKED, currentWeek: 5 }))).to.equal(
      "Week 5 locked",
    );
    expect(
      stateLabel(poolAt({ status: STATUS_RESULTS_POSTED, pendingWeek: 5 })),
    ).to.equal("Week 5 in dispute");
    expect(
      stateLabel(poolAt({ status: STATUS_FINALIZED, finalizedWeek: 5 })),
    ).to.equal("Week 5 settling");
    expect(stateLabel(poolAt({ status: STATUS_SETTLED }))).to.equal("Settled");
    expect(stateLabel(poolAt({ status: STATUS_ABANDONED }))).to.equal("Abandoned");
  });

  /* Money is rendered by the site's one formatter rather than a second one
   * living here, so an amount on this page reads the way the same amount reads
   * on a pool page. */
  it("renders money through the site's own formatter", () => {
    expect(formatUsdc(BigInt(194_000_000))).to.equal("$194.00");
    expect(formatUsdc(BigInt(1_500_000))).to.equal("$1.50");
  });
});
