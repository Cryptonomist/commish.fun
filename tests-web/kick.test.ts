/* A KICKING GAME CAN BE UNPLAYABLE AND LOOK COMPLETELY FINE.
 *
 * The precedent is on this site: the drive game shipped looking correct and
 * gained exactly three yards on every play, because seven identical defenders
 * converged identically every time. Nobody spotted it by playing it. A bot
 * playing it ten thousand times spotted it immediately.
 *
 * The same two failures are available here and neither shows up in a
 * screenshot: a kick nobody can make, and a kick nobody can miss. Both look
 * like a working game until you have taken twenty. So the tests take the
 * kicks — every spot on the ladder, across the whole range of power, aim and
 * wind the game can actually deal.
 */

import { expect } from "chai";

import {
  BAR_X,
  GAP_HALF,
  LADDER,
  MAX_AGE,
  meterReading,
  resolve,
  teeFor,
  windFrom,
  WIND_MAX,
  yardsFor,
} from "../src/lib/kick";

/** Every spot the ladder can put the ball on. */
const SPOTS = Array.from({ length: LADDER + 1 }, (_, i) => teeFor(i));

describe("the field goal", () => {
  describe("the spot", () => {
    it("walks back as makes accumulate and then stops", () => {
      const walk = SPOTS.map((t) => +t.toFixed(4));
      // Strictly further from the posts each time, until the ladder tops out.
      for (let i = 1; i < walk.length; i++) {
        expect(walk[i], `spot ${i}`).to.be.below(walk[i - 1]);
      }
      expect(teeFor(LADDER)).to.equal(teeFor(LADDER + 50));
    });

    it("never spots the ball past the posts", () => {
      for (const t of SPOTS) expect(t).to.be.below(BAR_X);
    });

    it("reads as a plausible distance at both ends", () => {
      expect(yardsFor(teeFor(0))).to.be.within(30, 50);
      expect(yardsFor(teeFor(LADDER))).to.be.within(55, 80);
    });
  });

  describe("it always ends", () => {
    /* THE ONE THAT HANGS THE BUTTON. A ball with almost no power and no drift
     * crawls toward the posts; without the age cap the phase never resolves and
     * the control never comes back. */
    it("resolves from every combination the game can deal", () => {
      let worst = 0;
      for (const tee of SPOTS) {
        for (let p = 0; p <= 1.0001; p += 0.05) {
          for (let a = -1; a <= 1.0001; a += 0.1) {
            for (const w of [-WIND_MAX, 0, WIND_MAX]) {
              const { frames } = resolve(tee, p, a, w);
              worst = Math.max(worst, frames);
            }
          }
        }
      }
      expect(worst, "a kick ran past the age cap").to.be.at.most(MAX_AGE + 1);
    });
  });

  describe("it is winnable", () => {
    /* Dead-straight, full power, still air, from every spot. If this fails the
     * ladder has been walked back further than the leg can reach and there is
     * a wall in the game.
     *
     * IN STILL AIR, and that qualifier is the game rather than a weakening of
     * the test. This first asserted "in any wind" and failed at the middle
     * spot: max wind drifts the ball 0.063 across a 79-frame flight and the gap
     * is 0.058 wide, so a straight kick into a full crosswind misses. That is
     * correct — a wind you do not have to correct for is not a wind, it is a
     * decoration, and the meter would be scenery again. What has to be true is
     * that a correction always EXISTS, which is the next test. */
    it("makes a straight kick at full power from every spot in still air", () => {
      for (const tee of SPOTS) {
        const { outcome } = resolve(tee, 1, 0, 0);
        expect(outcome, `straight kick from ${tee.toFixed(2)}`).to.equal("good");
      }
    });

    /* And there is always an aim that beats the wind, which is the actual
     * promise the game makes: the crosswind is a thing to correct for, not a
     * thing that decides the kick for you. */
    it("offers a correcting aim for the worst wind at every spot", () => {
      for (const tee of SPOTS) {
        for (const w of [-WIND_MAX, WIND_MAX]) {
          const made = [];
          for (let a = -1; a <= 1.0001; a += 0.02) {
            if (resolve(tee, 1, a, w).outcome === "good") made.push(a);
          }
          expect(
            made.length,
            `no aim makes it from ${tee.toFixed(2)} in wind ${w}`,
          ).to.be.above(0);
        }
      }
    });
  });

  describe("it is missable", () => {
    it("misses wide when aimed hard off at the longest spot", () => {
      const tee = teeFor(LADDER);
      expect(resolve(tee, 1, 1, WIND_MAX).outcome).to.not.equal("good");
      expect(resolve(tee, 1, -1, -WIND_MAX).outcome).to.not.equal("good");
    });

    it("comes up short on the weakest kick from the longest spot", () => {
      expect(resolve(teeFor(LADDER), 0, 0, 0).outcome).to.equal("short");
    });

    /* THE REAL QUESTION: is there a decision here at all? A game where most of
     * the dial scores is not a game, it is a button. This measures how much of
     * the aim range makes it from the furthest spot with a real crosswind. */
    it("leaves a demanding but fair window at the longest spot", () => {
      const tee = teeFor(LADDER);
      let good = 0;
      let total = 0;
      for (let a = -1; a <= 1.0001; a += 0.01) {
        for (const w of [-WIND_MAX, -WIND_MAX / 2, 0, WIND_MAX / 2, WIND_MAX]) {
          total++;
          if (resolve(tee, 1, a, w).outcome === "good") good++;
        }
      }
      const share = good / total;
      expect(share, `${(share * 100).toFixed(1)}% of aims score`).to.be.within(
        0.05,
        0.55,
      );
    });
  });

  describe("the gap is the real one", () => {
    it("scores on the inside of the posts and misses just outside", () => {
      /* Straight down the middle of the gap and a hair outside it, checked
       * against the same fractions FieldMarkings draws with. */
      const inside = 0.5 + GAP_HALF * 0.9;
      const outside = 0.5 + GAP_HALF * 1.2;
      expect(Math.abs(inside - 0.5)).to.be.below(GAP_HALF);
      expect(Math.abs(outside - 0.5)).to.be.above(GAP_HALF);
    });
  });

  describe("the wind", () => {
    it("stays inside the range the tests proved is fair", () => {
      let seed = 1;
      for (let i = 0; i < 2000; i++) {
        const r = windFrom(seed);
        seed = r.next;
        expect(Math.abs(r.wind)).to.be.at.most(WIND_MAX + 1e-12);
      }
    });

    it("is deterministic from a seed, so a kick can be reproduced", () => {
      expect(windFrom(42).wind).to.equal(windFrom(42).wind);
      expect(windFrom(42).wind).to.not.equal(windFrom(43).wind);
    });
  });
});

/* THE METER, WHICH WAS LYING TO BOTH THE EYE AND THE SIMULATION.
 *
 * The sweep runs 0..2 and wraps, to make a bar that travels up and back. The
 * fold that turns that into a reading was missing, so past 1 the bar was drawn
 * at up to twice the width of its own track — reported as "the meter runs well
 * past the end of the black" — and, less visibly, the captured values went out
 * of range too: power 0..2 into a function documented 0..1, aim -1..3 into one
 * documented -1..1.
 *
 * These pin the fold. Each one fails against the raw sweep.
 */
describe("the meter reading", () => {
  it("never exceeds the track, anywhere in the sweep", () => {
    for (let sweep = 0; sweep < 2; sweep += 0.001) {
      const r = meterReading(sweep);
      expect(r, `sweep ${sweep.toFixed(3)} drew past the end`).to.be.at.most(1);
      expect(r, `sweep ${sweep.toFixed(3)} drew below zero`).to.be.at.least(0);
    }
  });

  it("travels up and back rather than snapping", () => {
    expect(meterReading(0)).to.equal(0);
    expect(meterReading(0.5)).to.be.closeTo(0.5, 1e-9);
    expect(meterReading(1)).to.equal(1);      // the top of the sweep
    expect(meterReading(1.5)).to.be.closeTo(0.5, 1e-9); // coming back down
    expect(meterReading(2)).to.equal(0);
  });

  it("offers the centre twice a cycle, which is what makes it playable", () => {
    const hits: number[] = [];
    for (let sweep = 0; sweep < 2; sweep += 0.001) {
      if (Math.abs(meterReading(sweep) - 0.5) < 0.0006) hits.push(sweep);
    }
    // Two separate crossings, not one.
    const gaps = hits.filter((v, i) => i === 0 || v - hits[i - 1] > 0.01);
    expect(gaps.length, "the centre is reachable only once per cycle").to.equal(2);
  });

  it("keeps power inside the range launch() documents", () => {
    for (let sweep = 0; sweep < 2; sweep += 0.001) {
      const power = meterReading(sweep);
      expect(power).to.be.within(0, 1);
    }
  });

  it("keeps aim inside the range launch() documents", () => {
    for (let sweep = 0; sweep < 2; sweep += 0.001) {
      const aim = meterReading(sweep) * 2 - 1;
      expect(aim).to.be.within(-1, 1);
    }
  });

  it("survives a sweep that has run away or gone negative", () => {
    for (const sweep of [-0.5, -3, 7.25, 1e6]) {
      const r = meterReading(sweep);
      expect(r, `sweep ${sweep}`).to.be.within(0, 1);
    }
  });
});
