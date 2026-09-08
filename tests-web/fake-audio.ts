/* ONE FAKE AUDIO GRAPH, SHARED BY EVERY SUITE THAT NEEDS ONE.
 *
 * This is not tidiness. sfx.ts builds its AudioContext once and keeps it, and
 * that single instance is then shared by every test file in the process —
 * whichever suite runs first decides, for the rest of the run, what the audio
 * modules are capable of. Two files with their own private fakes therefore
 * interfere at a distance, and the failure never lands where the cause is.
 *
 * That cost three separate confusions while chasing the music stacking:
 *
 *   a fake missing exponentialRampToValueAtTime made the synth throw inside
 *   its own catch, so a fuzz test asserting "the loop and the synth are never
 *   both playing" passed because the synth never played at all;
 *
 *   a fake with no createOscillator, installed by the file that happened to run
 *   first, stopped the synth starting in a suite three files away;
 *
 *   and a gain node built by one file's fake could not be counted by the
 *   other's, so an assertion about disconnection could never be satisfied.
 *
 * All three are the same mistake. There is one graph now.
 */

/** Every buffer source ever created, so leaks can be counted. */
export const SOURCES: FakeSource[] = [];

/** Gain nodes that have been disconnected. Disconnecting the bus is the call
 *  that actually severs the synth from the speakers — the module clears its own
 *  reference first and unconditionally, so nothing else can tell a real stop
 *  from a broken one. */
export let DISCONNECTS = 0;

export function resetGraph(): void {
  SOURCES.length = 0;
  DISCONNECTS = 0;
}

/** How many gain nodes have been disconnected so far. */
export const disconnects = (): number => DISCONNECTS;

export class FakeParam {
  value = 1;
  cancelScheduledValues() { return this; }
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
  setTargetAtTime(v: number) { this.value = v; return this; }
}

/** The real methods, so a test that deliberately breaks them can restore. */
export const REAL_PARAM = {
  cancelScheduledValues: FakeParam.prototype.cancelScheduledValues,
  setValueAtTime: FakeParam.prototype.setValueAtTime,
  linearRampToValueAtTime: FakeParam.prototype.linearRampToValueAtTime,
};

/** Make every AudioParam method throw, the way an unusual or hostile browser
 *  implementation might. Returns the undo. */
export function breakParams(): () => void {
  const boom = () => {
    throw new Error("AudioParam is unavailable");
  };
  FakeParam.prototype.cancelScheduledValues = boom;
  FakeParam.prototype.setValueAtTime = boom;
  FakeParam.prototype.linearRampToValueAtTime = boom;
  return () => {
    FakeParam.prototype.cancelScheduledValues = REAL_PARAM.cancelScheduledValues;
    FakeParam.prototype.setValueAtTime = REAL_PARAM.setValueAtTime;
    FakeParam.prototype.linearRampToValueAtTime = REAL_PARAM.linearRampToValueAtTime;
  };
}

export class FakeGain {
  gain = new FakeParam();
  constructor(public context: FakeCtx) {}
  connect<T>(n: T): T { return n; }
  disconnect() { DISCONNECTS += 1; }
}

export class FakeSource {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  type = "";
  frequency = new FakeParam();
  onended: (() => void) | null = null;
  started = false;
  /** The time passed to stop(), or null if stop was never called at all.
   *  Null after start() is the leak: a source nothing will ever silence. */
  stoppedAt: number | null = null;
  connect<T>(n: T): T { return n; }
  start() { this.started = true; }
  stop(when = 0) {
    if (this.stoppedAt !== null) return;
    this.stoppedAt = when;
    /* A real graph fires onended when a source is stopped, and the one-shot
     * handover depends on that, so the fake has to as well. */
    if (this.onended) this.onended();
  }
}

export class FakeBuffer {
  constructor(
    public duration = 12,
    public sampleRate = 48000,
    public numberOfChannels = 1,
    public length = 4800,
  ) {}
  getChannelData() {
    // Non-silent throughout, so trimmedEnd keeps the whole buffer.
    return new Float32Array(this.length).fill(0.5);
  }
}

export class FakeCtx {
  state = "running";
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  createGain() { return new FakeGain(this); }
  createBufferSource() {
    const s = new FakeSource();
    SOURCES.push(s);
    return s;
  }
  createOscillator() { return new FakeSource(); }
  createBiquadFilter() {
    return {
      type: "",
      frequency: new FakeParam(),
      Q: new FakeParam(),
      connect: <T>(n: T): T => n,
    };
  }
  createBuffer() { return new FakeBuffer(); }
  async decodeAudioData() { return new FakeBuffer(); }
  resume() { this.state = "running"; return Promise.resolve(); }
}

/** Sources started and never told to stop. */
export const leaked = (): FakeSource[] =>
  SOURCES.filter((s) => s.started && s.stoppedAt === null);

/** Everything the audio modules expect a browser to provide. */
export function installEnvironment(): void {
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
