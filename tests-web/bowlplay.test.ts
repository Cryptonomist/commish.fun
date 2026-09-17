/* Commish Bowl's plays have to be checkable without watching one.
 *
 * Same argument bowl.test.ts makes: the canvas cannot tell a broken play from a
 * paused one, and a play that looks fine can still be one that never ends,
 * scores from anywhere, or puts the ball in the wrong place. Every test here is
 * one of those.
 */

import { expect } from "chai";

import { BOTTOM, GOAL, OWN_GOAL, TOP, YARD } from "../src/lib/bowl";
import {
  computerKickoff,
  computerPunt,
  type Control,
  type DefCall,
  kickoff,
  MAX_TICKS,
  NO_CONTROL,
  type OffCall,
  type Play,
  punt,
  runPlay,
  scrimmage,
  stepPlay,
  xOfYard,
  yardOf,
} from "../src/lib/bowlplay";
import { EFFECTS } from "../src/lib/conditions";
import { seeded } from "../src/lib/rng";

const fx = EFFECTS.clear;
const calm = { x: 0, y: 0 };
const OFFS: OffCall[] = ["run", "short", "deep", "kneel"];
const DEFS: DefCall[] = ["run", "cover", "blitz"];

const snap = (off: OffCall, def: DefCall, seed = 1, yard = 40, human: 0 | 1 | null = null): Play =>
  scrimmage({
    los: xOfYard(yard),
    marker: xOfYard(Math.min(100, yard + 10)),
    off,
    def,
    human,
    fx,
    wind: calm,
    seed,
  });

const hold = (c: Partial<Control>) => (): Control => ({ ...NO_CONTROL, ...c });

describe("Commish Bowl plays", () => {
  describe("every play ends", () => {
    it("from scrimmage, for every call against every call", () => {
      for (const off of OFFS) {
        for (const def of DEFS) {
          for (let seed = 1; seed <= 12; seed++) {
            const p = snap(off, def, seed);
            const r = runPlay(p);
            expect(r.ticks, `${off} v ${def} seed ${seed}`).to.be.at.most(MAX_TICKS);
          }
        }
      }
    });

    it("with a person holding a direction the whole play, on either side", () => {
      for (const human of [0, 1] as const) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [0, 0],
        ]) {
          const p = snap("run", "cover", 5, 40, human);
          const r = runPlay(p, hold({ dx, dy }));
          expect(r.ticks, `side ${human} holding ${dx},${dy}`).to.be.at.most(MAX_TICKS);
        }
      }
    });

    it("on kickoffs and punts", () => {
      const r = seeded(4);
      for (let seed = 1; seed <= 40; seed++) {
        const k = kickoff({ tee: xOfYard(35), onside: seed % 8 === 0, human: null, fx, wind: calm, seed });
        k.kick = computerKickoff(r);
        expect(runPlay(k).ticks).to.be.at.most(MAX_TICKS);
        const p = punt({ los: xOfYard(25 + (seed % 50)), human: null, fx, wind: calm, seed });
        p.kick = computerPunt(r, 75 - (seed % 50), 1);
        expect(runPlay(p).ticks).to.be.at.most(MAX_TICKS);
      }
    });

    it("is deterministic: the same play with the same dice twice is the same play", () => {
      const a = runPlay(snap("deep", "cover", 99));
      const b = runPlay(snap("deep", "cover", 99));
      expect(a).to.deep.equal(b);
    });
  });

  describe("the formation", () => {
    it("gives the ball to the back on a run and the quarterback on a pass", () => {
      expect(snap("run", "run").carrier).to.equal(1);
      expect(snap("short", "run").carrier).to.equal(0);
      expect(snap("deep", "blitz").carrier).to.equal(0);
    });

    it("puts a person in charge of the ball carrier on offence and a linebacker on defence", () => {
      expect(snap("run", "run", 1, 40, 0).human).to.equal(1);
      const d = snap("run", "run", 1, 40, 1);
      expect(d.actors[d.human].role).to.equal("lb");
    });

    it("lines the offence up behind the ball and the defence in front of it", () => {
      const p = snap("short", "cover");
      for (const a of p.actors) {
        if (a.team === 0) expect(a.x, a.role).to.be.below(p.los + 4);
        else expect(a.x, a.role).to.be.above(p.los + 4);
      }
    });

    it("numbers the receivers a person can throw to", () => {
      const tags = snap("short", "run").actors.map((a) => a.tag).filter((t) => t > 0);
      expect(tags.sort()).to.deep.equal([1, 2, 3]);
    });
  });

  describe("scoring and the sidelines", () => {
    it("scores when a runner with nobody in front of him reaches the end zone", () => {
      const p = snap("run", "run", 3, 60, 0);
      p.actors = p.actors.filter((a) => a.team === 0);
      const r = runPlay(p, hold({ dx: 1 }));
      expect(r.end).to.equal("touchdown");
      expect(r.scorer).to.equal(0);
    });

    it("puts a runner pushing into the sideline out of bounds", () => {
      const p = snap("run", "cover", 3, 40, 0);
      p.actors = p.actors.filter((a) => a.team === 0);
      const r = runPlay(p, hold({ dy: -1 }));
      expect(r.end).to.equal("out");
      expect(p.actors[p.carrier].y).to.equal(TOP);
    });

    it("gives a safety when a runner goes down in his own end zone", () => {
      const p = snap("run", "run", 3, 2, 0);
      // Run backwards into the end zone and stand there to be caught.
      const r = runPlay(p, (pl) => ({ ...NO_CONTROL, dx: pl.actors[pl.carrier].x > OWN_GOAL - 20 ? -1 : 0 }));
      expect(r.end).to.equal("safety");
      expect(r.scorer).to.equal(1);
    });
  });

  describe("passing", () => {
    it("completes a throw to a receiver nobody is covering", () => {
      let caught = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const p = snap("short", "cover", seed, 30, 0);
        p.actors = p.actors.filter((a) => a.team === 0);
        const r = runPlay(p, (pl) => ({ ...NO_CONTROL, throwTo: pl.tick > 14 ? 1 : 0, dx: pl.thrown ? 1 : 0 }));
        if (r.caught) caught++;
      }
      expect(caught).to.be.at.least(16);
    });

    it("leaves the ball where it was on an incompletion", () => {
      for (let seed = 1; seed <= 60; seed++) {
        const p = snap("deep", "cover", seed);
        const r = runPlay(p);
        if (r.end === "incomplete") {
          expect(r.x).to.equal(p.los);
          expect(r.has).to.equal(0);
          return;
        }
      }
      expect.fail("sixty deep throws into coverage and not one incompletion");
    });

    it("sacks a quarterback who holds on to it", () => {
      const p = snap("deep", "blitz", 8, 40, 0);
      const r = runPlay(p, hold({}));
      expect(r.sacked).to.equal(true);
      expect(yardOf(r.x)).to.be.below(40);
    });

    it("cannot throw once the quarterback has run past the line", () => {
      const p = snap("short", "cover", 2, 40, 0);
      p.actors = p.actors.filter((a) => a.team === 0 || a.role === "s");
      let tick = 0;
      const r = runPlay(p, () => ({ ...NO_CONTROL, dx: 1, throwTo: ++tick > 60 ? 1 : 0 }));
      expect(r.thrown).to.equal(false);
      expect(r.scrambled).to.equal(true);
    });

    it("hands the ball back on an interception, and the return counts as a return", () => {
      let picked = 0;
      for (let seed = 1; seed <= 400 && picked === 0; seed++) {
        const p = snap("deep", "cover", seed);
        const r = runPlay(p);
        if (r.turnover === "interception") {
          picked++;
          expect(r.has === 1 || r.end === "touchdown" || r.rule === "touchback").to.equal(true);
        }
      }
      expect(picked).to.be.above(0);
    });
  });

  describe("kickoffs, under the 2026 rules", () => {
    const kick = (power: number, aim = 0, accuracy = 0, seed = 1) => {
      const p = kickoff({ tee: xOfYard(35), onside: false, human: null, fx, wind: calm, seed });
      p.kick = { power, aim, accuracy };
      return p;
    };

    it("freezes everybody but the kicker and the returner until the ball comes down", () => {
      const p = kick(0.6);
      const start = p.actors.map((a) => [a.x, a.y]);
      while (!p.result && !p.flight) stepPlay(p);
      while (!p.result && p.flight && p.flight.z > 0 && p.flight.bounces === 0 && p.carrier < 0) {
        stepPlay(p);
        // They may move on the very tick it comes down or is caught.
        const stillUp = p.flight !== null && p.flight.z > 0 && p.flight.bounces === 0 && p.carrier < 0;
        if (!stillUp) break;
        p.actors.forEach((a, i) => {
          if (a.role === "k" || a.role === "ret") return;
          expect([a.x, a.y], `${a.role} ${i} moved at tick ${p.tick}`).to.deep.equal(start[i]);
        });
      }
    });

    it("is a touchback when it goes deep into the end zone in the air", () => {
      expect(runPlay(kick(1)).rule).to.equal("touchback");
    });

    it("comes back to the 40 when it does not reach the landing zone", () => {
      expect(runPlay(kick(0)).rule).to.equal("short");
    });

    it("comes back to the 40 when it goes out of bounds", () => {
      expect(runPlay(kick(0.6, 25, 1)).rule).to.equal("out");
    });

    it("is returned from the landing zone", () => {
      const r = runPlay(kick(0.55));
      expect(r.rule).to.equal(null);
      expect(r.has === 1 || r.end === "touchdown").to.equal(true);
    });

    it("recovers about one onside kick in five for the kicking team", () => {
      let kept = 0;
      const n = 200;
      for (let seed = 1; seed <= n; seed++) {
        const p = kickoff({ tee: xOfYard(35), onside: true, human: null, fx, wind: calm, seed });
        p.kick = { power: 0.5, accuracy: 0, aim: 0 };
        const r = runPlay(p);
        expect(r.rule).to.equal("onside");
        if (r.has === 0) kept++;
      }
      expect(kept / n).to.be.within(0.1, 0.32);
    });
  });

  describe("punts", () => {
    const boot = (yard: number, power: number, human: 0 | 1 | null = null, seed = 1) => {
      const p = punt({ los: xOfYard(yard), human, fx, wind: calm, seed });
      p.kick = { power, accuracy: 0, aim: 0 };
      return p;
    };

    it("is a touchback when it lands in the end zone", () => {
      expect(runPlay(boot(55, 1)).rule).to.equal("touchback");
    });

    it("gives the receiving team the ball", () => {
      const r = runPlay(boot(20, 0.7));
      expect(r.has === 1 || r.end === "touchdown").to.equal(true);
    });

    it("lets a person on the return team call a fair catch", () => {
      const p = boot(20, 0.6, 1);
      const r = runPlay(p, (pl) => ({ ...NO_CONTROL, action: pl.flight !== null }));
      expect(r.rule).to.equal("fair-catch");
      expect(r.has).to.equal(1);
    });
  });

  it("keeps everybody inside the field whatever happens", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = snap(seed % 2 ? "short" : "run", seed % 3 === 0 ? "blitz" : "cover", seed, 50, seed % 2 ? 1 : 0);
      while (!p.result) {
        stepPlay(p, { ...NO_CONTROL, dx: Math.sin(p.tick / 9), dy: Math.cos(p.tick / 7), action: p.tick % 40 === 0 });
        for (const a of p.actors) {
          expect(a.y).to.be.within(TOP, BOTTOM);
          expect(a.x).to.be.within(0, GOAL + 10 * YARD);
        }
      }
    }
  });
});
