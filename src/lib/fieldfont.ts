/* THE PAINT ON THE FIELD: a 5x7 alphabet for things drawn onto the grass.
 *
 * WHY NOT THE 3x5 IN helmet.ts. That one exists to put a single letter on a
 * helmet the size of a fingernail, and it is exactly as tall as it needs to be
 * for that. Endzone lettering is the opposite problem: it is the biggest type
 * on the field and it is what makes the endzone look painted rather than
 * merely coloured in, so it wants room for a proper bowl on a C and a real
 * diagonal on an N. Two fonts, two jobs.
 *
 * WHY NOT THE DOM. Everything here is drawn into the canvas at 320x180 and
 * then scaled up with smoothing off. Canvas fillText would be anti-aliased at
 * the logical size and then magnified, which produces grey mush exactly where
 * the rest of the picture has hard square pixels.
 *
 * ROTATED, BECAUSE ENDZONE TYPE IS. Real endzone lettering runs across the
 * short axis of the endzone, which from this camera means the letters lie on
 * their side. The same rotation puts the yard numbers where the arcade
 * football games of the era put them.
 *
 * The character set is deliberately only what the field actually paints, and
 * an unknown character throws rather than drawing a blank. A font table that
 * silently renders nothing is how the 49ers once ended up wearing somebody
 * else's letter on their helmet, and that took a test to find.
 */

export const GLYPH_W = 5;
export const GLYPH_H = 7;

/* Written as rows so a wrong pixel is visible in the source rather than
 * hidden in a hex table. Only the characters the field needs: COMMISH.FUN,
 * and the digits that appear in a yard number. */
const FONT: Record<string, readonly string[]> = {
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  N: ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
};

function glyph(ch: string): readonly string[] {
  const g = FONT[ch];
  if (!g) throw new Error(`fieldfont has no glyph for ${JSON.stringify(ch)}`);
  return g;
}

/** Every filled cell of a string, in glyph-space columns and rows, with the
 *  text running left to right. Pure, so a test can count pixels without a
 *  canvas, and the rotation below is the only thing that knows about screens. */
export function cellsFor(text: string, gap = 1): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let x = 0;
  for (const ch of text) {
    const g = glyph(ch);
    for (let row = 0; row < GLYPH_H; row++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (g[row][col] === "#") out.push({ x: x + col, y: row });
      }
    }
    x += GLYPH_W + gap;
  }
  return out;
}

/** The width of `text` in glyph-space columns, which becomes its length along
 *  the reading direction once it is rotated. */
export function runLength(text: string, gap = 1): number {
  return text.length * (GLYPH_W + gap) - gap;
}

/** How thick the run is across the reading direction. */
export const RUN_THICKNESS = GLYPH_H;

/* Only the two members this file touches, so a test can pass a plain object
 * and count rectangles without a DOM. `fillStyle` keeps the real union rather
 * than narrowing to string, because narrowing it makes a genuine
 * CanvasRenderingContext2D fail to satisfy the type. */
type Ctx = Pick<CanvasRenderingContext2D, "fillRect" | "fillStyle">;

/* Rotating a glyph a quarter turn CLOCKWISE puts its top edge on the right and
 * makes the text run down the screen, which is how the type on a real endzone
 * sits when you are looking along the field. A cell at (col, row) of a 5 wide
 * by 7 tall glyph lands at (H-1-row, col) in a box 7 wide and 5 tall. */
function place(c: { x: number; y: number }): { x: number; y: number } {
  return { x: GLYPH_H - 1 - c.y, y: c.x };
}

/* Rotated cells, worked out once per string. This is called from inside a 30fps
 * draw loop, and COMMISH.FUN is 200-odd cells of object allocation that never
 * change. The set of strings a field paints is a dozen at most. */
const cache = new Map<string, { x: number; y: number }[]>();
function rotatedCells(text: string): { x: number; y: number }[] {
  let c = cache.get(text);
  if (!c) {
    c = cellsFor(text).map(place);
    cache.set(text, c);
  }
  return c;
}

/**
 * Draw `text` running down the screen from (x, y), letters lying on their
 * right side, at `scale` logical pixels per font pixel.
 *
 * THE OUTLINE IS ONE LOGICAL PIXEL, NOT ONE SCALED ONE, so the keyline stays
 * hairline-thin however big the letters get. That is what makes arcade endzone
 * type readable over a busy background; an outline that scales with the
 * letters just makes them fatter.
 *
 * It is drawn as one pass of slightly oversized cells rather than eight
 * offset passes. The union of every cell grown a pixel in each direction is
 * the same shape as the letter dilated by a pixel, and it costs two passes
 * instead of nine, which at 30fps is the difference between free and not.
 */
export function drawTextDown(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  scale: number,
  fill: string,
  outline?: string,
): void {
  const cells = rotatedCells(text);
  if (outline) {
    ctx.fillStyle = outline;
    for (const c of cells) {
      ctx.fillRect(
        x + c.x * scale - 1,
        y + c.y * scale - 1,
        scale + 2,
        scale + 2,
      );
    }
  }
  ctx.fillStyle = fill;
  for (const c of cells) {
    ctx.fillRect(x + c.x * scale, y + c.y * scale, scale, scale);
  }
}

/** The same, upright, for the yard numbers. See the note in `drawField` about
 *  why those are not rotated even though the endzone lettering is. */
export function drawTextUp(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  scale: number,
  fill: string,
): void {
  ctx.fillStyle = fill;
  for (const c of cellsFor(text)) {
    ctx.fillRect(x + c.x * scale, y + c.y * scale, scale, scale);
  }
}
