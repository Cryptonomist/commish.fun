/* The field goal has to be checkable without watching one.
 *
 * Same argument as bowl.test.ts and kick.test.ts: a kick that flies wrong looks
 * perfectly plausible in a screenshot, and the meters that promise how far a
 * kick will carry are only honest if something holds them to the flight. Every
 * test here is a way this could ship broken and look fine.
 */

import { expect } from "chai";

import {
  accuracyPeriod,
  aimFor,
  AIM_MAX,
  callFor,
  computerKick,
  CROSSBAR,
  fieldGoalDistance,
  GAP_HALF,
  kickFinished,
  launchKick,
  MAX_FLIGHT,
  needle,
  PAT_DISTANCE,
  powerFor,
  reach,
  resolveKick,
  stepKick,
  triangle,
  type KickInput,
} from "../src/lib/fieldgoal";
import { seeded } from "../src/lib/rng";

const CALM = { cross: 0, along: 0 };
const pure = (power: number, aim = 0): KickInput => ({ power, accuracy: 0, aim });

describe("the field goal, in three dimensions", () => {
  describe("the real measurements", () => {
    it("uses a ten-foot bar and uprights eighteen and a half feet apart", () => {
      expect(CROSSBAR * 3).to.be.closeTo(10, 1e-9);
      expect(GAP_HALF * 2 * 3).to.be.closeTo(18.5, 1e-9);
    });

    it("measures a field goal the way the league does, and an extra point as 33", () => {
      // The ball on the 25 is a 42-yard try: ten yards of end zone, seven of hold.
      expect(fieldGoalDistance(25)).to.equal(42);
      expect(PAT_DISTANCE).to.equal(33);
    });
  });

  describe("the leg", () => {
    it("reaches further the harder the ball is struck, all the way up the meter", () => {
      let last = -1;
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const r = reach(p, 0);
        expect(r, `power ${p.toFixed(2)}`).to.be.above(last);
        last = r;
      }
    });

    it("tops out a couple of yards past the league record in still, dry air", () => {
      // Sixty-eight is the record. A game whose best leg cannot beat it has no
      // long kick game in it, and one that beats it easily has no record.
      const best = reach(1, 0);
      expect(best).to.be.within(69, 73);
    });

    it("carries further with the wind behind it and shorter into it", () => {
      const still = reach(1, 0);
      expect(reach(1, 20)).to.be.above(still + 3);
      expect(reach(1, -20)).to.be.below(still - 3);
    });

    it("is shortened by snow and by rain", () => {
      expect(reach(1, 0, 0.92)).to.be.below(reach(1, 0, 0.96));
      expect(reach(1, 0, 0.96)).to.be.below(reach(1, 0, 1));
    });

    it("agrees with the flight: a pure kick at the power the meter asks for goes through", () => {
      for (const d of [25, 33, 45, 55, 65]) {
        const p = powerFor(d + 0.5, 0);
        expect(p, `${d} yards`).to.be.at.most(1);
        expect(resolveKick(d, pure(p), CALM).outcome, `${d} yards`).to.equal("good");
      }
    });

    it("agrees with the flight: a little less than that falls short", () => {
      for (const d of [33, 50, 65]) {
        const p = powerFor(d, 0) - 0.03;
        expect(resolveKick(d, pure(p), CALM).outcome, `${d} yards`).to.equal("short");
      }
    });

    it("says plainly when no leg reaches", () => {
      expect(powerFor(90, 0)).to.be.above(1);
      expect(resolveKick(90, pure(1), CALM).outcome).to.equal("short");
    });
  });

  describe("aim and the wind", () => {
    it("misses to the side the ball was pushed, and calls it that way", () => {
      // Long and hard across: a gust that moves a fifty-five yarder four yards.
      const right = resolveKick(55, pure(1), { cross: 24, along: 0 });
      const left = resolveKick(55, pure(1), { cross: -24, along: 0 });
      expect(right.outcome).to.equal("wide-right");
      expect(left.outcome).to.equal("wide-left");
    });

    it("can always be aimed back through the strongest crosswind the game deals", () => {
      for (const d of [30, 45, 55]) {
        for (const cross of [-24, 24]) {
          const wind = { cross, along: 0 };
          const power = Math.min(1, powerFor(d + 3, 0) + 0.05);
          const aim = aimFor(d, power, wind);
          expect(Math.abs(aim), `${d} yards, ${cross} mph`).to.be.below(AIM_MAX);
          expect(resolveKick(d, pure(power, aim), wind).outcome, `${d} yards, ${cross} mph`).to.equal(
            "good",
          );
        }
      }
    });

    it("hooks a mishit off line, and a bad enough one misses from anywhere", () => {
      expect(resolveKick(40, { power: 0.9, accuracy: 0.15, aim: 0 }, CALM).outcome).to.equal("good");
      expect(resolveKick(40, { power: 0.9, accuracy: 1, aim: 0 }, CALM).outcome).to.equal("wide-right");
      expect(resolveKick(40, { power: 0.9, accuracy: -1, aim: 0 }, CALM).outcome).to.equal("wide-left");
    });

    it("forgives a mishit less the longer the kick", () => {
      // The same half-miss that sneaks in from 35 does not from 60.
      const half = { power: 1, accuracy: 0.45, aim: 0 };
      expect(resolveKick(35, half, CALM).outcome).to.equal("good");
      expect(resolveKick(60, half, CALM).outcome).to.not.equal("good");
    });
  });

  describe("hardware", () => {
    /* Sweep the aim finely across the right upright and the power finely across
     * the bar. Somewhere in each sweep the ball has to touch metal, and when it
     * does the call and where the ball ends up have to agree. */
    it("rings the upright somewhere across a fine sweep, and the ball goes where the call says", () => {
      let rang = 0;
      for (let aim = 3.6; aim <= 4.8; aim += 0.01) {
        const k = launchKick(45, pure(0.95, aim), CALM);
        while (!k.resting && k.t < MAX_FLIGHT) stepKick(k);
        if (k.doink !== "upright") continue;
        rang++;
        if (k.outcome === "good") expect(k.z, `in off the post at ${aim}`).to.be.above(45);
        else expect(k.z, `out off the post at ${aim}`).to.be.below(45);
      }
      expect(rang).to.be.above(0);
    });

    it("rings the crossbar somewhere across a fine sweep of power", () => {
      let rang = 0;
      const lo = powerFor(50, 0) - 0.02;
      for (let p = lo; p <= lo + 0.04; p += 0.0005) {
        const r = resolveKick(50, pure(p), CALM);
        if (r.doink === "crossbar") rang++;
      }
      expect(rang).to.be.above(0);
    });
  });

  describe("it always ends", () => {
    it("decides and settles every kick the meters can hand over", () => {
      for (let power = 0; power <= 1; power += 0.125) {
        for (let accuracy = -1; accuracy <= 1; accuracy += 0.5) {
          for (const aim of [-AIM_MAX, 0, AIM_MAX]) {
            for (const along of [-24, 0, 24]) {
              const k = launchKick(50, { power, accuracy, aim }, { cross: 12, along });
              let ticks = 0;
              while (!kickFinished(k) && ticks < MAX_FLIGHT * 30 + 10) {
                stepKick(k);
                ticks++;
              }
              expect(kickFinished(k), `p${power} a${accuracy} aim${aim} w${along}`).to.equal(true);
              expect(k.outcome).to.not.equal(null);
            }
          }
        }
      }
    });

    it("is deterministic: the same kick twice is the same kick", () => {
      const input = { power: 0.83, accuracy: 0.21, aim: -2.5 };
      const wind = { cross: -9, along: 6 };
      expect(resolveKick(47, input, wind)).to.deep.equal(resolveKick(47, input, wind));
    });
  });

  describe("the meters", () => {
    it("sweeps power up and back inside 0..1", () => {
      for (let ph = -2; ph <= 3; ph += 0.01) {
        expect(triangle(ph)).to.be.within(0, 1);
      }
      expect(triangle(0)).to.equal(0);
      expect(triangle(0.5)).to.equal(1);
    });

    it("starts the accuracy needle dead centre and keeps it on the dial", () => {
      expect(needle(0)).to.be.closeTo(0, 1e-9);
      for (let ph = 0; ph <= 2; ph += 0.01) expect(needle(ph)).to.be.within(-1, 1);
    });

    it("runs the accuracy needle faster after a harder strike", () => {
      expect(accuracyPeriod(1)).to.be.below(accuracyPeriod(0.5));
      expect(accuracyPeriod(0.5)).to.be.below(accuracyPeriod(0));
    });
  });

  describe("the computer's kicker", () => {
    /* Not a number anybody typed: this is what the physics produces from a
     * kicker with a professional's spread. Held near the league's shape, which
     * is nearly automatic inside forty and a coin toss around sixty. */
    const rate = (d: number, wind = CALM) => {
      const r = seeded(d * 31 + 7);
      let made = 0;
      const n = 300;
      for (let i = 0; i < n; i++) {
        if (resolveKick(d, computerKick(r, d, wind), wind).outcome === "good") made++;
      }
      return made / n;
    };

    it("makes nearly all of its extra points", () => {
      expect(rate(PAT_DISTANCE)).to.be.above(0.88);
    });

    it("makes most from fifty and fewer the further back it goes", () => {
      const fifty = rate(50);
      const sixty = rate(60);
      const seventy = rate(70);
      expect(fifty).to.be.within(0.65, 0.93);
      expect(sixty).to.be.below(fifty);
      expect(seventy).to.be.below(sixty);
      expect(seventy).to.be.below(0.5);
    });

    it("reads the flag rather than kicking into a crosswind blind", () => {
      expect(rate(45, { cross: 18, along: 0 })).to.be.above(0.6);
    });
  });

  it("calls it the way a broadcast would, without a dash in sight", () => {
    const outcomes = ["good", "wide-left", "wide-right", "short"] as const;
    const doinks = [null, "upright", "crossbar"] as const;
    for (const o of outcomes) {
      for (const d of doinks) {
        const call = callFor(o, d);
        expect(call.length).to.be.above(3);
        expect(call).to.not.match(/[–—]/);
      }
    }
    expect(callFor("good", null)).to.equal("IT'S GOOD!");
  });
});
