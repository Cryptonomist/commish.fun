/* THE CELEBRATION HAS TO END, AND HAS TO LOOK LIKE ONE.
 *
 * The kick's own suite proves every kick resolves, because a ball that crawled
 * forever once hung the button. Confetti has the same failure available: a
 * piece that never leaves the screen keeps the canvas redrawing for as long as
 * the tab is open. These play bursts from many seeds and check they all end,
 * and that what they draw is a celebration rather than a clump in a corner.
 */

import { expect } from "chai";

import {
  burst,
  CONFETTI_COLORS,
  CONFETTI_COUNT,
  CONFETTI_MAX_FRAMES,
  stepConfetti,
} from "../src/lib/confetti";
import { BAR_X, GAP_HALF } from "../src/lib/kick";
import { PX } from "../src/lib/pixel";

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

/** Frames until every piece has gone, or the cap. */
function lifetime(seed: number): number {
  const bits = burst(seed);
  for (let f = 1; f <= CONFETTI_MAX_FRAMES + 50; f++) {
    if (stepConfetti(bits) === 0) return f;
  }
  return Infinity;
}

describe("the confetti", () => {
  /* THE ONE THAT HANGS THE PAGE. The component stops at the cap regardless,
   * but the cap is a floor under a mistake, not the plan: every burst should
   * be long gone before it bites. */
  it("always ends, well before the hard stop", () => {
    let longest = 0;
    for (const seed of SEEDS) longest = Math.max(longest, lifetime(seed));
    expect(longest, "a burst outlived the cap").to.be.below(CONFETTI_MAX_FRAMES);
    // And it is a moment, not a flicker: at least a couple of seconds at 30fps.
    expect(longest).to.be.above(60);
  });

  it("leaves from the two uprights the winning kick went between", () => {
    const bits = burst(42);
    expect(bits).to.have.length(CONFETTI_COUNT);
    const posts = [0.5 - GAP_HALF, 0.5 + GAP_HALF];
    for (const b of bits) {
      expect(b.x).to.equal(BAR_X);
      expect(posts).to.include(b.y);
    }
    // Both posts, not one.
    expect(new Set(bits.map((b) => b.y)).size).to.equal(2);
  });

  it("sprays back across the field and up before it falls", () => {
    for (const b of burst(7)) {
      expect(b.vx, "every piece heads away from the posts").to.be.below(0);
      expect(b.vy, "every piece starts upward").to.be.below(0);
    }
  });

  /* A burst that all went to one spot would be a smudge, not a shower. */
  it("fans out across the field rather than landing in a clump", () => {
    const bits = burst(99);
    const lowest = new Map<number, number>();
    for (let f = 0; f < CONFETTI_MAX_FRAMES; f++) {
      bits.forEach((b, i) => {
        if (b.alive && b.y > 0.8 && !lowest.has(i)) lowest.set(i, b.x);
      });
      if (stepConfetti(bits) === 0) break;
    }
    const xs = [...lowest.values()];
    expect(Math.min(...xs), "nothing reached the left of the field").to.be.below(0.5);
    expect(Math.max(...xs), "nothing stayed near the posts").to.be.above(0.7);
  });

  /* THE PALETTE HAS RULES. Gold is money, USDC blue is the coin, red is being
   * out. Confetti in any of them would be the brand contradicting itself. */
  it("uses only colours that may mean a celebration here", () => {
    expect([...CONFETTI_COLORS]).to.not.include(PX.gold);
    expect([...CONFETTI_COLORS]).to.not.include(PX.usdc);
    expect([...CONFETTI_COLORS]).to.not.include(PX.out);
    const used = new Set(burst(5).map((b) => b.color));
    for (const c of used) expect([...CONFETTI_COLORS]).to.include(c);
    // And it actually uses all four, not one by accident.
    expect(used.size).to.equal(CONFETTI_COLORS.length);
  });

  it("is the same burst from the same seed", () => {
    const a = burst(1234);
    const b = burst(1234);
    expect(a.map((x) => [x.vx, x.vy, x.color])).to.deep.equal(
      b.map((x) => [x.vx, x.vy, x.color]),
    );
    expect(burst(1234)[0].vx).to.not.equal(burst(4321)[0].vx);
  });

  it("copes with a zero or negative seed", () => {
    expect(lifetime(0)).to.be.below(CONFETTI_MAX_FRAMES);
    expect(lifetime(-5)).to.be.below(CONFETTI_MAX_FRAMES);
  });

  it("stops counting a piece once it has gone, and never brings it back", () => {
    const bits = burst(3);
    let prev = bits.length;
    for (let f = 0; f < CONFETTI_MAX_FRAMES; f++) {
      const alive = stepConfetti(bits);
      expect(alive, `frame ${f}`).to.be.at.most(prev);
      prev = alive;
      if (alive === 0) break;
    }
    expect(prev).to.equal(0);
  });
});
