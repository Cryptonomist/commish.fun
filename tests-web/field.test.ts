/* THE FIELD HAS TO TELL THE TRUTH.
 *
 * The yard lines on the game field were drawn every 24 logical pixels for
 * months. A yard is 6, so they fell every FOUR yards, and they were anchored
 * to the origin of the world rather than to a goal line. Nothing noticed,
 * because nothing on screen was measuring anything: they were decoration that
 * happened to look like measurement.
 *
 * The moment the field carries numbers that stops being harmless. A 30 painted
 * on the 32 is not a stylistic choice, it is a lie about the one quantity this
 * game is entirely about, and it is the sort of thing nobody sees in a
 * screenshot and everybody feels.
 *
 * So these drive the real drawField through a recording context and check what
 * it actually painted. They are about geometry, never about taste: how bright
 * the grass is or how big the logo looks is the designer's business, and a
 * test that pinned it would just be in the way.
 */

import { expect } from "chai";

import { FIELD, VIEW_H, VIEW_W } from "@/lib/bowl";
import { drawField, PX } from "@/lib/pixel";
import { cellsFor, runLength } from "@/lib/fieldfont";

type Rect = { x: number; y: number; w: number; h: number; fill: string };

/** A canvas that remembers instead of drawing. drawField only ever sets a
 *  fill colour and lays down rectangles, so this is the whole of it. */
function recorder() {
  const rects: Rect[] = [];
  let fill = "";
  const ctx = {
    set fillStyle(v: string) {
      fill = v;
    },
    get fillStyle() {
      return fill;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fill });
    },
  };
  return { ctx, rects };
}

function paint(camX: number): Rect[] {
  const { ctx, rects } = recorder();
  drawField(
    ctx as unknown as CanvasRenderingContext2D,
    VIEW_W,
    VIEW_H,
    camX,
    FIELD,
  );
  return rects;
}

describe("the field's yard lines", () => {
  it("puts a line on every five yard mark and nowhere else", () => {
    /* A yard line is the only thing drawn one pixel wide and the full height
     * of the field of play, so it can be picked out without knowing its
     * colour. Sorted screen positions, compared against the arithmetic. */
    const camX = 0;
    const rects = paint(camX);
    const full = VIEW_H - 5 - 4;
    const drawn = [
      ...new Set(
        rects.filter((r) => r.w === 1 && r.h === full).map((r) => r.x),
      ),
    ].sort((a, b) => a - b);

    const expected: number[] = [];
    for (let yd = 0; yd <= 100; yd += 5) {
      const x = FIELD.ownGoal + yd * FIELD.yard - camX;
      if (x >= -2 && x <= VIEW_W + 2) expected.push(x);
    }
    // The end line at world 0 is the same shape and belongs in the set.
    expected.push(0 - camX);

    expect(drawn).to.deep.equal([...new Set(expected)].sort((a, b) => a - b));
  });

  it("spaces them five real yards apart, not four", () => {
    /* The specific regression. At 24 pixels these came out 4 yards apart and
     * every number on the field would have been painted on the wrong line. */
    const rects = paint(0);
    const full = VIEW_H - 5 - 4;
    const xs = [
      ...new Set(
        rects.filter((r) => r.w === 1 && r.h === full).map((r) => r.x),
      ),
    ]
      .filter((x) => x >= FIELD.ownGoal)
      .sort((a, b) => a - b);

    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).to.equal(5 * FIELD.yard);
    }
  });

  it("centres each yard number on the line it names", () => {
    /* The point of the whole exercise: the 30 sits on the 30. Every glyph cell
     * of a label is found, its span measured, and its middle compared with the
     * line. */
    const camX = FIELD.ownGoal;
    const rects = paint(camX);

    for (const yd of [10, 20, 30, 40, 50]) {
      const label = String(yd);
      const lineX = FIELD.ownGoal + yd * FIELD.yard - camX;
      const halfRun = runLength(label) / 2;

      /* Cells are one logical pixel each and share the numbers' ink, which
       * nothing else on the field uses. */
      const ink = rects.filter(
        (r) => r.w === 1 && r.h === 1 && r.fill.startsWith("rgba(251"),
      );
      const near = ink.filter((r) => Math.abs(r.x - lineX) <= halfRun + 1);
      expect(near.length, `no ${label} near its line`).to.be.greaterThan(0);

      const left = Math.min(...near.map((r) => r.x));
      const right = Math.max(...near.map((r) => r.x));
      expect(
        Math.abs((left + right + 1) / 2 - lineX),
        `${label} is off its line`,
      ).to.be.lessThan(2);
    }
  });
});

describe("the goalposts", () => {
  /* They used to stand 8 pixels in from the end line. The camera cannot travel
   * past that line, so the far post's outer upright sat in the last two
   * columns of the viewport and was sliced in half by the edge of the screen:
   * a goalpost with one leg. Found by rendering it, pinned here so it stays
   * found. */
  for (const [where, camX] of [
    ["your end", 0],
    ["theirs", FIELD.world - VIEW_W],
  ] as const) {
    it(`stands entirely inside the frame at ${where}`, () => {
      const posts = paint(camX).filter((r) => r.fill === PX.post);
      expect(posts.length, "no posts drawn").to.be.greaterThan(0);
      for (const r of posts) {
        expect(r.x, "post starts off the left edge").to.be.at.least(0);
        expect(r.x + r.w, "post runs off the right edge").to.be.at.most(VIEW_W);
      }
    });
  }

  it("is not painted in the money gold", () => {
    /* Gold means money in this palette and nothing else, ever. The posts are
     * yellow because goalposts are yellow, and that is a different colour with
     * a different meaning. */
    expect(PX.post).to.not.equal(PX.gold);
  });
});

describe("the endzone lettering", () => {
  it("stays inside the endzone it is painted in", () => {
    /* Anybody raising the scale to make the name louder would push it over the
     * goal line and out onto the field of play, which no amount of squinting
     * at a screenshot reliably catches. */
    const rects = paint(0);
    const chalk = rects.filter(
      (r) => r.fill === PX.chalk && r.x < FIELD.ownGoal + 40,
    );
    expect(chalk.length, "nothing lettered").to.be.greaterThan(0);
    for (const r of chalk) {
      expect(r.x, "lettering off the back of the endzone").to.be.at.least(0);
      expect(
        r.x + r.w,
        "lettering crossed the goal line",
      ).to.be.at.most(FIELD.ownGoal);
    }
  });

  it("knows every character of the name it has to paint", () => {
    expect(() => cellsFor("COMMISH.FUN")).to.not.throw();
  });

  it("refuses a character it has no glyph for, rather than drawing a gap", () => {
    /* A font table that silently renders nothing is how the 49ers once wore
     * somebody else's letter on their helmet, and that took a test to find. */
    expect(() => cellsFor("COMMISH.FUN!")).to.throw(/no glyph/);
  });
});
