/* A SEEDED GENERATOR WHOSE WHOLE STATE IS ONE NUMBER.
 *
 * The games on /arcade roll dice constantly: the wind, a gust, whether a
 * contested ball is caught, which way the computer calls a play. Math.random
 * would make every one of those unrepeatable, and the rule the rest of the
 * arcade already lives by is that a game you cannot replay is a game you cannot
 * test. So the dice come from here, the state sits inside the game object like
 * everything else, and a test that seeds two games the same way gets the same
 * game twice.
 *
 * The same linear congruential step lib/kick.ts and lib/confetti.ts use. It is
 * not a good generator for anything that matters, and nothing here matters:
 * it only has to be fair enough that a coin toss is a coin toss.
 */

export type Rng = { s: number };

/** A generator from a seed.
 *
 *  THE SEED IS SCRAMBLED FIRST. An LCG started from 1, 2, 3 and so on gives
 *  first rolls that differ by a few ten-thousandths, which is invisible until
 *  a test seeds two hundred onside kicks in a row and every one of them draws
 *  the same answer. A 32-bit mix of the seed spreads neighbouring seeds across
 *  the whole range before the first step. Zero is nudged to one on the way
 *  out, because an LCG at zero is a sequence every caller would share. */
export function seeded(seed: number): Rng {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  return { s: h || 1 };
}

/** 0 inclusive to 1 exclusive, and the state moves on. */
export function roll(r: Rng): number {
  r.s = (r.s * 1664525 + 1013904223) >>> 0;
  return r.s / 4294967296;
}

export const between = (r: Rng, lo: number, hi: number): number =>
  lo + (hi - lo) * roll(r);

export const chance = (r: Rng, p: number): boolean => roll(r) < p;

/** A standard normal draw, for the spread of a kicker's leg or a quarterback's
 *  arm. Box-Muller, with the log guarded against an exact zero. */
export function normal(r: Rng): number {
  const u = Math.max(1e-9, roll(r));
  const v = roll(r);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** One of the options, weighted. Weights need not add to anything. */
export function weighted<T>(r: Rng, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((n, [, w]) => n + Math.max(0, w), 0);
  let at = roll(r) * total;
  for (const [value, w] of options) {
    at -= Math.max(0, w);
    if (at < 0) return value;
  }
  return options[options.length - 1][0];
}
