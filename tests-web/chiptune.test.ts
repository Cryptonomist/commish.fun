/* A tune is data, and every way this data goes wrong is silent.
 *
 * A mistyped note name does not throw — it parses to a rest, so the bar just
 * has a hole in it. A voice one cell short does not throw either; it drifts
 * against the drums a little further on every pass through the loop, which
 * sounds like the music slowly falling apart and reads like nothing at all in
 * a diff. Neither shows up in a typecheck.
 *
 * None of that can be caught by listening on the machine this was written on,
 * where sound is off by default and the preview surface renders no audio at
 * all. So the tune gets checked the same way the game rules do.
 */

import { expect } from "chai";

import { DRIVE, freq } from "../src/lib/chiptune";

const HOLD = ".";
const REST = "-";

describe("chiptune", () => {
  describe("note names", () => {
    it("puts A4 at 440 and the octaves either side of it", () => {
      expect(freq("A4")).to.equal(440);
      expect(freq("A3")).to.be.closeTo(220, 0.0001);
      expect(freq("A5")).to.be.closeTo(880, 0.0001);
    });

    it("puts the semitones where equal temperament says", () => {
      // A#4 is one semitone above A4: a ratio of the twelfth root of two.
      expect(freq("A#4") / freq("A4")).to.be.closeTo(Math.pow(2, 1 / 12), 1e-9);
      // C5 is three semitones above A4, and above it — the octave digit
      // changes at C, which is the classic place to get this wrong.
      expect(freq("C5")).to.be.above(freq("A4"));
      expect(freq("C5") / freq("A4")).to.be.closeTo(Math.pow(2, 3 / 12), 1e-9);
      expect(freq("C4")).to.be.below(freq("A4"));
    });

    it("treats a rest and anything unparseable as silence", () => {
      expect(freq(REST)).to.equal(0);
      expect(freq("H4")).to.equal(0);
      expect(freq("")).to.equal(0);
      expect(freq("Cb4")).to.equal(0);
    });
  });

  describe("the drive loop", () => {
    it("keeps every voice exactly as long as the drum track", () => {
      // The failure this catches is a bar written with fifteen or seventeen
      // cells: nothing errors, the voice simply slides against the beat a
      // little further every time round.
      for (const v of DRIVE.voices) {
        expect(v.steps.length, `a ${v.wave} voice`).to.equal(
          DRIVE.drums.length,
        );
      }
    });

    it("is a whole number of sixteen-step bars", () => {
      expect(DRIVE.drums.length % 16).to.equal(0);
      expect(DRIVE.drums.length).to.be.at.least(32);
    });

    it("has no unparseable note anywhere in it", () => {
      for (const v of DRIVE.voices) {
        v.steps.forEach((cell, i) => {
          if (cell === HOLD || cell === REST) return;
          expect(freq(cell), `${v.wave} step ${i} is "${cell}"`).to.be.above(0);
        });
      }
    });

    it("never opens a voice on a hold", () => {
      // A leading "." holds a note that was never struck, so the first cell of
      // the loop is silent on the first pass and not on any pass after it.
      for (const v of DRIVE.voices) {
        expect(v.steps[0], `a ${v.wave} voice`).to.not.equal(HOLD);
      }
    });

    it("stays inside a range a square wave should be asked to play", () => {
      for (const v of DRIVE.voices) {
        for (const cell of v.steps) {
          if (cell === HOLD || cell === REST) continue;
          const hz = freq(cell);
          expect(hz, cell).to.be.within(60, 2000);
        }
      }
    });

    it("puts the bass under both leads", () => {
      const bass = DRIVE.voices.find((v) => v.wave === "triangle");
      const leads = DRIVE.voices.filter((v) => v.wave === "square");
      expect(bass, "a triangle voice").to.exist;
      expect(leads.length).to.equal(2);

      const lowest = (v: typeof DRIVE.voices[number]) =>
        Math.min(
          ...v.steps.filter((c) => c !== HOLD && c !== REST).map(freq),
        );
      for (const lead of leads) {
        expect(lowest(bass!)).to.be.below(lowest(lead));
      }
    });

    it("uses only drum voices the player knows how to make a sound for", () => {
      // Anything else is dropped on the floor by `drum`, silently.
      for (const d of DRIVE.drums) {
        expect(["k", "s", "h", HOLD], `drum cell "${d}"`).to.include(d);
      }
      expect(DRIVE.drums.some((d) => d === "k")).to.equal(true);
      expect(DRIVE.drums.some((d) => d === "s")).to.equal(true);
    });

    it("runs for a few seconds, not a few tenths and not a minute", () => {
      // A loop shorter than a play is a nag; one longer than a play never
      // gets to its second half. A down lasts a couple of seconds.
      const seconds = (60 / DRIVE.bpm / 4) * DRIVE.drums.length;
      expect(seconds).to.be.within(4, 15);
    });
  });
});
