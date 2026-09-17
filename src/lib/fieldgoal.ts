/* THE FIELD GOAL, IN THREE DIMENSIONS. No React, no canvas, no window.
 *
 * lib/kick.ts is the homepage's field goal and it is a plan view on purpose:
 * that hero is a top-down field, so its kick is a ball that has to still be
 * between two posts when it arrives. The arcade's kicks are seen from behind the
 * kicker, and from there a field goal is the thing it really is: a ball that
 * has to be high enough to clear a bar ten feet up and narrow enough to pass
 * between two uprights eighteen and a half feet apart, having been pushed about
 * by the wind the whole way.
 *
 * Shared by both games on /arcade. Commish Bowl kicks its field goals and extra
 * points through it and the long kick game is nothing but it, so a make means
 * the same thing in both.
 *
 * UNITS ARE YARDS AND SECONDS, because a field goal is measured in yards and a
 * football field is marked in them. The kick spot is the origin: +z runs
 * downfield toward the posts, +x is the kicker's right, +y is up.
 *
 * Everything here is deterministic. The dice are the meters, and the meters
 * belong to whoever is holding the controls.
 */

import type { KickWind } from "@/lib/conditions";
import { between, normal, type Rng } from "@/lib/rng";

/* ------------------------------------------------------- the real numbers */

export const GRAVITY = 10.73; // yards per second squared
export const MPH = 0.48889; // yards per second in one mile an hour
export const CROSSBAR = 10 / 3; // ten feet
export const GAP_HALF = 18.5 / 6; // half of eighteen feet six inches
export const UPRIGHT_TOP = 15; // the uprights stand 35 feet above the bar
export const BALL_R = 0.1; // near enough a football's half-width

/** The longest a kick is judged over. A ball that has not come down by then
 *  never will, and the button has to come back. */
export const MAX_FLIGHT = 10;

/** An extra point is snapped from the 15, which the league calls a 33-yard
 *  kick. A field goal's length is the line of scrimmage plus seventeen: ten
 *  for the end zone and seven for the hold. */
export const PAT_DISTANCE = 33;
export const fieldGoalDistance = (yardsToGoal: number): number => yardsToGoal + 17;

/* ------------------------------------------------------ the tuned numbers */

/* THE LEG. Tuned so a straight kick at full power in still, dry air clears the
 * bar from about seventy yards, which is two past the league record and short of
 * the seventy-yarder that was kicked in a preseason game. Wind and weather move
 * that either way; a strong tailwind makes the high seventies possible, which
 * is what gives the long kick game somewhere to go.
 *
 * The drag coefficient is not a guess at a football's aerodynamics. It is
 * whatever makes power matter all the way up the meter: without drag a kick's
 * reach grows with the square of its speed and the top of the meter is a cliff. */
const LAUNCH_DEG = 36;
const V_LOW = 16;
const V_HIGH = 34;
const DRAG = 0.0052;

/* HOW HARD THE WIND PUSHES. The whole of the air's speed against the ball's
 * made a twenty-mile-an-hour tailwind worth eleven yards, which turns the flag
 * into the only thing that matters. At a half it is worth about five either
 * way. Across the field it pushes harder, because across is the direction a
 * kicker can do something about: a fifteen-mile-an-hour crosswind moves a
 * fifty-yarder a couple of yards, which is enough that you aim against it and
 * not so much that you aim at the stands. */
const ALONG_FEEL = 0.5;
const CROSS_FEEL = 0.95;

/* A MISHIT. The accuracy meter hands over -1..1 and both halves of a mishit
 * scale with it: the ball leaves up to 4.5 degrees off line, and it curves
 * the same way in flight, which is what a hooked kick does. At a half-miss a
 * forty-yarder still sneaks in and a sixty-yarder does not. */
const MISS_DEG = 4.5;
const HOOK = 0.9;

/** The furthest the aim can be turned, in degrees either side of the middle.
 *  Enough to play the strongest crosswind, not enough to aim at the stands. */
export const AIM_MAX = 10;

const SUBSTEPS = 4; // per display tick at 30 a second
const DT = 1 / 120;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------- the flight */

export type KickOutcome = "good" | "wide-left" | "wide-right" | "short";

/** A ball that touched hardware on the way. The outcome still decides; this is
 *  only what the crowd heard. */
export type Doink = "upright" | "crossbar" | null;

export type Kick = {
  /** Yards from the kick spot to the plane of the posts. */
  distance: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Sideways push from a mishit, yards per second squared, while airborne. */
  curve: number;
  wind: KickWind;
  /** Seconds since the kick. */
  t: number;
  outcome: KickOutcome | null;
  doink: Doink;
  /** When the outcome was decided, in the same seconds as `t`. */
  decidedAt: number;
  /** It has hit the ground at least once. */
  landed: boolean;
  resting: boolean;
};

/** What the meters hand over: power 0..1, accuracy -1..1 with 0 a pure
 *  strike, and aim in degrees either side of straight. */
export type KickInput = { power: number; accuracy: number; aim: number };

export function launchKick(
  distance: number,
  input: KickInput,
  wind: KickWind,
  carry = 1,
): Kick {
  const power = clamp(input.power, 0, 1);
  const accuracy = clamp(input.accuracy, -1, 1);
  const aim = clamp(input.aim, -AIM_MAX, AIM_MAX);
  /* Weather shortens a kick by a share of its distance, and reach goes roughly
   * with the square of launch speed, so the speed takes the square root. */
  const v0 = (V_LOW + (V_HIGH - V_LOW) * power) * Math.sqrt(clamp(carry, 0.5, 1.2));
  const yaw = ((aim + accuracy * MISS_DEG) * Math.PI) / 180;
  const up = (LAUNCH_DEG * Math.PI) / 180;
  const flat = v0 * Math.cos(up);
  return {
    distance,
    x: 0,
    y: 0,
    z: 0,
    vx: flat * Math.sin(yaw),
    vy: v0 * Math.sin(up),
    vz: flat * Math.cos(yaw),
    curve: accuracy * HOOK,
    wind,
    t: 0,
    outcome: null,
    doink: null,
    decidedAt: 0,
    landed: false,
    resting: false,
  };
}

/* THE MOMENT OF TRUTH, when the ball reaches the plane of the posts.
 *
 * Judged once, at the exact point of crossing, interpolated between two steps.
 * A ball that brushes hardware is deflected so that what the camera shows next
 * agrees with the call: in off the post goes on through, out off the post
 * comes back. */
function judge(k: Kick, x: number, y: number): void {
  const side = Math.abs(x);
  const onUpright =
    Math.abs(side - GAP_HALF) < BALL_R && y >= CROSSBAR - BALL_R && y <= UPRIGHT_TOP + 3;
  const onBar = !onUpright && side <= GAP_HALF && Math.abs(y - CROSSBAR) < BALL_R;

  let good: boolean;
  if (onUpright) {
    k.doink = "upright";
    good = side < GAP_HALF && y >= CROSSBAR;
    const toward = x > 0 ? -1 : 1;
    if (good) {
      k.vx = toward * (1.2 + Math.abs(k.vx) * 0.3);
      k.vz = Math.abs(k.vz) * 0.45;
    } else {
      k.vx = -toward * (1.6 + Math.abs(k.vx) * 0.3);
      k.vz = -Math.abs(k.vz) * 0.25;
    }
  } else if (onBar) {
    k.doink = "crossbar";
    good = y >= CROSSBAR;
    if (good) {
      k.vy = Math.abs(k.vy) * 0.3 + 1;
      k.vz = Math.abs(k.vz) * 0.35;
    } else {
      k.vy = -Math.abs(k.vy) * 0.4;
      k.vz = -Math.abs(k.vz) * 0.25;
    }
  } else {
    good = side <= GAP_HALF - BALL_R && y > CROSSBAR;
  }

  if (good) k.outcome = "good";
  else if (side > GAP_HALF) k.outcome = x < 0 ? "wide-left" : "wide-right";
  else k.outcome = "short";
  k.decidedAt = k.t;
  // A deflected ball has left the air it was flying in; it is falling now.
  if (k.doink) k.curve = 0;
}

function substep(k: Kick): void {
  if (k.resting) return;
  const pz = k.z;
  const px = k.x;
  const py = k.y;

  if (!k.landed) {
    /* Drag against the air, not against the ground: a tailwind is air moving
     * with the ball, so the ball is slowed less. */
    const rx = k.vx - k.wind.cross * MPH * CROSS_FEEL;
    const rz = k.vz - k.wind.along * MPH * ALONG_FEEL;
    const ry = k.vy;
    const speed = Math.hypot(rx, ry, rz);
    k.vx += (-DRAG * speed * rx + k.curve) * DT;
    k.vy += (-DRAG * speed * ry - GRAVITY) * DT;
    k.vz += -DRAG * speed * rz * DT;
  } else {
    k.vy -= GRAVITY * DT;
  }

  k.x += k.vx * DT;
  k.y += k.vy * DT;
  k.z += k.vz * DT;
  k.t += DT;

  if (k.outcome === null && pz < k.distance && k.z >= k.distance) {
    const f = (k.distance - pz) / (k.z - pz);
    judge(k, px + (k.x - px) * f, py + (k.y - py) * f);
  }

  if (k.y <= 0 && k.vy < 0) {
    k.y = 0;
    if (k.outcome === null) {
      k.outcome = "short";
      k.decidedAt = k.t;
    }
    /* A football does not bounce true, and nobody watching needs it to. It
     * bounces lower each time and skids to a stop. */
    k.landed = true;
    k.curve = 0;
    k.vy = Math.abs(k.vy) > 1.2 ? -k.vy * 0.35 : 0;
    k.vx *= 0.55;
    k.vz *= 0.55;
  }
  if (k.landed && k.y === 0 && k.vy === 0) {
    k.vx *= 0.96;
    k.vz *= 0.96;
    if (Math.hypot(k.vx, k.vz) < 0.15) k.resting = true;
  }
  if (k.t > MAX_FLIGHT) {
    if (k.outcome === null) {
      k.outcome = "short";
      k.decidedAt = k.t;
    }
    k.resting = true;
  }
}

/** One display tick, a thirtieth of a second. */
export function stepKick(k: Kick): void {
  for (let i = 0; i < SUBSTEPS; i++) substep(k);
}

/** The kick has been called and the camera has had its look. */
export function kickFinished(k: Kick): boolean {
  if (k.outcome === null) return false;
  if (k.resting) return true;
  return k.t - k.decidedAt > 1.4 || k.z > k.distance + 14;
}

/** Take the whole kick. The tests use it to kick thousands; the games step it
 *  so they can draw it. */
export function resolveKick(
  distance: number,
  input: KickInput,
  wind: KickWind,
  carry = 1,
): { outcome: KickOutcome; doink: Doink; seconds: number } {
  const k = launchKick(distance, input, wind, carry);
  while (k.outcome === null) stepKick(k);
  return { outcome: k.outcome, doink: k.doink, seconds: k.decidedAt };
}

/* ------------------------------------------------------------- the meters */

/* HOW FAR THIS LEG REACHES, which is the number beside the power meter.
 *
 * The same promise the homepage kick makes and for the same reason: a meter
 * that reads green and then drops short is worse than no meter. So reach is not
 * a formula. It is measured by flying a straight kick through the real
 * simulation, in the real headwind or tailwind, and noting where it fell back
 * through the height of the bar. The crosswind is left out, because the meter
 * answers whether the leg is there and nothing else. */
export function reach(power: number, along: number, carry = 1): number {
  const k = launchKick(10_000, { power, accuracy: 0, aim: 0 }, { cross: 0, along }, carry);
  const bar = CROSSBAR + BALL_R;
  for (let i = 0; i < 8_000; i++) {
    const py = k.y;
    const pz = k.z;
    substep(k);
    if (k.vy < 0 && k.y < bar) {
      if (py < bar) return 0; // never got that high at all
      const f = (py - bar) / (py - k.y);
      return pz + (k.z - pz) * f;
    }
  }
  return 0;
}

/** The weakest power that reaches `distance`, or a number above 1 when no
 *  power does. A binary search over `reach`, which only ever grows with power. */
export function powerFor(distance: number, along: number, carry = 1): number {
  if (reach(1, along, carry) < distance) return 1.01;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (reach(mid, along, carry) >= distance) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Where a pure kick with no aim would cross the plane of the posts, sideways.
 *  What the wind alone does, and so what a kicker has to aim against. */
export function driftAt(distance: number, power: number, wind: KickWind, carry = 1): number {
  const k = launchKick(distance, { power, accuracy: 0, aim: 0 }, wind, carry);
  let px = 0;
  let pz = 0;
  for (let i = 0; i < 4_000; i++) {
    px = k.x;
    pz = k.z;
    stepKick(k);
    if (k.z >= distance || k.landed) break;
  }
  if (k.z < distance) return k.x;
  const f = (distance - pz) / (k.z - pz || 1);
  return px + (k.x - px) * f;
}

/** The aim, in degrees, that would put a pure kick dead centre. */
export function aimFor(distance: number, power: number, wind: KickWind, carry = 1): number {
  const drift = driftAt(distance, power, wind, carry);
  return clamp((-Math.atan2(drift, distance) * 180) / Math.PI, -AIM_MAX, AIM_MAX);
}

/* THE METER SWEEPS. Both run up and back, so the moment to press comes round
 * twice a cycle. Accuracy runs faster the harder the ball was struck, which is
 * how every kicking game since the nineties has said that a long kick is two
 * hard things rather than one. */
export const POWER_PERIOD = 1.3; // seconds for a full up-and-back

export function accuracyPeriod(power: number): number {
  return 1.7 - 0.85 * clamp(power, 0, 1);
}

/** A triangle wave from a phase, 0..1 and back. */
export function triangle(phase: number): number {
  const v = ((phase % 1) + 1) % 1;
  return v < 0.5 ? v * 2 : 2 - v * 2;
}

/** The accuracy needle is centred a quarter of the way into its sweep, so it
 *  starts dead centre and moves right first. */
export const needle = (phase: number): number => triangle(phase + 0.25) * 2 - 1;

/* ------------------------------------------------------------ the computer */

/* THE COMPUTER'S KICKER, who reads the flag and has a leg like anybody's.
 *
 * Its make rate is not written down anywhere. It comes out of this same
 * physics, from a kicker who picks enough power for the distance with a little
 * to spare, leans into the wind without getting it exactly right, and strikes
 * the ball about as cleanly as a professional does. The tests measure what that
 * produces at each distance and hold it near the league's own numbers. */
export function computerKick(
  r: Rng,
  distance: number,
  wind: KickWind,
  carry = 1,
): KickInput {
  const needed = powerFor(distance + 3, wind.along, carry);
  const power = clamp(Math.min(needed, 1) + 0.04 + normal(r) * 0.04, 0, 1);
  const lean = aimFor(distance, power, wind, carry) * between(r, 0.6, 1.15);
  /* THE SAME STRIKE FROM EVERY DISTANCE UP TO ABOUT FIFTY, and the distance
   * does the rest. A mishit's sideways error already grows with how far the
   * ball travels and how long it hooks for, so one spread produces the league's
   * shape inside fifty on its own: nearly automatic inside forty, about four in
   * five from fifty. Past that a kicker is swinging as hard as he can, and a
   * swing at full stretch is a less repeatable one. */
  const stretch = Math.max(0, (distance - 48) / 20);
  const spread = 0.34 + stretch * stretch * 0.35;
  const accuracy = clamp(normal(r) * spread, -1, 1);
  return { power, accuracy, aim: clamp(lean + normal(r) * 0.4, -AIM_MAX, AIM_MAX) };
}

/** Words for the call, the way a broadcast says it. */
export function callFor(outcome: KickOutcome, doink: Doink): string {
  if (outcome === "good") {
    return doink === "upright"
      ? "OFF THE UPRIGHT... AND IN! IT'S GOOD!"
      : doink === "crossbar"
        ? "OFF THE CROSSBAR... AND OVER! IT'S GOOD!"
        : "IT'S GOOD!";
  }
  if (doink === "upright") return "DOINK! OFF THE UPRIGHT. NO GOOD.";
  if (doink === "crossbar") return "DOINK! OFF THE CROSSBAR. NO GOOD.";
  return outcome === "wide-left"
    ? "WIDE LEFT. NO GOOD."
    : outcome === "wide-right"
      ? "WIDE RIGHT. NO GOOD."
      : "SHORT. NO GOOD.";
}
