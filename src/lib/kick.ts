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
 *  alone. */
export const TEE_NEAR = 0.62;

/* AND THE LONGEST: 75 YARDS, AND WHY IT STOPS THERE.
 *
 * The ladder used to end at 66, which was a choice rather than a limit, and
 * players ran out of game there. Two things bound how far back it can go, and
 * it was worth measuring which one actually binds.
 *
 * The page does not. Measured at 1366x768, the 66-yard spot already puts the
 * ball on the headline's last line, so walking it further left changes nothing
 * a visitor sees; it stays clear of the left end zone's lettering until about
 * 78 yards.
 *
 * The leg does. A full-power kick carries about 0.85 of the field before it
 * runs out of legs (see `launch`), so from 78 yards only a perfect 1.0 on the
 * power meter gets there, and a meter peak is a single frame. 75 yards needs
 * about 0.89 or better: the top eleventh of the sweep, around a fifth of a
 * second each time the bar passes, shown green on the yardage meter so it can
 * be learned. Hard, fair, and a finale rather than a coin toss.
 *
 * The ladder in between keeps the old spacing of roughly three and a half
 * yards a rung, so the power a kick needs rises smoothly from nothing at 44 to
 * that top eleventh at 75 rather than jumping at the end. */
export const TEE_FAR = 0.17;

/** Makes required to walk the tee all the way back. */
export const LADDER = 9;

/** Kicks in a clean run: one from every spot, the last from TEE_FAR. */
export const LEVELS = LADDER + 1;

/* CLEARING THE LADDER.
 *
 * A miss has always sent the ball back to the start, so a run is a streak: a
 * make from every spot in a row. The ladder used to top out and then simply
 * keep offering the longest kick forever, with no end and nothing for getting
 * there. Now a make from the final spot finishes the run. `madeBefore` is the
 * streak going into the kick, which is the spot it was taken from. */
export function clearsTheLadder(madeBefore: number, good: boolean): boolean {
  return good && madeBefore >= LADDER;
}

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

/* THE METER READING, FOLDED OUT OF THE RAW SWEEP.
 *
 * The sweep runs 0 to 2 and wraps, which is a cheap way to get a bar that
 * travels up and back so the moment to press arrives twice a cycle instead of
 * once. What it is NOT is the value the meter is showing: past 1 the bar is on
 * its way back down, and the reading is 2 minus the sweep.
 *
 * That fold was missing, and it went wrong in three places at once rather than
 * one. The bar was drawn at `width * sweep`, so on the return half it ran to
 * TWICE the track and overshot the black — which is the visible symptom. Worse,
 * the captured values were raw too: power arrived here as 0..2 against a
 * function documented for 0..1, and aim as sweep*2-1, which is -1..3 against a
 * function documented for -1..1. So the meters had been handing the simulation
 * values outside the domain every test in kick.test.ts exercises.
 *
 * One function now, used by the bar, by power and by aim, so the number drawn
 * and the number played are the same number. */
export function meterReading(sweep: number): number {
  const v = ((sweep % 2) + 2) % 2; // tolerate a negative or a runaway sweep
  return v <= 1 ? v : 2 - v;
}

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

/* THE WIND GAUGE.
 *
 * The whole difficulty of this game is holding a line against a crosswind, and
 * until now the crosswind was invisible. It was also decided at the moment the
 * aim was set, so even a gauge could not have helped: the number did not exist
 * yet when it mattered. The component now draws each attempt's wind before the
 * attempt starts and shows it throughout, which is what makes aiming a
 * decision instead of a guess.
 *
 * Read in miles an hour because that is how a kicker reads a flag, and every
 * kicking game since the NES has put it on screen that way. It is a display
 * scale, not physics: WIND_MAX is the strongest gust the tests proved is still
 * makeable from the longest spot, and it reads as 20. */
export const WIND_MPH_MAX = 20;

/** The crosswind as a kicker reads it off the flags: 0 to 20 mph. */
export function windMph(wind: number): number {
  const strength = Math.min(Math.abs(wind), WIND_MAX) / WIND_MAX;
  return Math.round(strength * WIND_MPH_MAX);
}

/** Which way the wind carries the ball.
 *
 * The field is drawn top-down with y growing downward, and `stepShot` adds the
 * wind to y every frame, so a positive wind carries the ball toward the bottom
 * sideline. "Calm" is anything that rounds to 0 mph, so the arrow never points
 * at a wind the number says is not there. */
export function windDrift(wind: number): "up" | "down" | "calm" {
  if (windMph(wind) === 0) return "calm";
  return wind > 0 ? "down" : "up";
}

/* THE YARDAGE METER, AND THE PROMISE IT MAKES.
 *
 * The number in the corner has always said how far away the posts are. What
 * it never said is how far THIS kick will go, which is the only thing the
 * power bar is asking you to decide. So while power is sweeping, a second
 * number reads the carry live, green when it has the distance and red when it
 * will die short.
 *
 * A meter that reads green and then falls short is worse than no meter, so the
 * rules below are chosen so that cannot happen:
 *
 *   Carry is measured by flying a kick, not by formula. The flight constants
 *   live in `launch` and `stepShot`, and a second copy of them here is exactly
 *   how the meter would drift from the kick the first time either was touched.
 *
 *   Whether it reaches is asked of the real simulation, `resolve`, for a
 *   straight kick in still air. Aim and wind can still miss it wide; the meter
 *   answers only whether the leg is there, which is the only thing power sets.
 *
 *   The number is clamped against the colour at the boundary. Both are rounded
 *   yards, and a raw reading can tie the posts' distance while falling a hair
 *   short. So a kick that makes it never reads short of the posts, and one that
 *   does not never reads as far as them. */

/** How far a kick at this power travels before it runs out of legs, as a share
 *  of the field's width. */
export function carryFor(power: number): number {
  const p = Math.min(1, Math.max(0, power));
  // Far enough back that it can never reach the posts, so it flies to the end.
  const start = -10;
  const s = launch(start, p, 0, 0);
  while (stepShot(s) === "flying") {
    // Fly it. `stepShot` advances the ball and reports when it is done.
  }
  return s.x - start;
}

/** Does a straight kick at this power, in still air, reach the posts? */
export function reachesPosts(tee: number, power: number): boolean {
  return resolve(tee, Math.min(1, Math.max(0, power)), 0, 0).outcome === "good";
}

export type Readout = { yards: number; reaches: boolean };

/** What the yardage meter shows for this spot and power. */
export function kickReadout(tee: number, power: number): Readout {
  const reaches = reachesPosts(tee, power);
  const spot = yardsFor(tee);
  /* The longest field goal this power can make: the spot a kick of this carry
   * would arrive at the bar from. On the same scale as the spot's own label,
   * so the two numbers on screen can be compared by eye. */
  const raw = yardsFor(BAR_X - carryFor(power));
  const yards = reaches ? Math.max(raw, spot) : Math.min(raw, spot - 1);
  return { yards, reaches };
}
