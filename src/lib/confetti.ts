/* PIXEL CONFETTI, for the one kick that clears the ladder.
 *
 * Same split as lib/kick.ts and for the same reason: an animation is exactly
 * the kind of thing that looks fine and is not. The kick once had a ball that
 * could crawl toward the posts forever and hang the button, which is why it
 * has an age cap and a test that every kick ends. Confetti has the same
 * failure available — a piece that never leaves the screen keeps the canvas
 * redrawing for as long as the tab is open — so the flight is a pure function
 * here and the tests check that every burst ends.
 *
 * SCREEN SPACE, NOT PLAN VIEW. Everything else the kick draws obeys the
 * hero's top-down field, and a ball arcing over a crossbar would break that.
 * Confetti is not part of the field: it is the celebration laid over the
 * whole picture, the way a trophy card is, so it falls down the screen.
 *
 * FROM THE POSTS. The burst leaves from both uprights, where the winning kick
 * has just gone through, and sprays back across the field before it falls.
 *
 * FOUR COLOURS, AND WHICH ONES IS A RULE, NOT TASTE. This palette gives some
 * colours a single meaning and forbids them elsewhere: gold is money and
 * nothing else, USDC blue is the coin and nothing else, and red is being out.
 * Confetti in those would be the brand contradicting itself at its happiest
 * moment. So it is the brand orange, the goalposts' own yellow, the green that
 * means still in, and chalk.
 *
 * Coordinates are shares of the overlay, 0 to 1 on each axis, so a burst looks
 * the same at any size and a test needs no canvas.
 */

import { BAR_X, GAP_HALF } from "@/lib/kick";
import { PX } from "@/lib/pixel";

export const CONFETTI_COLORS = [PX.action, PX.post, PX.alive, PX.chalk] as const;

/** Pieces in one burst. Enough to read as a shower, few enough to stay crisp. */
export const CONFETTI_COUNT = 120;

/** A hard stop, in frames at 30 a second. The tests prove every burst ends
 *  well before it; this is the floor under a future change that would not. */
export const CONFETTI_MAX_FRAMES = 240;

const GRAVITY = 0.0006;
/** Air resistance. On the way down it sets a gentle terminal speed, about a
 *  hundredth of the overlay a frame, which is what makes it flutter rather
 *  than drop. */
const DRAG_X = 0.97;
const DRAG_Y = 0.95;
const FLUTTER = 0.0012;

export type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  /** Canvas pixels, which the hero draws at three screen pixels apiece. */
  size: 1 | 2;
  /** Where it is in its side-to-side wobble. */
  phase: number;
  alive: boolean;
};

/** A tiny deterministic generator, so a burst can be reproduced in a test. */
function generator(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One celebration's worth of confetti, leaving from both uprights. */
export function burst(seed: number, count = CONFETTI_COUNT): Bit[] {
  const rand = generator(seed);
  const bits: Bit[] = [];
  for (let i = 0; i < count; i++) {
    const top = i % 2 === 0;
    bits.push({
      x: BAR_X,
      y: 0.5 + (top ? -GAP_HALF : GAP_HALF),
      // Back across the field, away from the posts, and up before it falls.
      vx: -(0.006 + rand() * 0.016),
      vy: -(0.015 + rand() * 0.025),
      color: CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)],
      size: rand() < 0.3 ? 2 : 1,
      phase: rand() * Math.PI * 2,
      alive: true,
    });
  }
  return bits;
}

/** One frame. Mutates, and reports how many pieces are still on screen. */
export function stepConfetti(bits: Bit[]): number {
  let alive = 0;
  for (const b of bits) {
    if (!b.alive) continue;
    b.vy = (b.vy + GRAVITY) * DRAG_Y;
    b.vx *= DRAG_X;
    b.phase += 0.3;
    b.x += b.vx + Math.sin(b.phase) * FLUTTER;
    b.y += b.vy;
    // Gone once it has fallen past the bottom or drifted off either side.
    if (b.y > 1.05 || b.x < -0.05 || b.x > 1.05) {
      b.alive = false;
    } else {
      alive += 1;
    }
  }
  return alive;
}
