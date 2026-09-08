/* A HELMET, AS A BITMAP, AND A LETTER TO PUT ON IT.
 *
 * The pick'em tile is already the club's lead colour with its trim along the
 * bottom and the abbreviation across the middle, which is most of what 64
 * pixels can say about a football team. What it does not have is a shape, and a
 * helmet is the one silhouette that means this sport and nothing else.
 *
 * WHY NOT THE CLUB'S ACTUAL LOGO. Two reasons, and the practical one came
 * first. The mark on the game sprite is 8 pixels wide with about 4x3 usable
 * once the facemask is in — a real logo at that size is three coloured pixels
 * and a guess, which is why the original Tecmo Bowl put none on: colour and a
 * stripe carry the team, and they carry it better. The other reason is that
 * these are somebody else's registered marks and this product holds people's
 * money and says on three pages that it is affiliated with nobody.
 *
 * So the helmet is drawn here and the glyph is a plain letterform, set in a
 * 3x5 grid of the same kind the rest of this site's type is built on. A letter
 * on a helmet is an old convention and it is nobody's property.
 *
 * Duplicates are fine and deliberate. Five clubs are a B and five are a C; the
 * shells are different colours and the abbreviation is printed an inch away,
 * so the letter is character rather than identification.
 */

/** The helmet, side on, facing right.
 *
 *   S  shell, the club's lead colour
 *   T  the crown stripe, the club's trim
 *   G  where the letter goes
 *   F  facemask
 *   .  nothing
 */
/* THE FACEMASK IS THE WHOLE READ, and the first version did not have one.
 *
 * That draft was a circle with a letter in it and a two-pixel nub on the side,
 * and rendered large it looked like a bowling ball — which is what it was.
 * From the side, the thing that separates a football helmet from any other
 * round object is the cage hanging off the front and the jaw it bolts to.
 * Nothing else does that.
 *
 * So the shell now runs down and forward into a jaw, and the mask is four
 * pixels of cage with a hole in it rather than a bump. Checked by rendering it
 * at 170px rather than trusting the bitmap to read at a glance. */
export const HELMET = [
  "....TTTTTT......",
  "..SSTTTTTTSS....",
  ".SSSSSSSSSSSSS..",
  "SSSSSSSSSSSSSSS.",
  "SSSGGGSSSSSSSSS.",
  "SSSGGGSSSSSSSSSS",
  "SSSGGGSSSSSSFFFF",
  "SSSGGGSSSSSFF..F",
  "SSSGGGSSSSSFFFFF",
  "SSSSSSSSSSSFF...",
  ".SSSSSSSSSSF....",
  "..SSSSSSSS......",
] as const;

export const HELMET_W = HELMET[0].length;
export const HELMET_H = HELMET.length;

/** Top-left of the glyph box inside the helmet, found from the bitmap rather
 *  than written down twice — move a G and this follows. */
export const GLYPH_X = HELMET.find((r) => r.includes("G"))!.indexOf("G");
export const GLYPH_Y = HELMET.findIndex((r) => r.includes("G"));
export const GLYPH_W = 3;
export const GLYPH_H = 5;

/* A 3x5 alphabet. Every letter that starts an NFL club's nickname, plus the
 * digit the 49ers need. Written as rows so a wrong pixel is visible in the
 * source rather than hidden in a hex table. */
const FONT: Record<string, readonly string[]> = {
  A: ["###", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: ["###", "#..", "#..", "#..", "###"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  G: ["###", "#..", "#.#", "#.#", "###"],
  J: ["..#", "..#", "..#", "#.#", "###"],
  L: ["#..", "#..", "#..", "#..", "###"],
  P: ["###", "#.#", "###", "#..", "#.."],
  R: ["###", "#.#", "##.", "#.#", "#.#"],
  S: ["###", "#..", "###", "..#", "###"],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."],
  /* San Francisco, whose nickname starts with a digit. The rule is the first
   * character of the nickname and this is it — the test caught the 49ers
   * silently wearing somebody else's letter, which is exactly the failure a
   * font table hides. */
  "4": ["#.#", "#.#", "###", "..#", "..#"],
};

/** The letter a club wears: the first character of the nickname, which for
 *  one club in the league is a digit. */
export function glyphFor(nickname: string): readonly string[] {
  const ch = nickname.slice(0, 1).toUpperCase();
  return FONT[ch] ?? FONT.T;
}

export type Cell = { x: number; y: number; kind: "shell" | "trim" | "mask" };

/** Every filled pixel of one club's helmet, in bitmap coordinates. Pure, so
 *  the tests can count what is drawn without a DOM. */
export function helmetCells(nickname: string): Cell[] {
  const glyph = glyphFor(nickname);
  const out: Cell[] = [];

  for (let y = 0; y < HELMET_H; y++) {
    for (let x = 0; x < HELMET_W; x++) {
      const c = HELMET[y][x];
      if (c === ".") continue;
      if (c === "T") {
        out.push({ x, y, kind: "trim" });
        continue;
      }
      if (c === "F") {
        out.push({ x, y, kind: "mask" });
        continue;
      }
      if (c === "G") {
        /* A G is shell UNLESS the letter lights it, and the letter is drawn in
         * the trim so it reads against the shell it sits on. */
        const gx = x - GLYPH_X;
        const gy = y - GLYPH_Y;
        const lit = glyph[gy]?.[gx] === "#";
        out.push({ x, y, kind: lit ? "trim" : "shell" });
        continue;
      }
      out.push({ x, y, kind: "shell" });
    }
  }
  return out;
}
