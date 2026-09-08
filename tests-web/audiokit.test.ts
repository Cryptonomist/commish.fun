/* TWO TRACKS AT ONCE IS A BUG THE MACHINE CAN HEAR AND I CANNOT.
 *
 * The music stacking on the arcade page has now been reported twice. The first
 * fix routed every start and stop through one pair of functions in the
 * component, which was correct as far as it went and did not hold, because it
 * was reasoned about rather than measured. Nothing here runs sound: the tests
 * run in node, the preview surface renders no audio, and reading the module
 * carefully is exactly what produced the fix that did not work.
 *
 * So the audio graph gets a fake and the invariant gets asserted: whatever
 * sequence of calls the game makes, at most one music source is ever live, and
 * none is left running at the end. A leaked source here is two tracks in
 * somebody's headphones.
 */

import { expect } from "chai";

/* ── the fake graph ────────────────────────────────────────────────────────
 * Only the surface audiokit and sfx actually touch. Every node records what
 * was done to it so the test can ask the questions a listener would. */

/** Every source ever created, in order, so leaks can be counted at the end. */
let SOURCES: FakeSource[] = [];

class FakeParam {
  value = 1;
  cancelScheduledValues() {
    return this;
  }
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
}

class FakeGain {
  gain = new FakeParam();
  constructor(public context: FakeCtx) {}
  connect<T>(n: T): T {
    return n;
  }
  disconnect() {}
}

class FakeSource {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  started = false;
  /** The time passed to stop(), or null if stop was never called at all.
   *  Null after start() is the leak: a source nothing will ever silence. */
  stoppedAt: number | null = null;
  connect<T>(n: T): T {
    return n;
  }
  start() {
    this.started = true;
  }
  stop(when = 0) {
    this.stoppedAt = when;
  }
}

class FakeBuffer {
  constructor(
    public duration = 12,
    public sampleRate = 48000,
    public numberOfChannels = 1,
    public length = 48000 * 12,
  ) {}
  getChannelData() {
    /* Non-silent throughout, so trimmedEnd keeps the whole buffer and the loop
     * point is not the thing under test here. */
    return new Float32Array(this.length).fill(0.5);
  }
}

class FakeCtx {
  state = "running";
  currentTime = 0;
  destination = {};
  createGain() {
    return new FakeGain(this);
  }
  createBufferSource() {
    const s = new FakeSource();
    SOURCES.push(s);
    return s;
  }
  async decodeAudioData() {
    return new FakeBuffer();
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

/** Sources that were started and never told to stop. */
const leaked = () => SOURCES.filter((s) => s.started && s.stoppedAt === null);

/* ── the environment audiokit and sfx expect ──────────────────────────────── */

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
  g.fetch = async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  });
}

describe("audiokit: one music source, ever", () => {
  let kit: typeof import("../src/lib/audiokit");
  let sfx: typeof import("../src/lib/sfx");

  beforeEach(async () => {
    SOURCES = [];
    installEnvironment();
    /* Fresh module state per test. The bug being chased lives in module-level
     * variables, so a shared instance between tests would hide it. */
    const bust = `?t=${SOURCES.length}-${Math.random()}`;
    sfx = (await import(`../src/lib/sfx.ts${bust}`)) as typeof sfx;
    kit = (await import(`../src/lib/audiokit.ts${bust}`)) as typeof kit;
    sfx.setSfxEnabled(true);
    kit.preload(["drive", "kickoff"]);
    // Let the fetch/decode promise chain settle so the buffer is cached.
    await new Promise((r) => setTimeout(r, 0));
  });

  it("caches the track so a loop can start from it", () => {
    expect(kit.hasFile("drive")).to.equal(true);
  });

  it("leaves nothing running after a single start and stop", () => {
    expect(kit.startLoop("drive")).to.equal(true);
    kit.stopLoop();
    expect(leaked()).to.have.length(0);
  });

  /* THE REPORTED BUG, as a sequence. Snap, tackle, snap, tackle — the thing
   * somebody does within thirty seconds of playing, and the thing that was
   * described twice as "the old one is still going and a new one starts". */
  it("never leaves two running across repeated snaps and whistles", () => {
    for (let down = 0; down < 8; down++) {
      // The snap. This is what startMusic does, in order.
      kit.stopLoop();
      kit.startLoop("drive");
      expect(
        leaked(),
        `two sources live during down ${down + 1}`,
      ).to.have.length(1);
      // The whistle.
      kit.stopLoop();
      expect(leaked(), `a source survived the whistle on down ${down + 1}`).to
        .have.length(0);
    }
  });

  /* A tackle the instant after the snap, which is the case the report
   * describes: downed quickly, snapped again quickly. */
  it("survives a snap and whistle with no time in between", () => {
    for (let i = 0; i < 20; i++) {
      kit.stopLoop();
      kit.startLoop("drive");
      kit.stopLoop();
    }
    expect(leaked()).to.have.length(0);
  });

  /* Starting twice with no stop between is the shape of every stacking bug.
   * The module guards it; this is the guard, asserted. */
  it("refuses to start a second loop over a running one", () => {
    expect(kit.startLoop("drive")).to.equal(true);
    expect(kit.startLoop("drive")).to.equal(true);
    expect(SOURCES.filter((s) => s.started)).to.have.length(1);
    kit.stopLoop();
    expect(leaked()).to.have.length(0);
  });

  /* THE BUG THAT WAS ACTUALLY REPORTED, and it was never in start/stop.
   *
   * The snap played the kickoff track and started the drive loop on the next
   * line. Both are music, both came out of the same generator, so 2.5 seconds
   * of one ran under 12.8 of the other on every kickoff and it sounded like
   * one track playing twice. These assert the handover the fix depends on:
   * a one-shot reports finishing on its own, and never reports it when it was
   * cut off — because "finished" is what the drive loop waits for. */
  it("reports a one-shot finishing on its own", async () => {
    let done = 0;
    expect(kit.playOnce("drive", 1, () => void done++)).to.equal(true);
    const src = SOURCES.find((s) => s.started);
    expect(src, "no source started").to.not.equal(undefined);
    src!.onended?.();
    expect(done, "the end callback did not run").to.equal(1);
  });

  it("never reports finishing for a one-shot that was cut short", () => {
    let done = 0;
    kit.playOnce("drive", 1, () => void done++);
    const src = SOURCES.find((s) => s.started)!;
    kit.stopOneShots();
    // A stopped source still fires onended in a real graph.
    src.onended?.();
    expect(done, "a cut track claimed it had finished").to.equal(0);
  });

  it("hands the callback to the newest one-shot only", () => {
    const rung: string[] = [];
    kit.playOnce("drive", 1, () => rung.push("first"));
    const first = SOURCES.find((s) => s.started)!;
    kit.playOnce("kickoff", 1, () => rung.push("second"));
    // The superseded source ending must not run anybody's callback.
    first.onended?.();
    expect(rung).to.deep.equal([]);
  });

  /* A TRACK THAT IS NOT LOADED PLAYS NOTHING AND PROMISES NOTHING, which is
   * the branch the caller depends on: the drive loop starts immediately when
   * there is no kickoff file to wait for, and would otherwise wait forever on
   * a callback that can never arrive. Found by this suite rather than reasoned
   * about — an earlier version of the test above used an unloaded track and
   * failed for exactly this reason. */
  it("returns false and schedules nothing for a track with no file", async () => {
    const fresh = (await import(
      `../src/lib/audiokit.ts?nofile=${Math.random()}`
    )) as typeof kit;
    let done = 0;
    expect(fresh.playOnce("touchdown", 1, () => void done++)).to.equal(false);
    expect(done).to.equal(0);
  });

  /* Muting has to silence the loop, and it goes through the stopper registry
   * rather than through stopLoop directly. */
  it("silences a running loop when sound is switched off", () => {
    kit.startLoop("drive");
    sfx.setSfxEnabled(false);
    expect(leaked(), "mute left the music running").to.have.length(0);
  });

  /* AND THEN BACK ON, WHICH IS WHERE THE REGISTRY BITES. setSfxEnabled(false)
   * clears the stopper set wholesale. startLoop re-registers, but `stoppers`
   * is a Set keyed on the function reference and stopLoop is the same
   * reference every time, so the add is a no-op whenever the entry survived.
   * If the clear and the re-add ever disagree, the second mute stops nothing. */
  it("still silences the loop on a second mute after unmuting", () => {
    kit.startLoop("drive");
    sfx.setSfxEnabled(false);
    sfx.setSfxEnabled(true);
    kit.startLoop("drive");
    sfx.setSfxEnabled(false);
    expect(leaked(), "the second mute left music running").to.have.length(0);
  });
});
