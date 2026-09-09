/* The oracle's one rule, pinned: it posts on agreement and refuses on anything
 * else. Every refusal here is a way a real week could go wrong, and each one
 * must come back as "do not post" with a reason, never as a mask that is
 * merely plausible.
 */

import { expect } from "chai";

import { teamByAbbr } from "@/lib/nfl";
import type { Game as Fixture } from "@/lib/season";
import {
  decideWeek,
  struckDown,
  weekComplete,
  type Board,
  type Outcome,
} from "../workers/results-oracle/src/decide";

const bit = (abbr: string) => 1 << teamByAbbr(abbr)!.i;

const FIXTURES: Fixture[] = [
  { away: "NE", home: "SEA", kickoff: 1 },
  { away: "SF", home: "LAR", kickoff: 2 },
  { away: "TB", home: "CIN", kickoff: 3 },
];

const final = (
  home: string,
  away: string,
  winner: Outcome["winner"],
): Outcome => ({ home, away, final: true, winner });

const board = (source: string, games: Outcome[]): Board => ({ source, games });

const ALL_HOME = [final("SEA", "NE", "home"), final("LAR", "SF", "home"), final("CIN", "TB", "home")];

describe("the results oracle's decision", () => {
  it("posts when two feeds agree on every game", () => {
    const v = decideWeek(FIXTURES, [board("espn", ALL_HOME), board("apisports", ALL_HOME)]);
    expect(v.post).to.equal(true);
    if (!v.post) return;
    expect(v.winners).to.equal(bit("SEA") | bit("LAR") | bit("CIN"));
    expect(v.pushes).to.equal(0);
    expect(v.games).to.equal(3);
  });

  it("refuses with one feed when two are required", () => {
    const v = decideWeek(FIXTURES, [board("espn", ALL_HOME)]);
    expect(v.post).to.equal(false);
    if (v.post) return;
    expect(v.reason).to.include("only 1 feed");
  });

  it("refuses when the feeds disagree on a winner, and names the game", () => {
    const other = [final("SEA", "NE", "away"), ALL_HOME[1], ALL_HOME[2]];
    const v = decideWeek(FIXTURES, [board("espn", ALL_HOME), board("apisports", other)]);
    expect(v.post).to.equal(false);
    if (v.post) return;
    expect(v.reason).to.include("disagree on NE@SEA");
    expect(v.reason).to.include("espn says home");
    expect(v.reason).to.include("apisports says away");
  });

  it("refuses while any game is still in progress on any feed", () => {
    const live = [ALL_HOME[0], ALL_HOME[1], { ...ALL_HOME[2], final: false, winner: null }];
    const v = decideWeek(FIXTURES, [board("espn", ALL_HOME), board("apisports", live)]);
    expect(v.post).to.equal(false);
    if (v.post) return;
    expect(v.reason).to.include("TB@CIN not final on apisports");
  });

  it("refuses when a fixture is missing from a feed", () => {
    const v = decideWeek(FIXTURES, [board("espn", ALL_HOME), board("apisports", ALL_HOME.slice(0, 2))]);
    expect(v.post).to.equal(false);
    if (v.post) return;
    expect(v.reason).to.include("TB@CIN missing from apisports");
  });

  it("ignores games a feed lists that are not in the fixtures", () => {
    const extra = [...ALL_HOME, final("KC", "DEN", "home")];
    const v = decideWeek(FIXTURES, [board("espn", extra), board("apisports", ALL_HOME)]);
    expect(v.post).to.equal(true);
    if (!v.post) return;
    expect(v.winners).to.equal(bit("SEA") | bit("LAR") | bit("CIN"));
  });

  it("treats a tie as a loss for both sides and posts the rest", () => {
    const tied = [final("SEA", "NE", "tie"), ALL_HOME[1], ALL_HOME[2]];
    const v = decideWeek(FIXTURES, [board("espn", tied), board("apisports", tied)]);
    expect(v.post).to.equal(true);
    if (!v.post) return;
    expect(v.winners).to.equal(bit("LAR") | bit("CIN"));
    expect(v.winners & bit("SEA")).to.equal(0);
    expect(v.winners & bit("NE")).to.equal(0);
  });

  it("never marks a push", () => {
    const v = decideWeek(FIXTURES, [board("espn", ALL_HOME), board("apisports", ALL_HOME)]);
    expect(v.post && v.pushes).to.equal(0);
  });

  it("refuses a feed that lists the same matchup twice", () => {
    const doubled = [...ALL_HOME, final("SEA", "NE", "away")];
    const v = decideWeek(FIXTURES, [board("espn", doubled), board("apisports", ALL_HOME)]);
    expect(v.post).to.equal(false);
    if (v.post) return;
    expect(v.reason).to.include("listed twice by espn");
  });

  it("can be told to accept one feed, and says so in the sources", () => {
    /* The knob exists so the owner can consciously run single-source. It is
     * not the default and the config comment says what it costs. */
    const v = decideWeek(FIXTURES, [board("espn", ALL_HOME)], 1);
    expect(v.post).to.equal(true);
    if (!v.post) return;
    expect(v.sources).to.deep.equal(["espn"]);
  });

  it("refuses an empty week rather than posting an empty mask", () => {
    const v = decideWeek([], [board("espn", []), board("apisports", [])]);
    expect(v.post).to.equal(false);
  });
});

describe("the gate on the metered feed", () => {
  it("opens only when the first feed has every fixture final", () => {
    const v = weekComplete(FIXTURES, board("espn", ALL_HOME));
    expect(v.complete).to.equal(true);
  });

  it("stays shut while any game is in progress, and says how many are done", () => {
    const live = [ALL_HOME[0], ALL_HOME[1], { ...ALL_HOME[2], final: false, winner: null }];
    const v = weekComplete(FIXTURES, board("espn", live));
    expect(v.complete).to.equal(false);
    if (v.complete) return;
    expect(v.reason).to.equal("2 of 3 games final on espn");
  });

  it("stays shut when a fixture is missing from the first feed", () => {
    const v = weekComplete(FIXTURES, board("espn", ALL_HOME.slice(1)));
    expect(v.complete).to.equal(false);
    if (v.complete) return;
    expect(v.reason).to.equal("NE@SEA missing from espn");
  });
});

describe("whether the members already struck this week down", () => {
  /* Week 2 of a pool: lock at 2000. The program leaves pending_posted_ts
   * alone when a veto clears a posting, which is the only trace there is. */
  const locks = [1000, 2000, 3000];

  it("is false for a week nobody has posted yet", () => {
    expect(struckDown({ pendingWeek: 0, pendingPostedTs: 0, currentWeek: 2, lockTs: locks })).to.equal(false);
  });

  it("is false when the timestamp is last week's, left over after finalize", () => {
    // Week 1 was posted at 1500, finalized, advanced. Nothing pending now.
    expect(struckDown({ pendingWeek: 0, pendingPostedTs: 1500, currentWeek: 2, lockTs: locks })).to.equal(false);
  });

  it("is true when something was posted after this week's lock and nothing is pending", () => {
    // Posted at 2400, vetoed: pending cleared, timestamp still there.
    expect(struckDown({ pendingWeek: 0, pendingPostedTs: 2400, currentWeek: 2, lockTs: locks })).to.equal(true);
  });

  it("is false while that posting is still pending, because that is a different state", () => {
    expect(struckDown({ pendingWeek: 2, pendingPostedTs: 2400, currentWeek: 2, lockTs: locks })).to.equal(false);
  });
});
