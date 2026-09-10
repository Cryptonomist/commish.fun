/* Playoff bracket scoring, on the side of the wire the browser is on.
 *
 * THE POINT OF THESE. `src/lib/bracket.ts` duplicates `rules.rs` so a form can
 * refuse a nonsense entry before a wallet popup and a standings table can show
 * a score before the chain has settled. A duplicate is only worth having while
 * it agrees, so the worked examples below are the SAME ones `rules.rs` pins on
 * its side: a perfect NFL entry is 30, a perfect CFP entry is 28, and the
 * mixed entry scores 11. If either side drifts, one of the two suites goes red.
 */

import { expect } from "chai";

import {
  BRACKET_ROUNDS,
  BRACKET_ROUND_POINTS,
  FORMATS,
  MAX_BRACKET_SEEDS,
  MIN_BRACKET_SEEDS,
  bracketByes,
  bracketShape,
  bracketTotal,
  formatFor,
  ladderGroupBps,
  ladderMemberShare,
  payoutTable,
  perfectScore,
  perfectShare,
  pointsRemaining,
  type Standing,
  roundPoints,
  seedField,
  seedsIn,
  stillPerfect,
  survivesRound,
  validateBracket,
  type Bracket,
} from "@/lib/bracket";
import { slotAmount } from "@/lib/program";

const NFL = 14;
const CFP = 12;

/** Seeds as a mask, for building entries readably. */
const m = (...seeds: number[]) => seeds.reduce((acc, s) => acc | (1 << s), 0);

const nflEntry = (): Bracket => [m(0, 1, 2, 3, 4, 5), m(0, 1, 2, 3), m(0, 1), m(0)];

/** A CFP entry where all four byes win their quarter-final: legal, and the case
 *  a naive "round two is a subset of round one" rule would throw out. */
const cfpEntry = (): Bracket => [m(8, 9, 10, 11), m(0, 1, 2, 3), m(0, 1), m(0)];

describe("playoff bracket formats", () => {
  it("describes the two sports the way they are actually played", () => {
    expect(FORMATS.nfl.seeds).to.equal(NFL);
    expect(FORMATS.cfp.seeds).to.equal(CFP);
    expect(FORMATS.nfl.rounds).to.have.length(BRACKET_ROUNDS);
    expect(FORMATS.cfp.rounds).to.have.length(BRACKET_ROUNDS);
    expect(FORMATS.nfl.rounds[3]).to.equal("Super Bowl");
    expect(FORMATS.cfp.rounds[0]).to.equal("First Round");
  });

  /* The bye list and the arithmetic have to agree. They are derived
   * independently — one is typed out per sport, the other is `16 - seeds` —
   * so this is the check that a format was entered correctly. */
  it("rests exactly as many teams as the arithmetic says", () => {
    for (const f of [FORMATS.nfl, FORMATS.cfp]) {
      expect(f.byeSeeds.length, f.label).to.equal(bracketByes(f.seeds));
      for (const seed of f.byeSeeds) {
        expect(seed, `${f.label} bye seed`).to.be.lessThan(f.seeds);
      }
    }
    // The NFL rests the top seed in each conference, not the top two overall.
    expect(FORMATS.nfl.byeSeeds).to.deep.equal([0, 7]);
    expect(FORMATS.cfp.byeSeeds).to.deep.equal([0, 1, 2, 3]);
  });

  it("labels a seed the way its sport names it", () => {
    expect(FORMATS.nfl.seedLabel(0)).to.equal("AFC 1");
    expect(FORMATS.nfl.seedLabel(6)).to.equal("AFC 7");
    expect(FORMATS.nfl.seedLabel(7)).to.equal("NFC 1");
    expect(FORMATS.nfl.seedLabel(13)).to.equal("NFC 7");
    expect(FORMATS.cfp.seedLabel(0)).to.equal("1");
    expect(FORMATS.cfp.seedLabel(11)).to.equal("12");
  });

  it("only answers to the two keys it knows", () => {
    expect(formatFor("nfl")?.seeds).to.equal(NFL);
    expect(formatFor("cfp")?.seeds).to.equal(CFP);
    expect(formatFor("nba")).to.equal(null);
    expect(formatFor("")).to.equal(null);
  });
});

describe("bracket shape", () => {
  it("is what each sport plays", () => {
    expect(bracketShape(NFL)).to.deep.equal([6, 4, 2, 1]);
    expect(bracketShape(CFP)).to.deep.equal([4, 4, 2, 1]);
  });

  it("refuses a field with no four-round shape", () => {
    for (const seeds of [0, 1, 8, 17, 32, 2.5, NaN]) {
      expect(() => bracketShape(seeds), `${seeds}`).to.throw();
      expect(() => seedField(seeds), `${seeds}`).to.throw();
    }
    expect(bracketShape(MIN_BRACKET_SEEDS)[0]).to.equal(1);
    expect(bracketShape(MAX_BRACKET_SEEDS)[0]).to.equal(8);
    expect(bracketByes(MAX_BRACKET_SEEDS)).to.equal(0);
  });

  it("counts the field exactly", () => {
    expect(seedsIn(seedField(NFL))).to.have.length(14);
    expect(seedsIn(seedField(CFP))).to.have.length(12);
    // Seed 12 is in the NFL field and not in the CFP field.
    expect(seedsIn(seedField(NFL))).to.include(12);
    expect(seedsIn(seedField(CFP))).to.not.include(12);
  });
});

describe("validating an entry", () => {
  it("accepts a well-formed entry in both sports", () => {
    expect(validateBracket(nflEntry(), NFL)).to.equal(null);
    expect(validateBracket(cfpEntry(), CFP)).to.equal(null);
  });

  it("refuses a round with the wrong number of picks", () => {
    const short: Bracket = [...nflEntry()] as Bracket;
    short[0] = m(0, 1, 2, 3, 4);
    expect(validateBracket(short, NFL)?.round).to.equal(0);
    expect(validateBracket(short, NFL)?.message).to.contain("6");

    const twoChampions: Bracket = [...nflEntry()] as Bracket;
    twoChampions[3] = m(0, 1);
    expect(validateBracket(twoChampions, NFL)?.round).to.equal(3);

    expect(validateBracket([0, 0, 0, 0], NFL)).to.not.equal(null);
  });

  /* The one that counting alone would miss. */
  it("refuses a team that lost and then wins a later round", () => {
    const risen: Bracket = [...nflEntry()] as Bracket;
    risen[3] = m(2); // right count, but seed 2 is not in the conference round
    expect(validateBracket(risen, NFL)?.round).to.equal(3);
    expect(validateBracket(risen, NFL)?.message).to.contain("cannot come back");
  });

  it("lets bye teams appear in round two, but no more than rest", () => {
    const twoNew: Bracket = [m(0, 1, 2, 3, 4, 5), m(0, 1, 12, 13), m(0, 12), m(0)];
    expect(validateBracket(twoNew, NFL)).to.equal(null);

    const threeNew: Bracket = [m(0, 1, 2, 3, 4, 5), m(0, 11, 12, 13), m(0, 12), m(0)];
    expect(validateBracket(threeNew, NFL)?.round).to.equal(1);
  });

  it("refuses a seed the field does not have", () => {
    const entry: Bracket = [m(0, 1, 2, 3, 4, 12), m(0, 1, 2, 3), m(0, 1), m(0)];
    expect(validateBracket(entry, NFL)).to.equal(null);
    expect(validateBracket(entry, CFP)?.message).to.contain("not in this field");
  });
});

describe("what wins the pot", () => {
  it("carries an entry only when every game in the round is right", () => {
    const picks = m(0, 1, 2, 3);
    expect(survivesRound(picks, picks)).to.equal(true);
    expect(survivesRound(picks, m(0, 1, 2, 9))).to.equal(false);
    expect(survivesRound(picks, m(0, 1, 2))).to.equal(false);
    expect(survivesRound(picks, m(0, 1, 2, 3, 4))).to.equal(false);
  });

  /* The entry that finishes second is worth nothing, and the site has to be
   * able to say that without ambiguity. */
  it("ends an entry on one missed game, however well it scores after", () => {
    const entry = nflEntry();
    const results: Bracket = [m(0, 1, 2, 3, 4, 9), entry[1], entry[2], entry[3]];
    expect(stillPerfect(entry, results, BRACKET_ROUNDS)).to.equal(false);
    // Five of six, then three perfect rounds: 29 of a possible 30, and no pot.
    expect(bracketTotal(entry, results)).to.equal(29);
  });

  it("holds an entry perfect until a posted round says otherwise", () => {
    const entry = nflEntry();
    expect(stillPerfect(entry, [0, 0, 0, 0], 0)).to.equal(true);
    const twoRight: Bracket = [entry[0], entry[1], 0, 0];
    expect(stillPerfect(entry, twoRight, 2)).to.equal(true);
    const thirdWrong: Bracket = [entry[0], entry[1], m(0, 9), 0];
    expect(stillPerfect(entry, thirdWrong, 2)).to.equal(true);
    expect(stillPerfect(entry, thirdWrong, 3)).to.equal(false);
    // Asking past the end, or before the start, cannot read off the bracket.
    expect(stillPerfect(entry, entry, 99)).to.equal(true);
    expect(stillPerfect(entry, [0, 0, 0, 0], -1)).to.equal(true);
  });

  it("lets only a flawless entry survive the whole bracket", () => {
    const entry = nflEntry();
    expect(stillPerfect(entry, entry, BRACKET_ROUNDS)).to.equal(true);
    for (let r = 0; r < BRACKET_ROUNDS; r++) {
      const broken: Bracket = [...entry] as Bracket;
      broken[r] ^= m(0) | m(6);
      expect(stillPerfect(entry, broken, BRACKET_ROUNDS), `round ${r}`).to.equal(
        false,
      );
    }
  });
});

describe("who gets paid", () => {
  const LADDER_3 = [6_000, 3_000, 1_000];
  const LADDER_5 = [6_000, 2_500, 1_000, 300, 200];
  const POT = BigInt(1_000_000);

  /** Standings from scores, highest first. A perfect entry is flagged. */
  const stand = (...scores: (number | "perfect")[]): Standing[] =>
    scores.map((s, i) => ({
      wallet: `w${i}`,
      points: s === "perfect" ? 30 : s,
      perfect: s === "perfect",
    }));

  const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, BigInt(0));

  it("gives one perfect entry everything", () => {
    expect(payoutTable(stand("perfect", 22, 19), LADDER_3, POT)).to.deep.equal([
      BigInt(1_000_000),
      BigInt(0),
      BigInt(0),
    ]);
  });

  it("splits evenly between two perfect entries and ignores the ladder", () => {
    expect(
      payoutTable(stand("perfect", "perfect", 22), LADDER_3, POT),
    ).to.deep.equal([BigInt(500_000), BigInt(500_000), BigInt(0)]);
    // Three of them, and the dust stays in the vault.
    const three = payoutTable(stand("perfect", "perfect", "perfect"), LADDER_3, POT);
    expect(three).to.deep.equal([BigInt(333_333), BigInt(333_333), BigInt(333_333)]);
    expect(POT - sum(three)).to.equal(BigInt(1));
  });

  it("pays the ladder when nobody is perfect", () => {
    const paid = payoutTable(stand(26, 22, 19, 12), LADDER_3, POT);
    expect(paid).to.deep.equal([BigInt(600_000), BigInt(300_000), BigInt(100_000), BigInt(0)]);
    expect(sum(paid)).to.equal(POT);
  });

  it("splits the slots a tie spans", () => {
    // Two tied for second take the second and third slots, twenty each.
    expect(payoutTable(stand(26, 22, 22, 12), LADDER_3, POT)).to.deep.equal([
      BigInt(600_000),
      BigInt(200_000),
      BigInt(200_000),
      BigInt(0),
    ]);
    // Two tied for first take sixty and thirty, forty-five each.
    expect(payoutTable(stand(26, 26, 19, 4), LADDER_3, POT)).to.deep.equal([
      BigInt(450_000),
      BigInt(450_000),
      BigInt(100_000),
      BigInt(0),
    ]);
  });

  /* The bug a league on this program already walked into: a pool with fewer
   * members than slots must still pay out in full on settlement day. */
  it("pays out in full when the pool is smaller than the ladder", () => {
    const paid = payoutTable(stand(26, 22, 19), LADDER_5, POT);
    expect(paid).to.deep.equal([BigInt(600_000), BigInt(250_000), BigInt(150_000)]);
    expect(sum(paid)).to.equal(POT);
    expect(payoutTable(stand(26), LADDER_5, POT)).to.deep.equal([POT]);
    expect(payoutTable(stand(7, 7), LADDER_5, POT)).to.deep.equal([
      BigInt(500_000),
      BigInt(500_000),
    ]);
  });

  it("pays a finisher below the ladder nothing rather than throwing", () => {
    const paid = payoutTable(stand(26, 22, 19, 12, 9), LADDER_3, POT);
    expect(paid.slice(3)).to.deep.equal([BigInt(0), BigInt(0)]);
    expect(ladderGroupBps(LADDER_3, 9, 1, true)).to.equal(0);
  });

  /* The safety property. A vault can never be asked for more than it holds. */
  it("never overpays the pot, whatever the standings", () => {
    const ladders = [LADDER_3, LADDER_5, [10_000], [2_500, 2_500, 2_500, 2_500]];
    const boards = [
      stand(30),
      stand("perfect", "perfect", 4),
      stand(26, 22, 19),
      stand(26, 26, 26, 26),
      stand(26, 22, 22, 22, 4),
      stand(9, 9, 9, 9, 9, 9, 9),
      stand(30, 29, 28, 27, 26, 25, 24, 23, 22, 21),
    ];
    for (const ladder of ladders) {
      for (const board of boards) {
        for (const pot of [BigInt(0), BigInt(1), BigInt(7), BigInt(1_000_000), BigInt(999_999_999_999)]) {
          const total = sum(payoutTable(board, ladder, pot));
          expect(total <= pot, `${ladder} ${board.length} ${pot}`).to.equal(true);
          // Nothing stranded beyond rounding dust.
          expect(pot - total < BigInt(board.length + 1)).to.equal(true);
        }
      }
    }
  });

  /* A league's prize slots and a bracket's ladder are the same arithmetic, and
   * `slotAmount` in program.ts is the one the league already pays on. Pinned
   * here so the two cannot drift apart while both are described as "60/30/10". */
  it("pays a solo rank group exactly what a league prize slot pays", () => {
    for (const bps of [10_000, 6_000, 3_000, 1_000, 300, 1, 0]) {
      for (const pot of [BigInt(0), BigInt(7), BigInt(1_000_000), BigInt(123_456_789)]) {
        expect(ladderMemberShare(pot, bps, 1), `${bps} of ${pot}`).to.equal(
          slotAmount(bps, pot),
        );
      }
    }
  });

  it("refuses a group that covers more than the whole pot", () => {
    expect(() => ladderMemberShare(POT, 10_001, 1)).to.throw();
    expect(() => ladderMemberShare(POT, 5_000, 0)).to.throw();
    expect(() => perfectShare(POT, 0)).to.throw();
  });
});

describe("scoring", () => {
  /* THE NUMBERS RULES.RS PINS. If these two lines disagree with the Rust suite,
   * the site is showing a standing the chain will not pay out on. */
  it("gives a perfect entry the published score", () => {
    expect(perfectScore(NFL)).to.equal(30);
    expect(perfectScore(CFP)).to.equal(28);
    expect(bracketTotal(nflEntry(), nflEntry())).to.equal(30);
    expect(bracketTotal(cfpEntry(), cfpEntry())).to.equal(28);
  });

  it("gives an entry that got nothing right nothing", () => {
    const results: Bracket = [m(6, 7, 8, 9, 10, 11), m(6, 7, 8, 9), m(6, 7), m(6)];
    expect(bracketTotal(nflEntry(), results)).to.equal(0);
  });

  it("doubles every round", () => {
    expect([...BRACKET_ROUND_POINTS]).to.deep.equal([1, 2, 4, 8]);
    for (let r = 0; r < BRACKET_ROUNDS; r++) {
      expect(roundPoints(m(0), m(0), r)).to.equal(BRACKET_ROUND_POINTS[r]);
    }
    // A round that does not exist scores nothing rather than throwing.
    expect(roundPoints(m(0), m(0), BRACKET_ROUNDS)).to.equal(0);
    expect(roundPoints(m(0), m(0), -1)).to.equal(0);
  });

  it("scores only the teams an entry actually got right", () => {
    expect(roundPoints(m(0, 1, 2, 3), m(0, 1, 8, 9), 1)).to.equal(4);
    expect(roundPoints(0, m(0, 1, 8, 9), 1)).to.equal(0);
  });

  /* The same worked example as `scoring_round_by_round_agrees_with_scoring_all_at_once`
   * in rules.rs: three of six, two of four, one of two, champion wrong. */
  it("agrees round by round with the whole-entry total, and with Rust", () => {
    const results: Bracket = [m(0, 1, 2, 9, 10, 11), m(0, 1, 9, 10), m(0, 9), m(9)];
    let running = 0;
    for (let r = 0; r < BRACKET_ROUNDS; r++) {
      running += roundPoints(nflEntry()[r], results[r], r);
    }
    expect(running).to.equal(bracketTotal(nflEntry(), results));
    expect(running).to.equal(11);
  });

  /* An unposted round contributes nothing, which is what makes `bracketTotal`
   * usable as a live standing rather than only a final score. */
  it("counts only the rounds that have been posted", () => {
    const afterOne: Bracket = [m(0, 1, 2, 3, 4, 5), 0, 0, 0];
    expect(bracketTotal(nflEntry(), afterOne)).to.equal(6);
    expect(pointsRemaining(NFL, 1)).to.equal(24);
    expect(pointsRemaining(NFL, 0)).to.equal(perfectScore(NFL));
    expect(pointsRemaining(NFL, BRACKET_ROUNDS)).to.equal(0);
    // What is scored plus what is left is always the perfect score.
    expect(bracketTotal(nflEntry(), afterOne) + pointsRemaining(NFL, 1)).to.equal(
      perfectScore(NFL),
    );
  });

  it("never lets any entry beat a perfect one", () => {
    for (let seeds = MIN_BRACKET_SEEDS; seeds <= MAX_BRACKET_SEEDS; seeds++) {
      const shape = bracketShape(seeds);
      const everything = seedField(seeds);
      let most = 0;
      for (let r = 0; r < BRACKET_ROUNDS; r++) {
        most += roundPoints(everything, (1 << shape[r]) - 1, r);
      }
      expect(most, `${seeds} seeds`).to.equal(perfectScore(seeds));
    }
  });
});
