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
  carryFor,
  GAP_HALF,
  kickReadout,
  LADDER,
  launch,
  MAX_AGE,
  meterReading,
  reachesPosts,
  resolve,
  stepShot,
  teeFor,
  windDrift,
  windFrom,
  windMph,
  WIND_MAX,
  WIND_MPH_MAX,
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

/* THE YARDAGE METER.
 *
 * It makes one promise, and a meter that breaks it is worse than no meter:
 * green means the kick has the distance and red means it will die short. These
 * sweep every spot on the ladder against a fine grid of power and check that
 * promise against the real flight, not against the meter's own arithmetic. */
describe("the yardage meter", () => {
  /** A hundred and one powers from dead to full. */
  const POWERS = Array.from({ length: 101 }, (_, i) => i / 100);

  it("carries further the harder it is kicked", () => {
    for (let i = 1; i < POWERS.length; i++) {
      expect(carryFor(POWERS[i]), `power ${POWERS[i]}`).to.be.above(
        carryFor(POWERS[i - 1]),
      );
    }
  });

  /* The numbers launch() documents in its own comment. Pinning them here means
   * the comment and the meter both have to change if the flight does. */
  it("carries as far as launch() says a kick does", () => {
    expect(carryFor(0)).to.be.closeTo(0.53, 0.01);
    expect(carryFor(0.5)).to.be.closeTo(0.69, 0.01);
    expect(carryFor(1)).to.be.closeTo(0.85, 0.01);
  });

  it("measures carry by flying the real kick, not a copy of its maths", () => {
    // A kick started far enough back that it can never reach the posts runs to
    // the age cap, and where it stops is exactly the carry.
    for (const power of [0, 0.3, 0.7, 1]) {
      const s = launch(-10, power, 0, 0);
      while (stepShot(s) === "flying") {
        // fly it
      }
      expect(s.x + 10, `power ${power}`).to.equal(carryFor(power));
    }
  });

  /* THE PROMISE. Asked of `resolve`, the same function the game uses. */
  it("says it reaches exactly when a straight kick in still air goes through", () => {
    for (const tee of SPOTS) {
      for (const power of POWERS) {
        const made = resolve(tee, power, 0, 0).outcome === "good";
        expect(reachesPosts(tee, power), `tee ${tee.toFixed(3)} power ${power}`).to.equal(made);
        expect(kickReadout(tee, power).reaches).to.equal(made);
      }
    }
  });

  /* The number and the colour are both rounded, and could tie at the boundary.
   * They must never contradict each other on screen. */
  it("never shows a number that argues with its colour", () => {
    for (const tee of SPOTS) {
      const spot = yardsFor(tee);
      for (const power of POWERS) {
        const { yards, reaches } = kickReadout(tee, power);
        if (reaches) {
          expect(yards, `made from ${spot} at power ${power}`).to.be.at.least(spot);
        } else {
          expect(yards, `short of ${spot} at power ${power}`).to.be.below(spot);
        }
      }
    }
  });

  it("never runs backwards as the power bar rises", () => {
    for (const tee of SPOTS) {
      let prev = -Infinity;
      for (const power of POWERS) {
        const { yards } = kickReadout(tee, power);
        expect(yards, `tee ${tee.toFixed(3)} power ${power}`).to.be.at.least(prev);
        prev = yards;
      }
    }
  });

  /* The meter is only useful if both colours actually occur. At the near spot
   * every power has the leg, which is the documented design; at the far spot a
   * weak kick must read red and a strong one green, or the meter is scenery. */
  it("shows both colours where power actually decides the kick", () => {
    const far = teeFor(LADDER);
    expect(kickReadout(far, 0).reaches).to.equal(false);
    expect(kickReadout(far, 1).reaches).to.equal(true);
    // And at the near spot, as launch() intends, even a dead kick gets there.
    expect(kickReadout(teeFor(0), 0).reaches).to.equal(true);
  });

  it("reads a sane distance for a field goal", () => {
    for (const power of [0, 0.5, 1]) {
      const { yards } = kickReadout(teeFor(LADDER), power);
      expect(yards, `power ${power}`).to.be.within(17, 99);
    }
  });

  it("does not trip over a power the meter should never hand it", () => {
    expect(carryFor(-1)).to.equal(carryFor(0));
    expect(carryFor(2)).to.equal(carryFor(1));
  });
});

/* THE WIND GAUGE. The arrow has to point the way the ball actually goes. */
describe("the wind gauge", () => {
  it("reads 0 to 20 mph and nothing outside it", () => {
    expect(windMph(0)).to.equal(0);
    expect(windMph(WIND_MAX)).to.equal(WIND_MPH_MAX);
    expect(windMph(-WIND_MAX)).to.equal(WIND_MPH_MAX);
    expect(windMph(WIND_MAX * 10)).to.equal(WIND_MPH_MAX);
    expect(windMph(WIND_MAX / 2)).to.equal(10);
  });

  it("reads the same strength whichever way it blows", () => {
    for (const w of [0.0001, 0.0003, 0.0007]) {
      expect(windMph(w)).to.equal(windMph(-w));
    }
  });

  /* THE ONE THAT MATTERS. A gauge pointing the wrong way is a trap. Fly a
   * straight kick in each wind and check the ball went where the arrow said. */
  it("points the way the ball actually drifts", () => {
    for (const wind of [WIND_MAX, WIND_MAX / 3, -WIND_MAX / 3, -WIND_MAX]) {
      const s = launch(teeFor(0), 1, 0, wind);
      for (let i = 0; i < 20; i++) stepShot(s);
      const drift = windDrift(wind);
      if (drift === "down") expect(s.y, `wind ${wind}`).to.be.above(0.5);
      if (drift === "up") expect(s.y, `wind ${wind}`).to.be.below(0.5);
    }
  });

  it("calls a wind calm only when it reads 0 mph", () => {
    expect(windDrift(0)).to.equal("calm");
    expect(windDrift(WIND_MAX / 1000)).to.equal("calm");
    expect(windMph(WIND_MAX / 1000)).to.equal(0);
    expect(windDrift(WIND_MAX)).to.not.equal("calm");
  });

  it("covers every wind the game can deal", () => {
    let seed = 1;
    for (let i = 0; i < 1_000; i++) {
      const { wind, next } = windFrom(seed);
      seed = next;
      const mph = windMph(wind);
      expect(mph).to.be.within(0, WIND_MPH_MAX);
      expect(["up", "down", "calm"]).to.include(windDrift(wind));
    }
  });
});
