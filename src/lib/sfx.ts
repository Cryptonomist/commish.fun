/* The whole audio surface, synthesised, off by default.
 *
 * No files, no dependency, no network. Every sound here is an OscillatorNode
 * or a burst of generated noise, which is exactly how an NES made sound: two
 * pulse channels, a triangle, and a noise channel for anything percussive.
 * That costs a few hundred lines and no audio assets at all.
 *
 * THE RULES IT WILL NOT BREAK, because sound on a website is the fastest way
 * to lose somebody's trust:
 *
 *   It is OFF until a person turns it on. Not off-on-first-visit, off until
 *   explicitly enabled, and the choice is remembered.
 *   No AudioContext is constructed until then, so a visitor who never touches
 *   the toggle never has an audio graph at all. Browsers block a context
 *   created outside a gesture anyway, and building one just to leave it
 *   suspended is the kind of thing that shows up in a privacy audit.
 *   Gain is capped at 0.08. Nothing here should ever be startling.
 *   Every path is wrapped: a browser with no WebAudio, a context that refuses
 *   to resume, or a device that simply will not play must degrade to silence
 *   and never to an error.
 */

const KEY = "commish.sfx";
const GAIN = 0.08;

let ctx: AudioContext | null = null;
let on = false;
let loaded = false;

/* localStorage throws in some privacy modes rather than returning null, so
 * every read and write here is guarded. A visitor who blocks site data gets
 * sound that works for the session and is forgotten afterwards, which is a
 * better answer than a page that fails to load. */
function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    on = window.localStorage.getItem(KEY) === "1";
  } catch {
    on = false;
  }
}

export function sfxEnabled(): boolean {
  load();
  return on;
}

/** Called from a click handler, which is the only place a browser will let an
 *  AudioContext start. */
export function setSfxEnabled(next: boolean): void {
  load();
  on = next;
  try {
    window.localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
  if (!next) {
    /* Turning sound off has to actually stop what is already sounding. An
     * effect is forty milliseconds long and will end on its own; a music loop
     * will not, and a mute button that leaves the music playing is not a mute
     * button. */
    for (const stop of stoppers) {
      try {
        stop();
      } catch {
        // A channel that is already gone is not a failure to mute.
      }
    }
    stoppers.clear();
    return;
  }
  try {
    ctx ??= new AudioContext();
    // Safari starts contexts suspended even inside a gesture.
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
    on = false;
  }
}

/** Things that need to be silenced the moment sound is switched off. The music
 *  sequencer registers itself here; one-shot effects do not need to. */
const stoppers = new Set<() => void>();

export function registerStopper(fn: () => void): () => void {
  stoppers.add(fn);
  return () => stoppers.delete(fn);
}

/** The live context, or null when sound is off or unavailable. This is the one
 *  door to the audio graph: nothing else may construct an AudioContext, or a
 *  visitor who never touched the toggle would end up with one anyway, which is
 *  the whole thing this module exists to prevent. */
export function audio(): AudioContext | null {
  load();
  if (!on || !ctx) return null;
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** The ceiling every voice in the app is mixed under. Exported so the music
 *  sequencer cannot quietly pick a louder one. */
export const MAX_GAIN = GAIN;

/* WHITE NOISE, BUILT ONCE.
 *
 * The NES had a noise channel and it is the reason its games could have a
 * tackle, a crowd and a drum at all — three things a square wave cannot do.
 * One second of samples, generated on first use and reused for every hit,
 * because allocating a fresh buffer per tackle would be a garbage-collection
 * pause in the middle of the one frame the player cares about. */
let noise: AudioBuffer | null = null;

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

/** A filtered burst of noise: a thud, a hit, a whistle's breath. `tone` is the
 *  centre of a bandpass, which is what separates a snare from a kick. */
function hit(tone: number, ms: number, at = 0, level = 1): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.setValueAtTime(tone, t0);
  band.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(GAIN * level, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  src.connect(band).connect(gain).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + ms / 1000);
}

/** A note that slides, which is how a chip whistle and a spin are made. */
function sweep(
  from: number,
  to: number,
  ms: number,
  at = 0,
  type: OscillatorType = "square",
): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + ms / 1000);
  gain.gain.setValueAtTime(GAIN, t0);
  gain.gain.setValueAtTime(GAIN, t0 + ms / 1000 - 0.002);
  gain.gain.linearRampToValueAtTime(0, t0 + ms / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000);
}

/** One square-wave note. `at` is an offset in seconds from now, which is how
 *  the multi-note sounds below are sequenced without any timers. */
function note(freq: number, ms: number, at = 0): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, t0);
  /* A hard stop on a square wave clicks. A two millisecond ramp to zero costs
   * nothing and removes it. */
  gain.gain.setValueAtTime(GAIN, t0);
  gain.gain.setValueAtTime(GAIN, t0 + ms / 1000 - 0.002);
  gain.gain.linearRampToValueAtTime(0, t0 + ms / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000);
}

export type Sound =
  | "move"
  | "confirm"
  | "out"
  | "win"
  /* The football four. `out` was doing duty as a tackle and it is a menu
   * rejection noise — three descending tones, which reads as "you got that
   * wrong" rather than as a collision. A tackle is percussive. */
  | "snap"
  | "tackle"
  | "first"
  | "spin";

/** Fire and forget. Silent when disabled, silent when unsupported, never
 *  throws into a click handler. */
export function play(sound: Sound): void {
  load();
  if (!on || !ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    switch (sound) {
      case "move":
        note(220, 30);
        break;
      case "confirm":
        note(440, 60);
        note(660, 60, 0.06);
        break;
      case "win":
        note(523, 70);
        note(659, 70, 0.07);
        note(784, 110, 0.14);
        break;
      case "out":
        note(440, 80);
        note(330, 80, 0.08);
        note(220, 120, 0.16);
        break;
      /* THE SNAP. A referee's whistle is a shrill warble, and two fast slides
       * are how a chip does one without a sample. */
      case "snap":
        sweep(1900, 2400, 55);
        sweep(2400, 1900, 55, 0.055);
        note(880, 40, 0.12);
        break;
      /* THE TACKLE. Body first, then the ground: a low thud with a short
       * bright crack over it. Noise, because a square wave cannot be a
       * collision however low you tune it. */
      case "tackle":
        hit(180, 130, 0, 1);
        hit(1400, 60, 0.01, 0.6);
        note(147, 90, 0.02);
        break;
      /* FIRST DOWN. Two notes up, the same shape as every arcade pickup ever
       * written, because it is the shape that means "good, keep going". */
      case "first":
        note(659, 55);
        note(988, 90, 0.055);
        break;
      /* THE SPIN. One fast slide up. It is the only sound tied to a button the
       * player presses mid-play, so it has to be short enough not to still be
       * sounding when the result of pressing it arrives. */
      case "spin":
        sweep(330, 990, 120, 0, "sawtooth");
        break;
    }
  } catch {
    // A device that will not play is not an error worth surfacing.
  }
}
