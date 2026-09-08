/* THE FIELD GOAL, AS ARITHMETIC. No React, no canvas, no window.
 *
 * Same split as lib/bowl.ts, and for the same reason. The last game on this
 * site looked completely fine and was not: every play gained exactly three
 * yards, and nothing found it until the simulation could be run ten thousand
 * times without a browser. The preview surface here runs zero animation frames,
 * so a kick cannot be taken by hand in the place this gets checked — which
 * leaves reading the code, and reading the code is what produced the last two
 * bugs on this page.
 *
 * So the flight is a pure function of four numbers and the tests take the kicks.
 *
 * TOP-DOWN, BECAUSE THE FIELD IS. From above, a field goal is a ball going away
 * from you that has to still be between two posts when it arrives. There is no
 * height and no crossbar in here, and there should not be: every other mark on
 * that hero is a plan view.
 */

/* GEOMETRY SHARED WITH FieldMarkings, by being the same numbers.
 *
 * The uprights there are a span of width 1.6% pinned to the container's right
 * edge, with the crossbar on that span's inner edge and the whole thing 11.6%
 * of the container height, centred. So the bar stands at 98.4% across and the
 * gap reaches 5.8% either side of the middle. 18 feet 6 inches over a 160-foot
 * field really is 11.6%: a goalpost is a narrow thing, and that is the point. */
export const BAR_X = 0.984;
export const GAP_HALF = 0.058;

/** Where the ball is spotted for the shortest kick, as a share of the width:
 *  far enough from the posts to be a kick, near enough to leave the headline
 *  alone. And the longest, once somebody has made a few. */
export const TEE_NEAR = 0.62;
export const TEE_FAR = 0.3;

/** Makes required to walk the tee all the way back. */
export const LADDER = 6;

/** A kick that has not arrived in this many steps never will. Without it a
 *  ball with almost no power drifts forever and the button never comes back. */
export const MAX_AGE = 150;

export type Shot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Constant sideways push for this attempt, which is the whole reason aiming
   *  is a decision rather than a formality. */
  wind: number;
  age: number;
};

export type Outcome = "flying" | "good" | "wide" | "short";

/** The spot, walked back as makes accumulate. */
export function teeFor(made: number): number {
  const t = Math.min(1, Math.max(0, made) / LADDER);
  return TEE_NEAR + (TEE_FAR - TEE_NEAR) * t;
}

/** Roughly what this kick would be called, for the label. The near spot is a
 *  chip and the far one is long but not absurd. */
export function yardsFor(tee: number): number {
  return 17 + Math.round((1 - tee) * 70);
}

/** `power` and `aim` are both what the meter handed over: power 0..1, aim
 *  -1..1 with 0 dead straight. */
export function launch(
  tee: number,
  power: number,
  aim: number,
  wind: number,
): Shot {
  /* POWER HAS TO BE ABLE TO FALL SHORT, and in the first version it could not.
   * It ran 0.35 + power * 0.75 over 0.019, which puts even a dead-zero kick
   * 0.703 of the way down the field inside the age cap — and the longest spot
   * is only 0.684 away. So the meter was scenery: mash it at any moment and a
   * seventy-yarder still went through. The test caught it on the first run.
   *
   * These numbers are chosen against the two distances that matter. With drag
   * at 0.995 a kick covers vx * 105.7 before the cap, so:
   *
   *   power 0    reaches 0.53 — clears the near spot's 0.364, dies well short
   *              of the far spot's 0.684
   *   power 0.5  reaches 0.69 — arrives at the far posts with nothing to spare
   *   power 1    reaches 0.85 — comfortable from anywhere on the ladder
   *
   * So at the near spot power is forgiving and at the far spot it is most of
   * the kick, which is the right way round.
   *
   * AIM IS SCALED DOWN HARD because it accumulates. A per-frame drift is
   * multiplied by a flight of about a hundred frames, and at the old 0.01 the
   * makeable band was under 4% of the meter's travel — not difficult, just
   * unfair. */
  return {
    x: tee,
    y: 0.5,
    vx: (0.5 + power * 0.3) * 0.01,
    vy: aim * 0.0016,
    wind,
    age: 0,
  };
}

/** One frame. Mutates, and reports what the ball has become. */
export function stepShot(s: Shot): Outcome {
  s.x += s.vx;
  s.y += s.vy + s.wind;
  /* Drag, so a weak kick actually runs out of legs rather than crawling to the
   * posts and counting. It is what makes power a real choice. */
  s.vx *= 0.995;
  s.age += 1;

  if (s.x >= BAR_X) {
    return Math.abs(s.y - 0.5) <= GAP_HALF ? "good" : "wide";
  }
  if (s.y < 0.06 || s.y > 0.94) return "wide";
  if (s.age > MAX_AGE) return "short";
  return "flying";
}

/** Take the whole kick. Used by the tests to play thousands of them, and by
 *  nothing else — the component steps frame by frame so it can draw. */
export function resolve(
  tee: number,
  power: number,
  aim: number,
  wind: number,
): { outcome: Exclude<Outcome, "flying">; frames: number } {
  const s = launch(tee, power, aim, wind);
  for (;;) {
    const o = stepShot(s);
    if (o !== "flying") return { outcome: o, frames: s.age };
  }
}

/** The strongest crosswind an attempt may draw. Exported so the test can prove
 *  the hardest kick in the game is still makeable. */
export const WIND_MAX = 0.0008;

/** Deterministic wind, so a run can be described and repeated when somebody
 *  says a particular kick felt wrong. */
export function windFrom(seed: number): { wind: number; next: number } {
  const next = (seed * 1664525 + 1013904223) >>> 0;
  return { wind: ((next >>> 16) / 65535 - 0.5) * 2 * WIND_MAX, next };
}
