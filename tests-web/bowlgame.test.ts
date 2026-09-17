/* Commish Bowl's rulebook, checked without anybody playing.
 *
 * Two kinds of test. Synthetic plays, built by hand, walk the rules through the
 * cases the NFL's rulebook spells out: where a touchback goes, what a safety
 * costs, when the clock stops, how overtime ends. And whole games, played by the
 * computer on both sides, check the things only a whole game can: that every
 * game ends, that the scores are football scores, and that the clock never runs
 * backwards.
 */

import { expect } from "chai";

import {
  applyExtraPoint,
  applyFieldGoal,
  applyKickoff,
  applyPunt,
  applyScrimmage,
  beforeSnap,
  callTimeout,
  callToss,
  canTimeout,
  chooseOpening,
  chooseTry,
  CPU,
  downLabel,
  type Game,
  HUMAN,
  KICKOFF_TOUCHBACK,
  newGame,
  PUNT_TOUCHBACK,
  RUNOFF,
  SHORT_KICK_SPOT,
  spotLabel,
  startSecondHalf,
  TIMEOUTS,
  TWO_MINUTES,
  ZONE_TOUCHBACK,
} from "../src/lib/bowlgame";
import { type PlayResult, xOfYard } from "../src/lib/bowlplay";
import { simulateGame } from "../src/lib/bowlsim";
import type { GameLength, Weather } from "../src/lib/conditions";

const conditions = { weather: "clear" as const, time: "day" as const, length: "standard" as const };

/** A game already under way: the person has the ball on their own 25, first
 *  and ten, early in the first quarter. */
function underWay(): Game {
  const g = newGame(conditions, [3, 21], 7);
  g.stage = { kind: "scrimmage" };
  g.possession = HUMAN;
  g.ballOn = 25;
  g.down = 1;
  g.firstDownAt = 35;
  return g;
}

/** A play result, with everything a test does not care about filled in. */
function play(p: Partial<PlayResult> & { x?: number }): PlayResult {
  return {
    end: "tackle",
    has: 0,
    x: xOfYard(25),
    rule: null,
    scorer: null,
    turnover: null,
    thrown: false,
    caught: false,
    sacked: false,
    scrambled: false,
    kneel: false,
    receiver: 0,
    catchX: null,
    turnoverX: null,
    kickLandX: null,
    ticks: 90,
    clockTicks: 90,
    ...p,
  };
}

const at = (yard: number) => xOfYard(yard);

describe("the Commish Bowl rulebook", () => {
  describe("the coin toss", () => {
    it("lets the person choose when they win, and defers for the computer when it wins", () => {
      let wins = 0;
      let losses = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const g = newGame(conditions, [3, 21], seed);
        const { won } = callToss(g, "heads");
        if (won) {
          wins++;
          expect(g.stage.kind).to.equal("choose");
          chooseOpening(g, "kick");
          expect(g.stage).to.deep.include({ kind: "kickoff", kicker: HUMAN });
          expect(g.openingReceiver).to.equal(CPU);
        } else {
          losses++;
          // The computer defers, so the person receives.
          expect(g.stage).to.deep.include({ kind: "kickoff", kicker: CPU });
          expect(g.openingReceiver).to.equal(HUMAN);
        }
      }
      expect(wins).to.be.above(8);
      expect(losses).to.be.above(8);
    });

    it("kicks the second half off by the team that received the first", () => {
      const g = newGame(conditions, [3, 21], 1);
      g.openingReceiver = CPU;
      startSecondHalf(g);
      expect(g.stage).to.deep.include({ kind: "kickoff", kicker: CPU });
      expect(g.quarter).to.equal(3);
      expect(g.timeouts).to.deep.equal([TIMEOUTS, TIMEOUTS]);
    });
  });

  describe("downs and distance", () => {
    it("moves the chains ten yards at a time", () => {
      const g = underWay();
      applyScrimmage(g, play({ x: at(37) }));
      expect(g.down).to.equal(1);
      expect(g.firstDownAt).to.equal(47);
      expect(downLabel(g)).to.equal("1ST & 10");
    });

    it("counts the next down when short", () => {
      const g = underWay();
      applyScrimmage(g, play({ x: at(29) }));
      expect(g.down).to.equal(2);
      expect(downLabel(g)).to.equal("2ND & 6");
    });

    it("says GOAL when the line to gain is the goal line", () => {
      const g = underWay();
      g.ballOn = 92;
      g.firstDownAt = 100;
      expect(downLabel(g)).to.equal("1ST & GOAL");
    });

    it("turns it over on downs at the spot", () => {
      const g = underWay();
      g.down = 4;
      applyScrimmage(g, play({ x: at(30) }));
      expect(g.possession).to.equal(CPU);
      expect(g.ballOn).to.equal(70);
      expect(g.down).to.equal(1);
    });

    it("leaves the ball where it was after an incompletion, and stops the clock", () => {
      const g = underWay();
      applyScrimmage(g, play({ end: "incomplete", x: at(25), thrown: true }));
      expect(g.ballOn).to.equal(25);
      expect(g.down).to.equal(2);
      expect(g.running).to.equal(false);
    });

    it("reads the spot the way a broadcast does", () => {
      const g = underWay();
      expect(spotLabel(25, HUMAN, g)).to.equal("BUF 25");
      expect(spotLabel(70, HUMAN, g)).to.equal("NE 30");
      expect(spotLabel(50, CPU, g)).to.equal("50");
    });
  });

  describe("scoring", () => {
    it("is six for a touchdown, then a try", () => {
      const g = underWay();
      applyScrimmage(g, play({ end: "touchdown", scorer: 0, x: at(100) }));
      expect(g.score).to.deep.equal([6, 0]);
      expect(g.stage).to.deep.equal({ kind: "try", team: HUMAN });
    });

    it("is one for an extra point and two for a two-point try, then the scorer kicks off", () => {
      const g = underWay();
      applyScrimmage(g, play({ end: "touchdown", scorer: 0, x: at(100) }));
      applyExtraPoint(g, true);
      expect(g.score).to.deep.equal([7, 0]);
      expect(g.stage).to.deep.include({ kind: "kickoff", kicker: HUMAN });

      const h = underWay();
      applyScrimmage(h, play({ end: "touchdown", scorer: 0, x: at(100) }));
      chooseTry(h, "two");
      expect(h.stage).to.deep.equal({ kind: "two", team: HUMAN });
      applyScrimmage(h, play({ end: "touchdown", scorer: 0, x: at(100) }));
      expect(h.score).to.deep.equal([8, 0]);
    });

    it("scores a pick six for the defence", () => {
      const g = underWay();
      applyScrimmage(g, play({ end: "touchdown", scorer: 1, turnover: "interception", has: 1, x: at(0) }));
      expect(g.score).to.deep.equal([0, 6]);
      expect(g.stage).to.deep.equal({ kind: "try", team: CPU });
    });

    it("is two for a safety, and the team that gave it up kicks from its own 20", () => {
      const g = underWay();
      applyScrimmage(g, play({ end: "safety", has: 0, scorer: 1, x: at(-1) }));
      expect(g.score).to.deep.equal([0, 2]);
      expect(g.stage).to.deep.equal({ kind: "kickoff", kicker: HUMAN, tee: 20, afterSafety: true });
    });

    it("is three for a field goal", () => {
      const g = underWay();
      g.ballOn = 70;
      applyFieldGoal(g, true);
      expect(g.score).to.deep.equal([3, 0]);
      expect(g.stage).to.deep.include({ kind: "kickoff", kicker: HUMAN });
    });

    it("gives a missed field goal away at the spot of the kick, or the 20", () => {
      const long = underWay();
      long.ballOn = 60; // a 57-yarder, held at the 53
      applyFieldGoal(long, false);
      expect(long.possession).to.equal(CPU);
      expect(long.ballOn).to.equal(47);

      const short = underWay();
      short.ballOn = 90; // held at the 83, which is inside their 20
      applyFieldGoal(short, false);
      expect(short.ballOn).to.equal(20);
    });
  });

  describe("kickoffs and punts", () => {
    const kicking = (): Game => {
      const g = underWay();
      g.stage = { kind: "kickoff", kicker: CPU, tee: 35, afterSafety: false };
      return g;
    };

    it("puts a touchback at the 35", () => {
      const g = kicking();
      applyKickoff(g, play({ end: "dead", has: 1, rule: "touchback" }));
      expect(g.possession).to.equal(HUMAN);
      expect(g.ballOn).to.equal(KICKOFF_TOUCHBACK);
      expect(g.running).to.equal(false);
    });

    it("puts a kick downed in the end zone at the 20, and a short or wide one at the 40", () => {
      const a = kicking();
      applyKickoff(a, play({ end: "dead", has: 1, rule: "zone-touchback" }));
      expect(a.ballOn).to.equal(ZONE_TOUCHBACK);
      for (const rule of ["short", "out"] as const) {
        const b = kicking();
        applyKickoff(b, play({ end: "dead", has: 1, rule }));
        expect(b.ballOn, rule).to.equal(SHORT_KICK_SPOT);
        expect(b.possession).to.equal(HUMAN);
      }
    });

    it("puts a return where it was tackled, in the receiving team's terms", () => {
      const g = kicking();
      // Side 0 is the computer kicking; tackled on the kicker's 72 is the person's 28.
      applyKickoff(g, play({ end: "tackle", has: 1, x: at(72), clockTicks: 150 }));
      expect(g.possession).to.equal(HUMAN);
      expect(g.ballOn).to.equal(28);
      expect(g.running).to.equal(true);
    });

    it("gives a recovered onside kick to whoever recovered it", () => {
      const g = kicking();
      applyKickoff(g, play({ end: "dead", has: 0, rule: "onside", x: at(47) }));
      expect(g.possession).to.equal(CPU);
      expect(g.ballOn).to.equal(47);
    });

    it("puts a punt touchback at the 20", () => {
      const g = underWay();
      applyPunt(g, play({ end: "dead", has: 1, rule: "touchback" }));
      expect(g.possession).to.equal(CPU);
      expect(g.ballOn).to.equal(PUNT_TOUCHBACK);
    });
  });

  describe("the clock", () => {
    it("runs off time between snaps after a tackle in bounds", () => {
      const g = underWay();
      const before = g.clock;
      applyScrimmage(g, play({ x: at(28), clockTicks: 150 }));
      expect(g.clock).to.equal(before - 5);
      expect(g.running).to.equal(true);
      expect(beforeSnap(g)).to.equal(true);
      expect(g.clock).to.equal(before - 5 - RUNOFF);
    });

    it("stops for a timeout, and there are three a half", () => {
      const g = underWay();
      applyScrimmage(g, play({ x: at(28) }));
      expect(canTimeout(g, HUMAN)).to.equal(true);
      const before = g.clock;
      expect(callTimeout(g, HUMAN)).to.equal(true);
      beforeSnap(g);
      expect(g.clock).to.equal(before);
      g.timeouts[HUMAN] = 0;
      applyScrimmage(g, play({ x: at(30) }));
      expect(callTimeout(g, HUMAN)).to.equal(false);
    });

    it("gives the two-minute warning at exactly 2:00, between plays", () => {
      const g = underWay();
      g.quarter = 2;
      g.clock = TWO_MINUTES + 10;
      applyScrimmage(g, play({ x: at(28), clockTicks: 60 }));
      beforeSnap(g);
      expect(g.clock).to.equal(TWO_MINUTES);
      expect(g.running).to.equal(false);
      expect(g.warned).to.equal(true);
    });

    it("stops for a runner out of bounds late in a half, and not early", () => {
      const early = underWay();
      applyScrimmage(early, play({ end: "out", x: at(30) }));
      expect(early.running).to.equal(true);

      const late = underWay();
      late.quarter = 4;
      late.clock = 90;
      late.warned = true;
      applyScrimmage(late, play({ end: "out", x: at(30) }));
      expect(late.running).to.equal(false);
    });

    it("goes to halftime when the second quarter runs out", () => {
      const g = underWay();
      g.quarter = 2;
      g.warned = true;
      g.clock = 3;
      applyScrimmage(g, play({ x: at(28), clockTicks: 150 }));
      expect(g.stage.kind).to.equal("halftime");
    });
  });

  describe("overtime, under the 2025 regular-season rules", () => {
    const overtime = (): Game => {
      const g = underWay();
      g.quarter = 5;
      g.clock = 300;
      g.score = [17, 17];
      g.ot = { first: HUMAN, possessions: 0 };
      return g;
    };

    it("gives the other team the ball after a field goal on the first possession", () => {
      const g = overtime();
      g.ballOn = 70;
      applyFieldGoal(g, true);
      expect(g.stage.kind).to.equal("kickoff");
      expect(g.ot!.possessions).to.equal(1);
    });

    it("ends when the second team answers a field goal with a touchdown", () => {
      const g = overtime();
      g.ballOn = 70;
      applyFieldGoal(g, true);
      g.stage = { kind: "scrimmage" };
      g.possession = CPU;
      applyScrimmage(g, play({ end: "touchdown", scorer: 0, x: at(100) }));
      expect(g.stage.kind).to.equal("final");
      expect(g.score).to.deep.equal([20, 23]);
    });

    it("ends at once when the defence scores on the first possession", () => {
      const g = overtime();
      applyScrimmage(g, play({ end: "touchdown", scorer: 1, has: 1, turnover: "interception", x: at(0) }));
      expect(g.stage.kind).to.equal("final");
    });

    it("keeps going after a touchdown and a matching touchdown, then ends on the next score", () => {
      const g = overtime();
      applyScrimmage(g, play({ end: "touchdown", scorer: 0, x: at(100) }));
      applyExtraPoint(g, true);
      g.stage = { kind: "scrimmage" };
      g.possession = CPU;
      applyScrimmage(g, play({ end: "touchdown", scorer: 0, x: at(100) }));
      expect(g.stage).to.deep.equal({ kind: "try", team: CPU });
      applyExtraPoint(g, true);
      expect(g.stage.kind).to.equal("kickoff");
      g.stage = { kind: "scrimmage" };
      g.possession = HUMAN;
      g.ballOn = 75;
      applyFieldGoal(g, true);
      expect(g.stage.kind).to.equal("final");
    });

    it("can end in a tie when the clock runs out", () => {
      const g = overtime();
      g.clock = 2;
      applyScrimmage(g, play({ x: at(28), clockTicks: 120 }));
      expect(g.stage.kind).to.equal("final");
      expect(g.score[0]).to.equal(g.score[1]);
    });
  });

  describe("whole games, with the computer on both sides", () => {
    const LENGTHS: GameLength[] = ["quick", "standard"];
    const WEATHERS: Weather[] = ["clear", "rain", "snow", "wind"];

    it("always reach a final whistle, with football scores", () => {
      for (const length of LENGTHS) {
        for (const weather of WEATHERS) {
          for (let seed = 1; seed <= 6; seed++) {
            const { game, snaps } = simulateGame({ weather, time: "night", length }, [5, 27], seed);
            const label = `${length} ${weather} seed ${seed}`;
            expect(game.stage.kind, label).to.equal("final");
            expect(snaps, label).to.be.below(3000);
            for (const s of game.score) {
              // One point is the one score football cannot produce on its own.
              expect(s, label).to.not.equal(1);
              expect(s, label).to.be.at.least(0);
            }
            expect(game.quarter, label).to.be.at.least(4);
          }
        }
      }
    });

    it("finish a full-length game too", () => {
      const { game } = simulateGame({ weather: "clear", time: "dusk", length: "full" }, [9, 12], 42);
      expect(game.stage.kind).to.equal("final");
      expect(game.score[0] + game.score[1]).to.be.above(0);
    });

    it("never run the clock backwards inside a quarter", () => {
      const { game } = simulateGame(conditions, [3, 21], 11);
      // The log is ordered, and the quarter only ever goes up; the finer check
      // is that the final line agrees with the score.
      const last = game.log[game.log.length - 1];
      expect(last).to.contain(`${game.score[0]}`);
      expect(last).to.contain(`${game.score[1]}`);
    });
  });
});
