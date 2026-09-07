/* The game has to be checkable without watching it.
 *
 * COMMISH BOWL WAS FIRST OPENED IN A PREVIEW THAT RUNS NO
 * requestAnimationFrame. Everything sat perfectly still, and there was no way
 * at all to tell a broken simulation from a paused one — the canvas was frozen
 * either way. That is the argument for lib/bowl.ts being a pile of pure
 * functions rather than a closure inside a component, and this file is what
 * that split buys: a hundred downs in a millisecond, on a machine with no
 * browser on it.
 *
 * These are not aesthetic tests. Every one of them is a way the game could
 * ship broken and look fine in a screenshot.
 */

import { expect } from "chai";

import {
  body,
  BOTTOM,
  DOWNS,
  GOAL,
  gainOf,
  kickoff,
  newWorld,
  nextDown,
  SPIN_TICKS,
  START,
  step,
  TO_GAIN,
  TOP,
  toGo,
  WORLD,
  YARD,
  yardLine,
  type Input,
  type Tick,
  type World,
} from "../src/lib/bowl";

const RIGHT: Input = { dx: 1, dy: 0 };
const STILL: Input = { dx: 0, dy: 0 };

/** Play out a down and report what happened and after how many ticks. A cap,
 *  because a bug that leaves a play unresolvable should fail the test rather
 *  than hang the suite. */
function playOut(
  w: World,
  input: (tick: number, w: World) => Input,
  cap = 2000,
): { result: Tick; ticks: number } {
  for (let i = 0; i < cap; i++) {
    const result = step(w, input(i, w));
    if (result !== "live") return { result, ticks: i + 1 };
  }
  return { result: "live", ticks: cap };
}

const started = (): World => {
  const w = newWorld();
  kickoff(w);
  return w;
};

describe("Commish Bowl", () => {
  describe("the play resolves", () => {
    it("tackles a runner who stands still, quickly", () => {
      const { result, ticks } = playOut(started(), () => STILL);
      expect(result).to.equal("tackled");
      /* A window, not a number. Standing still has to be punished — if this
         ever runs long the pursuit has stopped pursuing — but it must not be
         punished instantly either: three blockers holding the rush off a
         stationary back for a couple of seconds is the blocking doing its
         job, and an upper bound of exactly two seconds once failed this test
         for the good reason that the blocking had just got better. */
      expect(ticks).to.be.above(10);
      expect(ticks).to.be.below(150);
    });

    it("never leaves a play running forever, whatever the input", () => {
      // Nine fixed directions, including the corners and the sidelines, each
      // held for a whole play. Every one of them has to end.
      const dirs = [-1, 0, 1];
      for (const dx of dirs) {
        for (const dy of dirs) {
          const { result } = playOut(started(), () => ({ dx, dy }));
          expect(result, `holding (${dx}, ${dy})`).to.not.equal("live");
        }
      }
    });

    it("scores when the runner reaches the endzone", () => {
      const w = started();
      // No defence: this is about the goal line firing, not about beating
      // anybody. Blockers stay, and must not interfere with the runner.
      w.defence = [];
      const { result } = playOut(w, () => RIGHT);
      expect(result).to.equal("touchdown");
      expect(w.runner.x).to.be.at.least(GOAL);
    });

    it("counts a touchdown that happens on the same tick as a tackle", () => {
      const w = started();
      // One defender standing exactly on the goal line, and the runner one
      // stride short of it. Both conditions land on the same tick; the sport
      // says that is a touchdown, and a game that ate it would be wrong in a
      // way nobody watching could diagnose.
      w.runner.x = GOAL - 1;
      w.defence = [body(GOAL, w.runner.y, 1.5, 0, 1)];
      w.blockers = [];
      expect(step(w, RIGHT)).to.equal("touchdown");
    });
  });

  describe("the runner stays on the field", () => {
    it("holds inside the sidelines however long you push at them", () => {
      for (const dy of [-1, 1]) {
        const w = started();
        w.defence = [];
        for (let i = 0; i < 300; i++) step(w, { dx: 0, dy });
        expect(w.runner.y).to.be.at.least(TOP);
        expect(w.runner.y).to.be.at.most(BOTTOM);
      }
    });

    it("holds inside the ends of the world", () => {
      const w = started();
      w.defence = [];
      for (let i = 0; i < 400; i++) step(w, { dx: -1, dy: 0 });
      expect(w.runner.x).to.be.at.least(4);
      expect(w.runner.x).to.be.below(WORLD);
    });

    it("keeps every defender inside the sidelines too", () => {
      const w = started();
      for (let i = 0; i < 40; i++) {
        if (step(w, { dx: 0, dy: -1 }) !== "live") break;
      }
      for (const d of w.defence) {
        expect(d.y).to.be.at.least(TOP);
        expect(d.y).to.be.at.most(BOTTOM);
      }
    });
  });

  describe("the spin", () => {
    it("is spent once and cannot be re-triggered by holding the key", () => {
      const w = started();
      w.defence = [];
      step(w, { ...RIGHT, spin: true });
      expect(w.spinUsed).to.equal(true);
      // Run the boost out, then ask for it again every single tick.
      for (let i = 0; i < SPIN_TICKS + 5; i++) step(w, { ...RIGHT, spin: true });
      expect(w.spin).to.equal(0);
    });

    it("actually makes the runner faster while it lasts", () => {
      const plain = started();
      const spun = started();
      plain.defence = [];
      spun.defence = [];
      const plainStart = plain.runner.x;
      const spunStart = spun.runner.x;
      for (let i = 0; i < SPIN_TICKS; i++) {
        step(plain, RIGHT);
        step(spun, { ...RIGHT, spin: i === 0 });
      }
      expect(spun.runner.x - spunStart).to.be.above(plain.runner.x - plainStart);
    });

    it("comes back on the next play", () => {
      const w = started();
      step(w, { ...RIGHT, spin: true });
      expect(w.spinUsed).to.equal(true);
      nextDown(w);
      kickoff(w);
      expect(w.spinUsed).to.equal(false);
      expect(w.spin).to.equal(0);
    });
  });

  describe("downs and the chains", () => {
    it("puts the ball where the runner went down", () => {
      const w = started();
      playOut(w, () => RIGHT);
      const gain = gainOf(w);
      nextDown(w);
      expect(w.los).to.equal(w.runner.x);
      // The scoreboard and the simulation have to agree about where the ball
      // is. They come from the same number and it is still worth pinning: a
      // units mix-up between pixels and yards is invisible on screen.
      expect(yardLine(w)).to.equal(20 + gain);
    });

    it("takes the next down when short of the marker", () => {
      const w = started();
      // Two yards, nowhere near the ten needed.
      w.runner.x = w.los + 2 * YARD;
      expect(nextDown(w)).to.equal("next-down");
      expect(w.down).to.equal(2);
    });

    it("resets to first down and moves the chains when the marker is reached", () => {
      const w = started();
      w.down = 3;
      const marker = w.marker;
      w.runner.x = marker + 3;
      expect(nextDown(w)).to.equal("first-down");
      expect(w.down).to.equal(1);
      expect(w.marker).to.equal(w.los + TO_GAIN);
      expect(w.marker).to.be.above(marker);
    });

    it("never puts the marker past the goal line", () => {
      const w = started();
      // Deep in opposition territory: the chains cannot ask for ten more
      // yards when there are not ten left, and a game that showed "1st & 10"
      // with six to the endzone would be lying on the scoreboard.
      w.runner.x = GOAL - 4 * YARD;
      nextDown(w);
      expect(w.marker).to.equal(GOAL);
      expect(toGo(w)).to.equal(4);
    });

    it("never reports a negative gain", () => {
      const w = started();
      w.defence = [];
      for (let i = 0; i < 30; i++) step(w, { dx: -1, dy: 0 });
      expect(gainOf(w)).to.equal(0);
    });

    it("turns it over on fourth down and not before", () => {
      const w = started();
      for (let d = 1; d < DOWNS; d++) {
        expect(nextDown(w), `down ${d}`).to.equal("next-down");
      }
      expect(w.down).to.equal(DOWNS);
      expect(nextDown(w)).to.equal("turnover");
    });

    it("starts a drive at your own 20, first and ten, eighty from the endzone", () => {
      const w = newWorld();
      expect(w.los).to.equal(START);
      expect(w.down).to.equal(1);
      expect(yardLine(w)).to.equal(20);
      expect(toGo(w)).to.equal(10);
      expect(Math.round((GOAL - w.los) / YARD)).to.equal(80);
    });
  });

  describe("the defence is beatable but not asleep", () => {
    it("gives up ground to a runner who moves, compared with one who does not", () => {
      const still = started();
      playOut(still, () => STILL);

      // Straight down the sideline: not an optimal run, just a moving one.
      const running = started();
      playOut(running, () => ({ dx: 1, dy: -0.35 }));

      expect(gainOf(running)).to.be.above(gainOf(still));
    });

    it("does not let a straight-line sprint walk in untouched", () => {
      // The whole game is that a defence takes an angle on you. If running
      // right and nothing else scored, there would be no game here.
      const { result } = playOut(started(), () => RIGHT);
      expect(result).to.equal("tackled");
    });

    it("is deterministic: the same inputs give the same play twice", () => {
      const script = (i: number): Input => ({
        dx: 1,
        dy: Math.sin(i / 7),
        spin: i === 20,
      });
      const a = started();
      const b = started();
      const ra = playOut(a, script);
      const rb = playOut(b, script);
      expect(ra).to.deep.equal(rb);
      expect(a.runner.x).to.equal(b.runner.x);
      expect(a.runner.y).to.equal(b.runner.y);
    });
  });
});
