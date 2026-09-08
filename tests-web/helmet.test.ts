/* The helmet is a bitmap typed by hand, and every way it goes wrong is silent.
 *
 * A row one character short shifts everything after it and still renders. A
 * letter with a pixel in the wrong place is a letter, just not that one. A
 * nickname whose initial is missing from the font falls back and nobody sees a
 * fallback. None of that throws and none of it fails a typecheck.
 */

import { expect } from "chai";

import {
  GLYPH_H,
  GLYPH_W,
  GLYPH_X,
  GLYPH_Y,
  glyphFor,
  HELMET,
  HELMET_H,
  HELMET_W,
  helmetCells,
} from "../src/lib/helmet";
import { TEAMS } from "../src/lib/nfl";

describe("the helmet", () => {
  it("is a rectangle", () => {
    for (const [i, row] of HELMET.entries()) {
      expect(row.length, `row ${i} is a different length`).to.equal(HELMET_W);
    }
  });

  it("uses only characters the renderer knows", () => {
    for (const row of HELMET) {
      for (const ch of row) expect("STGF.").to.contain(ch);
    }
  });

  it("has a glyph box exactly the size of a letter", () => {
    let w = 0;
    let h = 0;
    for (let y = 0; y < HELMET_H; y++) {
      const n = [...HELMET[y]].filter((c) => c === "G").length;
      if (n) {
        h++;
        w = Math.max(w, n);
      }
    }
    expect(w, "glyph box width").to.equal(GLYPH_W);
    expect(h, "glyph box height").to.equal(GLYPH_H);
    expect(GLYPH_X).to.be.at.least(0);
    expect(GLYPH_Y).to.be.at.least(0);
  });

  it("has a facemask, and it is on the front", () => {
    const mask: number[] = [];
    HELMET.forEach((row) => {
      const i = row.indexOf("F");
      if (i >= 0) mask.push(i);
    });
    expect(mask.length, "no facemask").to.be.above(0);
    // Every mask pixel is right of the glyph, i.e. the helmet faces right.
    expect(Math.min(...mask)).to.be.above(GLYPH_X + GLYPH_W);
  });

  describe("the alphabet", () => {
    /* THE ONE THAT ACTUALLY BITES: a club whose initial is not in the font
     * renders somebody else's letter and looks completely fine. */
    it("has a letter for all thirty-two clubs", () => {
      const missing = TEAMS.filter((t) => {
        const g = glyphFor(t.name);
        return g === glyphFor("Zzz") && t.name[0].toUpperCase() !== "T";
      }).map((t) => `${t.abbr} (${t.name})`);
      expect(missing, "clubs falling back to a default letter").to.deep.equal([]);
    });

    it("draws every letter on a 3x5 grid", () => {
      for (const t of TEAMS) {
        const g = glyphFor(t.name);
        expect(g.length, `${t.name} letter height`).to.equal(GLYPH_H);
        for (const row of g) {
          expect(row.length, `${t.name} letter width`).to.equal(GLYPH_W);
          for (const ch of row) expect("#.").to.contain(ch);
        }
      }
    });

    it("gives every letter some ink", () => {
      for (const t of TEAMS) {
        const lit = glyphFor(t.name).join("").split("#").length - 1;
        expect(lit, `${t.name} has a blank letter`).to.be.above(3);
      }
    });
  });

  describe("what gets painted", () => {
    it("paints a cell for every non-blank pixel and no others", () => {
      const filled = HELMET.join("").split("").filter((c) => c !== ".").length;
      expect(helmetCells("Bears")).to.have.length(filled);
    });

    it("lights the letter in the trim so it reads against the shell", () => {
      const cells = helmetCells("Colts");
      const inBox = cells.filter(
        (c) =>
          c.x >= GLYPH_X &&
          c.x < GLYPH_X + GLYPH_W &&
          c.y >= GLYPH_Y &&
          c.y < GLYPH_Y + GLYPH_H,
      );
      const lit = inBox.filter((c) => c.kind === "trim").length;
      const dark = inBox.filter((c) => c.kind === "shell").length;
      expect(lit, "the letter is not lit").to.be.above(0);
      expect(dark, "the letter fills the whole box").to.be.above(0);
      expect(lit + dark).to.equal(GLYPH_W * GLYPH_H);
    });

    it("gives two different clubs two different helmets", () => {
      const key = (n: string) =>
        helmetCells(n)
          .map((c) => `${c.x},${c.y},${c.kind}`)
          .join("|");
      expect(key("Bears")).to.not.equal(key("Colts"));
      // And the same club is stable, so nothing is order-dependent.
      expect(key("Bears")).to.equal(key("Bears"));
    });
  });
});
