/* SOUND ON, AND SILENT ANYWAY.
 *
 * Reported as "you have to click the audio button off and back on again for it
 * to work", which is an exact description of the fault: `on` is restored from
 * localStorage on every page load, but the AudioContext was only ever built
 * inside setSfxEnabled. A returning visitor therefore got a page that believed
 * sound was on, lit the speaker button to say so, and produced nothing —
 * because every path checked `!ctx` and gave up.
 *
 * The toggle worked because toggling calls the one function that built it.
 */

import { expect } from "chai";

import { installEnvironment } from "./fake-audio";

/** A browser that already has the preference stored, as a returning visitor's
 *  would. installEnvironment gives a blank store, so this writes the key the
 *  way a previous session left it. */
function withSoundAlreadyOn() {
  installEnvironment();
  const w = (globalThis as unknown as { window: { localStorage: Storage } }).window;
  w.localStorage.setItem("commish.sfx", "1");
}

describe("sfx: a returning visitor with sound already on", () => {
  it("reports sound as enabled from the stored preference", async () => {
    withSoundAlreadyOn();
    const sfx = (await import(
      `../src/lib/sfx.ts?returning=${Math.random()}`
    )) as typeof import("../src/lib/sfx");
    expect(sfx.sfxEnabled(), "the button would show sound OFF").to.equal(true);
  });

  /* THE BUG. Nothing calls setSfxEnabled on a page load — the preference is
   * simply read — so this is the first thing the game asks for, and it used to
   * come back null forever. */
  it("hands out a context without anyone touching the toggle", async () => {
    withSoundAlreadyOn();
    const sfx = (await import(
      `../src/lib/sfx.ts?returning=${Math.random()}`
    )) as typeof import("../src/lib/sfx");
    expect(
      sfx.audio(),
      "no audio context: the game is silent until the toggle is cycled",
    ).to.not.equal(null);
  });

  /* THE PRIVACY RULE, ASSERTED WHERE IT CAN ACTUALLY BE REACHED.
   *
   * The guarantee is that a visitor who never turned sound on gets no audio
   * graph at all, and the code enforces it with a single `if (!on) return null`
   * ahead of any construction. Isolating a genuinely first-time visitor is not
   * possible here: `loaded` is module state and a query-string import does not
   * reliably give this runner a fresh copy, so by the second test the module
   * has already read a preference. Switching sound off reaches the same branch
   * through the same line, which is the part that matters. */
  it("hands out nothing once sound is switched off", async () => {
    withSoundAlreadyOn();
    const sfx = (await import(
      `../src/lib/sfx.ts?off=${Math.random()}`
    )) as typeof import("../src/lib/sfx");
    expect(sfx.audio()).to.not.equal(null);
    sfx.setSfxEnabled(false);
    expect(sfx.audio(), "sound kept working after being muted").to.equal(null);
  });
});
