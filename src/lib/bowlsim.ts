/* A WHOLE GAME WITH NOBODY HOLDING THE CONTROLS.
 *
 * The computer coaches both sides and plays every snap through the same
 * functions the component calls: the stage machine in lib/bowlgame.ts, the
 * plays in lib/bowlplay.ts, and the kicks in lib/fieldgoal.ts. The tests play
 * hundreds of games through it and check that every one ends, that the score
 * is a football score, that overtime resolves, and that the clock only ever
 * runs one way.
 *
 * It drives the stages in exactly the order the component does, so a bug in
 * the order shows up here first. It does not share the component's code,
 * because the component's code is a React closure, and that is the whole
 * reason the rules live in plain modules.
 */

import {
  applyExtraPoint,
  applyFieldGoal,
  applyKickoff,
  applyPunt,
  applyScrimmage,
  beforeSnap,
  callTimeout,
  callToss,
  chooseOpening,
  chooseTry,
  computerDefense,
  computerOffense,
  computerOnside,
  computerTimeout,
  computerTry,
  effects,
  type Game,
  losX,
  markerX,
  newGame,
  rival,
  startOvertime,
  startSecondHalf,
  type Team,
  windFor,
} from "@/lib/bowlgame";
import {
  computerKickoff,
  computerOnside as onsideKick,
  computerPunt,
  kickoff,
  punt,
  runPlay,
  scrimmage,
} from "@/lib/bowlplay";
import { type Conditions, kickWind } from "@/lib/conditions";
import { computerKick, fieldGoalDistance, PAT_DISTANCE, resolveKick } from "@/lib/fieldgoal";
import { roll, type Rng, seeded } from "@/lib/rng";

export type SimSummary = { game: Game; snaps: number };

/** One step of the game: whatever the current stage asks for, with the
 *  computer deciding for both teams. */
export function simulateStep(g: Game, r: Rng): void {
  const s = g.stage;
  const fx = effects(g);
  const seed = Math.floor(roll(r) * 2 ** 31);

  switch (s.kind) {
    case "toss": {
      callToss(g, roll(r) < 0.5 ? "heads" : "tails");
      return;
    }
    case "choose": {
      chooseOpening(g, roll(r) < 0.7 ? "kick" : "receive");
      return;
    }
    case "halftime":
      startSecondHalf(g);
      return;
    case "overtime":
      startOvertime(g);
      return;
    case "final":
      return;
    case "kickoff": {
      const onside = computerOnside(g);
      const p = kickoff({
        tee: losX(g),
        onside,
        human: null,
        fx,
        wind: windFor(g, s.kicker),
        seed,
      });
      p.kick = onside ? onsideKick(r) : computerKickoff(r);
      applyKickoff(g, runPlay(p));
      return;
    }
    case "try": {
      if (computerTry(g) === "two") {
        chooseTry(g, "two");
        return;
      }
      const w = kickWind(windFor(g, s.team));
      const input = computerKick(r, PAT_DISTANCE, w, fx.carry);
      applyExtraPoint(g, resolveKick(PAT_DISTANCE, input, w, fx.carry).outcome === "good");
      return;
    }
    case "two": {
      const p = scrimmage({
        los: losX(g),
        marker: markerX(g),
        off: roll(r) < 0.5 ? "short" : "run",
        def: computerDefense(g, rival(s.team)),
        human: null,
        fx,
        wind: windFor(g, s.team),
        seed,
      });
      applyScrimmage(g, runPlay(p));
      return;
    }
    case "scrimmage": {
      const offense: Team = g.possession;
      const defence = rival(offense);
      if (computerTimeout(g, offense)) callTimeout(g, offense);
      else if (computerTimeout(g, defence)) callTimeout(g, defence);
      if (!beforeSnap(g)) return;
      const call = computerOffense(g, offense);
      const wind = windFor(g, offense);
      if (call === "punt") {
        const p = punt({ los: losX(g), human: null, fx, wind, seed });
        p.kick = computerPunt(r, 100 - g.ballOn, fx.carry);
        applyPunt(g, runPlay(p));
        return;
      }
      if (call === "field-goal") {
        const distance = fieldGoalDistance(100 - g.ballOn);
        const w = kickWind(wind);
        const input = computerKick(r, distance, w, fx.carry);
        applyFieldGoal(g, resolveKick(distance, input, w, fx.carry).outcome === "good");
        return;
      }
      const p = scrimmage({
        los: losX(g),
        marker: markerX(g),
        off: call,
        def: computerDefense(g, defence),
        human: null,
        fx,
        wind,
        seed,
      });
      applyScrimmage(g, runPlay(p));
      return;
    }
  }
}

/** Play a game to the final whistle, or to a cap that a correct game never
 *  reaches: a guard against a rule that loops, not a length. */
export function simulateGame(
  conditions: Conditions,
  teams: [number, number],
  seed: number,
  cap = 3000,
): SimSummary {
  const g = newGame(conditions, teams, seed);
  const r = seeded(seed * 2654435761 + 1);
  let snaps = 0;
  while (g.stage.kind !== "final" && snaps < cap) {
    simulateStep(g, r);
    snaps += 1;
  }
  return { game: g, snaps };
}
