/* A 5x7 bitmap alphabet, drawn here rather than loaded from anywhere.
 *
 * WHY NOT JUST SHIP A PIXEL FONT. The brand kit rasterises SVG through
 * librsvg, which resolves fonts through fontconfig and knows nothing about
 * @font-face — so this script used to install Anton into the user's font
 * directory before anything carrying the wordmark could be built. Shipping a
 * font here would mean keeping a copy of that problem, a licence to carry, and
 * a build that renders differently on any machine where the install quietly
 * failed.
 *
 * Letters made of rectangles have none of those failure modes. They are also
 * exactly what the rest of this product draws: the sprites, the field and the
 * attract loop are all fillRect calls over a small grid, and the type on the
 * banner should be made the same way as the players on it.
 *
 * Rows are seven strings of five characters. `#` is on.
 */

const G = {
  A: ".###.|#...#|#...#|#####|#...#|#...#|#...#",
  B: "####.|#...#|#...#|####.|#...#|#...#|####.",
  C: ".###.|#...#|#....|#....|#....|#...#|.###.",
  D: "####.|#...#|#...#|#...#|#...#|#...#|####.",
  E: "#####|#....|#....|####.|#....|#....|#####",
  F: "#####|#....|#....|####.|#....|#....|#....",
  G: ".###.|#...#|#....|#.###|#...#|#...#|.###.",
  H: "#...#|#...#|#...#|#####|#...#|#...#|#...#",
  I: "#####|..#..|..#..|..#..|..#..|..#..|#####",
  J: "..###|...#.|...#.|...#.|...#.|#..#.|.##..",
  K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
  L: "#....|#....|#....|#....|#....|#....|#####",
  M: "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
  N: "#...#|##..#|#.#.#|#..##|#...#|#...#|#...#",
  O: ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
  P: "####.|#...#|#...#|####.|#....|#....|#....",
  Q: ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#",
  R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
  S: ".####|#....|#....|.###.|....#|....#|####.",
  T: "#####|..#..|..#..|..#..|..#..|..#..|..#..",
  U: "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
  V: "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
  W: "#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#",
  X: "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
  Y: "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..",
  Z: "#####|....#|...#.|..#..|.#...|#....|#####",
  0: ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.",
  1: "..#..|.##..|..#..|..#..|..#..|..#..|.###.",
  2: ".###.|#...#|....#|...#.|..#..|.#...|#####",
  3: "####.|....#|....#|.###.|....#|....#|####.",
  4: "#...#|#...#|#...#|#####|....#|....#|....#",
  5: "#####|#....|####.|....#|....#|#...#|.###.",
  6: ".###.|#...#|#....|####.|#...#|#...#|.###.",
  7: "#####|....#|...#.|..#..|.#...|.#...|.#...",
  8: ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
  9: ".###.|#...#|#...#|.####|....#|#...#|.###.",
  ".": ".....|.....|.....|.....|.....|.##..|.##..",
  "-": ".....|.....|.....|#####|.....|.....|.....",
  ",": ".....|.....|.....|.....|.##..|.##..|.#...",
  "&": ".##..|#..#.|#..#.|.##..|#..#.|#...#|.####",
  "'": "..#..|..#..|.....|.....|.....|.....|.....",
  " ": ".....|.....|.....|.....|.....|.....|.....",
};

export const CELL_W = 5;
export const CELL_H = 7;

/** Advance per character, in font cells: five wide plus one of tracking. */
export const ADVANCE = CELL_W + 1;

/** Width of a string in logical pixels at a given scale, with no trailing
 *  tracking, so centring is exact rather than half a space off. */
export function textWidth(text, scale) {
  return text.length === 0 ? 0 : (text.length * ADVANCE - 1) * scale;
}

/** An SVG path covering every lit pixel of `text`.
 *
 *  RUNS ARE MERGED ALONG EACH ROW. One rectangle per pixel is correct and
 *  produces a banner wordmark of about two thousand subpaths; merging
 *  horizontal runs first cuts that by roughly two thirds for free, and the
 *  output is identical. A brand asset that is committed to the repository is
 *  worth the twelve lines.
 */
export function textPath(text, x, y, scale) {
  const parts = [];
  const chars = text.toUpperCase().split("");
  chars.forEach((ch, i) => {
    const glyph = G[ch];
    if (!glyph) throw new Error(`No glyph for ${JSON.stringify(ch)}`);
    const ox = x + i * ADVANCE * scale;
    glyph.split("|").forEach((row, ry) => {
      let run = 0;
      for (let rx = 0; rx <= CELL_W; rx++) {
        const on = row[rx] === "#";
        if (on) {
          run++;
          continue;
        }
        if (run > 0) {
          const px = ox + (rx - run) * scale;
          const py = y + ry * scale;
          const w = run * scale;
          parts.push(`M${px} ${py}h${w}v${scale}h${-w}z`);
          run = 0;
        }
      }
    });
  });
  return parts.join("");
}
