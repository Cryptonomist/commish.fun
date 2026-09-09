/* THE PAINT ON THE FIELD: the site's own display face, as a bitmap.
 *
 * THESE ARE SILKSCREEN'S ACTUAL LETTERFORMS, not an alphabet drawn to look
 * like them. The first version of this file was a 5x7 font invented for the
 * job, and it was fine, and it was not the wordmark: the endzone said
 * COMMISH.FUN in a typeface that appears nowhere else on the site, which is
 * the sort of thing that reads as "close enough" and never as "ours".
 *
 * So they were measured off the real thing. `src/app/fonts/silkscreen.woff2`
 * was rendered into a canvas at a hundred pixels, the ink bounding boxes were
 * taken, and the design unit fell out of them at 12.5px: the capitals are five
 * units tall, the letters are one to five wide, and the advance is the ink
 * plus one unit of bearing each side. That is where the table below came from
 * and it is why the I is a bare stem and the M is five across. Anything that
 * looks odd in it is Silkscreen being Silkscreen.
 *
 * WHY NOT fillText. Everything here is drawn into a canvas at 320x180 and then
 * scaled up with smoothing off. fillText would anti-alias at the logical size
 * and then magnify, which produces grey mush exactly where the rest of the
 * picture has hard square pixels. The font has to be pixels or it cannot join
 * in.
 *
 * ROTATED, BECAUSE ENDZONE TYPE IS. Endzone lettering runs parallel to the
 * goal line, which from this camera is the short way across, so the letters
 * lie on their side. Which side is not a detail: see `facing` below.
 *
 * The character set is deliberately only what the field paints, and an unknown
 * character throws rather than drawing a blank. A font table that silently
 * renders nothing is how the 49ers once wore somebody else's letter on their
 * helmet, and that took a test to find.
 */

/** Silkscreen's capitals are five units tall. Widths vary. */
export const GLYPH_H = 5;

/** One unit of side bearing each side, so two units of air between inks. This
 *  is Silkscreen's own tracking, measured: "COMMISH.FUN" comes to 62 units of
 *  advance and 60 units of ink, and both fall out of this number. */
export const TRACKING = 2;

const FONT: Record<string, readonly string[]> = {
  C: [".##.", "#..#", "#...", "#..#", ".##."],
  O: [".##.", "#..#", "#..#", "#..#", ".##."],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
  I: ["#", "#", "#", "#", "#"],
  S: [".###", "#...", ".##.", "...#", "###."],
  H: ["#..#", "#..#", "####", "#..#", "#..#"],
  F: ["###", "#..", "###", "#..", "#.."],
  U: ["#..#", "#..#", "#..#", "#..#", ".##."],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#"],
  ".": [".", ".", ".", ".", "#"],
  "0": [".##.", "#..#", "#..#", "#..#", ".##."],
  "1": ["##.", ".#.", ".#.", ".#.", "###"],
  "2": ["###.", "...#", ".##.", "#...", "####"],
  "3": ["###.", "...#", ".##.", "...#", "###."],
  "4": ["#.#.", "#.#.", "####", "..#.", "..#."],
  "5": ["####", "#...", "###.", "...#", "###."],
};

function glyph(ch: string): readonly string[] {
  const g = FONT[ch];
  if (!g) throw new Error(`fieldfont has no glyph for ${JSON.stringify(ch)}`);
  return g;
}

/** A stretch of text in one colour. The endzone paints two of them, because
 *  the wordmark is COMMISH in cream and .FUN in the action orange, and half a
 *  wordmark in the wrong colour is not the wordmark. */
export type Segment = { text: string; fill: string };

type Cell = { x: number; y: number; fill: string };

/** Every inked cell of a run, in glyph-space columns and rows, with the text
 *  running left to right. Pure, so a test can count pixels without a canvas,
 *  and the placement below is the only thing that knows about screens. */
export function cellsOf(run: Segment[], gap = TRACKING): Cell[] {
  const out: Cell[] = [];
  let x = 0;
  for (const seg of run) {
    for (const ch of seg.text) {
      const g = glyph(ch);
      for (let row = 0; row < GLYPH_H; row++) {
        for (let col = 0; col < g[row].length; col++) {
          if (g[row][col] === "#") out.push({ x: x + col, y: row, fill: seg.fill });
        }
      }
      x += g[0].length + gap;
    }
  }
  return out;
}

/** How long a run is along the reading direction, in glyph columns. The
 *  trailing gap is not part of it: the run ends at the last inked column. */
export function runLength(run: Segment[], gap = TRACKING): number {
  let x = 0;
  for (const seg of run) {
    for (const ch of seg.text) x += glyph(ch)[0].length + gap;
  }
  return Math.max(0, x - gap);
}

/** How thick a run is across the reading direction. */
export const RUN_THICKNESS = GLYPH_H;

/** One colour, for the yard numbers and for tests. */
export const plain = (text: string, fill = "#000000"): Segment[] => [
  { text, fill },
];

/* Only the two members this file touches, so a test can pass a plain object
 * and count rectangles without a DOM. `fillStyle` keeps the real union rather
 * than narrowing to string, because narrowing it makes a genuine
 * CanvasRenderingContext2D fail to satisfy the type. */
type Ctx = Pick<CanvasRenderingContext2D, "fillRect" | "fillStyle">;

/* Worked out once per run. This is called from inside a 30fps draw loop and
 * COMMISH.FUN is 200-odd cells of object allocation that never change. */
const cache = new Map<string, Cell[]>();
function cellsCached(run: Segment[], gap: number): Cell[] {
  const key = gap + "|" + run.map((s) => s.fill + ":" + s.text).join("|");
  let c = cache.get(key);
  if (!c) {
    c = cellsOf(run, gap);
    cache.set(key, c);
  }
  return c;
}

/**
 * Draw a run lying on its side, in a block `RUN_THICKNESS` wide and
 * `runLength` long, with its top-left corner at (x, y).
 *
 * WHICH WAY IT FACES IS THE WHOLE POINT, and it differs between the two ends
 * of the field. Endzone lettering is painted to be read from the field, so the
 * tops of the letters point at the middle of it: to the RIGHT in your endzone
 * and to the LEFT in theirs. Painting both the same way, which is what the
 * first version did, leaves one of them addressing the back wall.
 *
 *   facing  1  tops point right (+x), and the text runs down the screen
 *   facing -1  tops point left  (-x), and the text runs up it
 *
 * The reading direction has to flip with the facing or the text comes out
 * backwards. Both are quarter turns of the same glyphs in opposite directions.
 *
 * THE OUTLINE IS ONE LOGICAL PIXEL, NOT ONE SCALED ONE, so the keyline stays
 * hairline-thin however big the letters get. That is what makes arcade endzone
 * type readable over a busy background; an outline that scales with the
 * letters just makes them fatter. It is drawn as one pass of slightly
 * oversized cells rather than eight offset passes: the union of every cell
 * grown a pixel in each direction is the letter dilated by a pixel, and it
 * costs two passes instead of nine.
 */
export function drawRun(
  ctx: Ctx,
  run: Segment[],
  x: number,
  y: number,
  scale: number,
  facing: 1 | -1,
  outline?: string,
  gap = TRACKING,
): void {
  const cells = cellsCached(run, gap);
  const last = runLength(run, gap) - 1;
  const place = (c: Cell) =>
    facing === 1
      ? { x: GLYPH_H - 1 - c.y, y: c.x }
      : { x: c.y, y: last - c.x };

  if (outline) {
    ctx.fillStyle = outline;
    for (const c of cells) {
      const p = place(c);
      ctx.fillRect(
        x + p.x * scale - 1,
        y + p.y * scale - 1,
        scale + 2,
        scale + 2,
      );
    }
  }
  /* Grouped by colour rather than switched per cell: setting fillStyle is the
   * expensive part of a canvas fill, and the wordmark is two colours over two
   * hundred cells. */
  for (const seg of new Set(cells.map((c) => c.fill))) {
    ctx.fillStyle = seg;
    for (const c of cells) {
      if (c.fill !== seg) continue;
      const p = place(c);
      ctx.fillRect(x + p.x * scale, y + p.y * scale, scale, scale);
    }
  }
}

/** Upright, for the yard numbers. See the note in `drawField` about why those
 *  are not rotated even though the endzone lettering is. */
export function drawTextUp(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  scale: number,
  fill: string,
): void {
  ctx.fillStyle = fill;
  for (const c of cellsOf(plain(text, fill))) {
    ctx.fillRect(x + c.x * scale, y + c.y * scale, scale, scale);
  }
}
