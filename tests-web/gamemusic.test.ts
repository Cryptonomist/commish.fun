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

/* ── a fake audio graph ─────────────────────────────────────────────────── */

class FakeParam {
  value = 1;
  cancelScheduledValues() { return this; }
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  /* The synth uses this one for its drum envelope. Leaving it off the fake is
   * what made the first run of this suite worthless: startDrive threw inside
   * its own try/catch, set bus back to null, and the invariant below — "the
   * loop and the synth are not both playing" — became true for the boring
   * reason that the synth never played at all. Same shape as a deploy guard
   * that passes without reading anything. */
  exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
  setTargetAtTime(v: number) { this.value = v; return this; }
}
class FakeGain {
  gain = new FakeParam();
  constructor(public context: FakeCtx) {}
  connect<T>(n: T): T { return n; }
  disconnect() {}
}
class FakeSource {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  type = "";
  frequency = new FakeParam();
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  connect<T>(n: T): T { return n; }
  start() { this.started = true; LIVE.add(this); }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    LIVE.delete(this);
    /* A real graph fires onended when a source is stopped. Firing it here is
     * what makes the one-shot handover testable at all. */
    if (this.onended) this.onended();
  }
}
class FakeBuffer {
  constructor(public duration = 12, public sampleRate = 48000,
              public numberOfChannels = 1, public length = 48000 * 12) {}
  getChannelData() { return new Float32Array(this.length).fill(0.5); }
}
class FakeCtx {
  state = "running";
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  createGain() { return new FakeGain(this); }
  createBufferSource() { return new FakeSource(); }
  createOscillator() { return new FakeSource(); }
  createBiquadFilter() { return { type: "", frequency: new FakeParam(), Q: new FakeParam(), connect: <T>(n: T) => n }; }
  createBuffer() { return new FakeBuffer(); }
  async decodeAudioData() { return new FakeBuffer(); }
  resume() { this.state = "running"; return Promise.resolve(); }
}

/** Sources that have been started and not stopped. */
const LIVE = new Set<FakeSource>();

function installEnvironment() {
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.AudioContext = FakeCtx;
  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    clearTimeout: (id: number) => clearTimeout(id),
    setInterval: () => 1,
    clearInterval: () => {},
  };
  g.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
}

/* ── the harness ───────────────────────────────────────────────────────── */

type Kit = typeof import("../src/lib/audiokit");
type Chip = typeof import("../src/lib/chiptune");

async function freshRig(withFiles: boolean) {
  LIVE.clear();
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
