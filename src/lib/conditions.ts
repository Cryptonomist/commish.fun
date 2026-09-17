/* THE CONDITIONS A GAME IS PLAYED IN: weather, time of day, and how long.
 *
 * Chosen before kickoff on both games at /arcade, and the difference between a
 * setting and a costume is whether it changes the football. So every weather
 * here carries numbers the simulations read, not only a look the canvas paints:
 * snow slows everybody down, rain makes the ball slippery, and wind moves every
 * kick and every deep ball. Time of day is the one that is only a look, which is
 * true of the sport as well.
 *
 * No React, no canvas, no window, like lib/bowl.ts and lib/kick.ts, so the
 * effects can be asserted rather than eyeballed.
 */

import { between, roll, type Rng } from "@/lib/rng";

export type Weather = "clear" | "rain" | "snow" | "wind";
export type TimeOfDay = "day" | "dusk" | "night";
export type GameLength = "quick" | "standard" | "full";

export type Conditions = {
  weather: Weather;
  time: TimeOfDay;
  length: GameLength;
};

export const DEFAULT_CONDITIONS: Conditions = {
  weather: "clear",
  time: "day",
  length: "quick",
};

/* The words for the pickers. They say what a setting DOES, because "SNOW" on a
 * button tells nobody that their kicker just lost six yards. */
export const WEATHER_OPTIONS: readonly { id: Weather; label: string; note: string }[] = [
  { id: "clear", label: "CLEAR", note: "A light breeze at most." },
  { id: "rain", label: "RAIN", note: "A slick ball: more fumbles, more drops, shorter kicks." },
  { id: "snow", label: "SNOW", note: "Slow footing for everybody and the shortest kicks." },
  { id: "wind", label: "WIND", note: "Strong gusts push every kick and every deep ball." },
];

export const TIME_OPTIONS: readonly { id: TimeOfDay; label: string; note: string }[] = [
  { id: "day", label: "DAY", note: "A one o'clock kickoff." },
  { id: "dusk", label: "DUSK", note: "Long shadows and a sunset over the stands." },
  { id: "night", label: "NIGHT", note: "Under the lights." },
];

/* QUARTERS, NOT GAMES, because that is how the sport measures a game. The clock
 * runs the way an NFL clock runs, which means most of a quarter goes by between
 * snaps rather than during them: a five-minute quarter is about a dozen snaps. */
export const LENGTH_OPTIONS: readonly {
  id: GameLength;
  label: string;
  minutes: number;
  note: string;
}[] = [
  { id: "quick", label: "QUICK", minutes: 2, note: "2-minute quarters. About ten minutes to play." },
  { id: "standard", label: "STANDARD", minutes: 5, note: "5-minute quarters. About twenty minutes." },
  { id: "full", label: "FULL", minutes: 15, note: "15-minute quarters, like the real thing. An hour or more." },
];

export function quarterSeconds(length: GameLength): number {
  const option = LENGTH_OPTIONS.find((o) => o.id === length) ?? LENGTH_OPTIONS[0];
  return option.minutes * 60;
}

/* WHAT THE WEATHER DOES TO THE FOOTBALL.
 *
 *   footing  every player's speed is multiplied by it
 *   fumble   the chance a tackled ball carrier puts it on the ground
 *   hands    the chance a catchable ball is caught is multiplied by it
 *   carry    how far every kick travels is multiplied by it
 *   wind     the range a game's wind is drawn from, in miles an hour
 *
 * Sized so a setting is felt without deciding the game. A fumble on one tackle
 * in eighty is roughly the league's own rate; rain triples it, which is a lot
 * per tackle and about one extra fumble a game. */
export type Effects = {
  footing: number;
  fumble: number;
  hands: number;
  carry: number;
  windMin: number;
  windMax: number;
};

export const EFFECTS: Record<Weather, Effects> = {
  clear: { footing: 1, fumble: 0.012, hands: 1, carry: 1, windMin: 0, windMax: 8 },
  rain: { footing: 0.96, fumble: 0.036, hands: 0.86, carry: 0.96, windMin: 3, windMax: 13 },
  snow: { footing: 0.9, fumble: 0.03, hands: 0.9, carry: 0.92, windMin: 2, windMax: 12 },
  wind: { footing: 1, fumble: 0.014, hands: 0.95, carry: 1, windMin: 12, windMax: 24 },
};

/* ------------------------------------------------------------------- wind */

/* A WIND IS TWO NUMBERS IN MILES AN HOUR, measured on the field as the human
 * player sees it in the first quarter: +x blows toward the end they attack, +y
 * blows toward the bottom of the screen. Everything else is a change of frame,
 * and the frames are the part that goes wrong, so they are functions below
 * rather than sign flips scattered through two components. */
export type Wind = { x: number; y: number };

export const CALM: Wind = { x: 0, y: 0 };

export const windMph = (w: Wind): number => Math.round(Math.hypot(w.x, w.y));

/** The game's prevailing wind, drawn once. */
export function drawWind(r: Rng, weather: Weather): Wind {
  const e = EFFECTS[weather];
  const mph = between(r, e.windMin, e.windMax);
  const a = roll(r) * Math.PI * 2;
  return { x: Math.cos(a) * mph, y: Math.sin(a) * mph };
}

/** The wind for one kick: the prevailing wind, gusting a quarter either way
 *  and swinging up to about seventeen degrees. Wind that never moves is a
 *  number to memorise rather than a flag to read. */
export function gust(r: Rng, base: Wind, weather: Weather): Wind {
  const mph = Math.hypot(base.x, base.y);
  if (mph < 0.01) return CALM;
  const speed = Math.min(EFFECTS[weather].windMax * 1.2, mph * between(r, 0.75, 1.25));
  const a = Math.atan2(base.y, base.x) + between(r, -0.3, 0.3);
  return { x: Math.cos(a) * speed, y: Math.sin(a) * speed };
}

/* TEAMS CHANGE ENDS EVERY QUARTER, and the wind does not. The human always
 * attacks toward the right-hand side of the screen, so from their seat the
 * stadium turns half a circle each quarter and the wind turns with it. That is
 * the sport's own reason for switching ends: the wind is a thing you get for a
 * quarter and then give back. */
export function windOnScreen(w: Wind, quarter: number): Wind {
  return quarter % 2 === 0 ? { x: -w.x, y: -w.y } : { x: w.x, y: w.y };
}

/* THE SIMULATION ALWAYS RUNS WITH THE TEAM IN POSSESSION ATTACKING +x, and the
 * screen mirrors it left to right when that team is the computer's. A mirror
 * flips x and leaves y alone, so a wind carries across. */
export function windInFrame(screen: Wind, mirrored: boolean): Wind {
  return mirrored ? { x: -screen.x, y: screen.y } : { x: screen.x, y: screen.y };
}

/* FROM BEHIND THE KICKER, looking down the field toward +x. Facing +x on a
 * top-down screen, your right hand points at the bottom of it, so a +y wind is
 * a crosswind toward the kicker's right. `along` is a tailwind when positive,
 * carrying the ball toward the posts. */
export type KickWind = { cross: number; along: number };

export const kickWind = (frame: Wind): KickWind => ({ cross: frame.y, along: frame.x });

/* THE ARROW, as one of eight directions on a screen. `calm` whenever the reading
 * rounds to zero, so an arrow never points at a wind the number says is not
 * there. */
export type Heading = "calm" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const HEADINGS: Heading[] = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];

/** Screen headings: +x is east, +y is south. */
export function headingOf(dx: number, dy: number): Heading {
  if (Math.round(Math.hypot(dx, dy)) === 0) return "calm";
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return HEADINGS[((octant % 8) + 8) % 8];
}

/** The same arrow for a kicker's-eye view, where up the screen is downfield. */
export function kickHeading(w: KickWind): Heading {
  return headingOf(w.cross, -w.along);
}

/** "12 MPH" or "CALM", the way a broadcast reads a flag. */
export function windLabel(mph: number): string {
  return mph === 0 ? "CALM" : `${mph} MPH`;
}
