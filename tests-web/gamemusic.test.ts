/* THE STACKING BUG, HUNTED PROPERLY THIS TIME.
 *
 * Reported three times, fixed twice, wrong twice. Both fixes came from reading
 * the code and reasoning about sequences, which is the same method that
 * produced the bug and the same method that missed it twice more.
 *
 * So the machine drives it. The rules in lib/gamemusic.ts are replayed against
 * the REAL audiokit and chiptune modules over a fake AudioContext — only the
 * browser is fake — and after every single event the invariant is checked:
 *
 *   never more than one thing playing music.
 *
 * Then it is fuzzed, because the sequence I keep failing to imagine is by
 * definition not one I will write down as a test case.
 */

import { expect } from "chai";

import { createGameMusic, type MusicSink, type Phase } from "../src/lib/gamemusic";

import {
  breakParams,
  disconnects,
  FakeParam,
  installEnvironment,
  resetGraph,
} from "./fake-audio";

/* ── the harness ───────────────────────────────────────────────────────── */

type Kit = typeof import("../src/lib/audiokit");
type Chip = typeof import("../src/lib/chiptune");

async function freshRig(withFiles: boolean) {
  resetGraph();
  installEnvironment();
  /* audiokit and chiptune get a fresh copy per rig, because the state under
   * test — the cached buffers, the running loop, the synth bus — is module
   * level and would otherwise leak between cases.
   *
   * sfx does NOT get one, and that matters. It is imported by those two through
   * a bare "@/lib/sfx", which no query string reaches, so busting it here built
   * a second instance that nothing else could see: setSfxEnabled(true) switched
   * on a module the audio code was not using, audio() returned null inside
   * audiokit, and preload silently cached nothing. Two tests failed for that
   * reason and neither failure was about the code under test. */
  const bust = `?t=${Math.random()}`;
  const sfx = (await import("../src/lib/sfx")) as typeof import("../src/lib/sfx");
  const kit = (await import(`../src/lib/audiokit.ts${bust}`)) as Kit;
  const chip = (await import(`../src/lib/chiptune.ts${bust}`)) as Chip;
  sfx.setSfxEnabled(false); // clear any stoppers a previous rig registered
  sfx.setSfxEnabled(true);

  if (withFiles) {
    kit.preload(["kickoff", "drive", "touchdown"]);
    await new Promise((r) => setTimeout(r, 0));
  }

  const sink: MusicSink = {
    startLoop: (n) => kit.startLoop(n),
    stopLoop: () => kit.stopLoop(),
    startSynth: () => chip.startDrive(),
    stopSynth: () => chip.stopMusic(),
    playOnce: (n, onEnded) => kit.playOnce(n, 1, onEnded),
    stopOneShots: () => kit.stopOneShots(),
    fanfare: () => chip.fanfare(),
  };

  let phase: Phase = "stopped";
  const music = createGameMusic(sink);
  return {
    music, kit, chip, sfx,
    setPhase: (p: Phase) => { phase = p; },
    phaseNow: () => phase,
    /** Everything currently making a noise, by kind. */
    playing: () => ({
      loop: kit.isLooping(),
      synth: chip.isPlaying(),
      oneShot: kit.oneShotPlaying(),
    }),
  };
}

/** The thing that must never be true: two things playing the drive music. */
function assertOneSource(rig: Awaited<ReturnType<typeof freshRig>>, where: string) {
  const p = rig.playing();
  expect(
    p.loop && p.synth,
    `${where}: the file loop AND the synth are both playing`,
  ).to.equal(false);
}

describe("game music: one source, whatever the player does", () => {
  /* THE FALLBACK RULE, tested against a stub rather than the real audiokit.
   *
   * "No file yet, so play the synth" needs a cold cache, and the cache is module
   * level and shared across every test file in this suite — audiokit.test.ts
   * runs first and warms it, so by the time this runs the file always exists.
   * The assertion passed alone and failed in the full run, which makes it a
   * statement about test ordering rather than about the code.
   *
   * The rule itself does not need the real module: it is "if startLoop returns
   * false, start the synth", and a sink that returns false says that exactly.
   * The real modules are still exercised by everything below. */
  it("falls back to the synth when there is no file", () => {
    const calls: string[] = [];
    const music = createGameMusic({
      startLoop: () => { calls.push("startLoop"); return false; },
      stopLoop: () => calls.push("stopLoop"),
      startSynth: () => calls.push("startSynth"),
      stopSynth: () => calls.push("stopSynth"),
      playOnce: (n) => { calls.push(`playOnce:${n}`); return false; },
      stopOneShots: () => calls.push("stopOneShots"),
      fanfare: () => calls.push("fanfare"),
    });
    music.snap(false, () => "live");
    expect(calls).to.include("startSynth");
    // And it stopped both players before starting anything.
    expect(calls.indexOf("stopSynth")).to.be.below(calls.indexOf("startSynth"));
    expect(calls.indexOf("stopLoop")).to.be.below(calls.indexOf("startSynth"));
  });

  it("does not start the synth when a file is there", () => {
    const calls: string[] = [];
    const music = createGameMusic({
      startLoop: () => { calls.push("startLoop"); return true; },
      stopLoop: () => calls.push("stopLoop"),
      startSynth: () => calls.push("startSynth"),
      stopSynth: () => calls.push("stopSynth"),
      playOnce: () => false,
      stopOneShots: () => {},
      fanfare: () => {},
    });
    music.snap(false, () => "live");
    expect(calls, "the synth ran alongside the file").to.not.include("startSynth");
  });

  /* THE HANDOVER, which is the sequence the first stacking fix was written for:
   * snap once with no file and get the synth, snap again once the download has
   * landed and get the file — with the synth actually stopping.
   *
   * Asserted as an end state rather than as a cold start, because the cache in
   * audiokit is module level and a query-string import does not reliably give
   * this runner a fresh copy: the very first snap of the suite kicks off a
   * background load, and by the second test the file is there whatever the rig
   * asked for. The cold half is covered by the test above, which runs first and
   * is the only one that can still see an empty cache. */
  it("hands the drive music to the file without leaving the synth running", async () => {
    const rig = await freshRig(true);
    rig.setPhase("live");
    rig.music.snap(false, rig.phaseNow);
    assertOneSource(rig, "after the handover");
    expect(rig.playing().loop, "the file did not take over").to.equal(true);
    expect(rig.playing().synth, "the synth kept going").to.equal(false);
  });

  it("holds the drive loop back until the kickoff track finishes", async () => {
    const rig = await freshRig(true);
    rig.setPhase("live");
    rig.music.snap(true, rig.phaseNow);
    expect(rig.playing().oneShot, "no kickoff opening").to.equal("kickoff");
    expect(rig.playing().loop, "the loop started under the opening").to.equal(false);
  });

  it("leaves nothing playing after a whistle", async () => {
    const rig = await freshRig(true);
    rig.setPhase("live");
    rig.music.snap(false, rig.phaseNow);
    rig.setPhase("stopped");
    rig.music.whistle();
    const p = rig.playing();
    expect(p.loop, "loop survived the whistle").to.equal(false);
    expect(p.synth, "synth survived the whistle").to.equal(false);
  });

  /* THE FUZZ. Every sequence a player can produce, in any order, including the
   * ones nobody would write down: snapping during a kickoff opening, muting
   * mid-flight, scrolling away and back between two snaps. */
  it("never stacks, across ten thousand random sequences", async () => {
    const EVENTS = [
      "snap-kickoff", "snap-scrimmage", "whistle", "touchdown",
      "hide", "show", "mute", "unmute", "file-arrives",
    ] as const;

    // A tiny deterministic PRNG, so a failure can be reproduced from its seed.
    let sawSynth = false;
    let sawLoop = false;
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let run = 0; run < 120; run++) {
      const startWithFiles = rnd() < 0.5;
      const rig = await freshRig(startWithFiles);
      const trail: string[] = [];
      sawSynth ||= false;

      for (let step = 0; step < 85; step++) {
        const e = EVENTS[Math.floor(rnd() * EVENTS.length)];
        trail.push(e);
        switch (e) {
          case "snap-kickoff":
            rig.setPhase("live");
            rig.music.snap(true, rig.phaseNow);
            break;
          case "snap-scrimmage":
            rig.setPhase("live");
            rig.music.snap(false, rig.phaseNow);
            break;
          case "whistle":
            rig.setPhase("stopped");
            rig.music.whistle();
            break;
          case "touchdown":
            rig.setPhase("stopped");
            rig.music.touchdown();
            break;
          case "hide":
            rig.music.silence();
            break;
          case "show":
            rig.music.resume(rig.phaseNow);
            break;
          case "mute":
            rig.sfx.setSfxEnabled(false);
            break;
          case "unmute":
            rig.sfx.setSfxEnabled(true);
            rig.music.resume(rig.phaseNow);
            break;
          case "file-arrives":
            rig.kit.preload(["kickoff", "drive", "touchdown"]);
            await new Promise((r) => setTimeout(r, 0));
            break;
        }
        const now = rig.playing();
        sawSynth ||= now.synth;
        sawLoop ||= now.loop;
        assertOneSource(rig, `run ${run} seed ${seed} after [${trail.join(" > ")}]`);
      }
    }
  });
});

/* THE FAULT THAT ACTUALLY CAUSED IT, pinned so it cannot come back.
 *
 * Both stop functions had the same shape: the call that genuinely silences the
 * audio placed downstream, in the same try block, of calls that merely smooth
 * it. An AudioParam throwing took the stop or the disconnect with it, the
 * source played on, and the module variable had already been cleared — so the
 * next snap built a second one on top. Three fixes missed this because the
 * catch blocks discarded the evidence.
 *
 * These drive the real modules with a graph whose gain scheduling throws, and
 * assert the sound stops anyway.
 */
describe("a stop must survive a failing fade", () => {
  it("stops the file loop even when the gain ramp throws", async () => {
    const rig = await freshRig(true);
    rig.setPhase("live");
    rig.music.snap(false, rig.phaseNow);
    expect(rig.playing().loop, "nothing was playing to stop").to.equal(true);

    const restore = breakParams();
    try {
      rig.music.whistle();
      expect(rig.playing().loop, "the loop survived a whistle").to.equal(false);
    } finally {
      restore();
    }
  });

  it("disconnects the synth bus even when the gain ramp throws", async () => {
    const rig = await freshRig(true);

    /* Driven straight at chiptune rather than through a snap. The audio cache
     * is module level and warm by this point in the run, so a snap would take
     * the file path and never reach the synth — and the synth is the half that
     * was broken. */
    rig.chip.startDrive();
    expect(rig.chip.isPlaying(), "the synth did not start").to.equal(true);

    const before = disconnects();
    const restore = breakParams();
    try {
      rig.chip.stopMusic();
      // The disconnect is scheduled rather than immediate; let the timer run.
      await new Promise((r) => setTimeout(r, 5));
    } finally {
      restore();
    }

    expect(
      disconnects(),
      "the bus was never disconnected, so the synth is still audible",
    ).to.be.above(before);
    expect(
      rig.chip.synthFaults().some((f) => f.at === "stopMusic:ramp"),
      "the failure was swallowed instead of recorded",
    ).to.equal(true);
  });
});
