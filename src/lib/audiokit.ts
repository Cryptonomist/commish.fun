/* DROP AN AUDIO FILE IN AND IT PLAYS. Leave it out and the synth plays.
 *
 * Everything in lib/chiptune.ts and lib/sfx.ts is generated from oscillators,
 * which is why this site ships no audio assets and works offline. That stays.
 * This module sits on top: if a file exists at the expected path, it is used;
 * if it is missing, broken, or the browser cannot decode it, the synthesised
 * version plays instead and nobody sees an error.
 *
 * That fallback is the whole design. A missing file must never be a silent
 * game or a console full of red, and whoever is adding music should be able to
 * add one track at a time and hear the difference immediately.
 *
 * THE RULES IT INHERITS, and does not get to break:
 *   Nothing is fetched until sound is switched on. A visitor who never touches
 *   the toggle never downloads a byte of audio — which matters, because these
 *   files are far larger than the entire rest of the page.
 *   Nothing is fetched until the sound is actually needed, and each file is
 *   fetched at most once.
 *   Every path is wrapped. A 404, a CORS failure, a corrupt file or a codec
 *   the browser refuses all degrade to the synth.
 *
 * WHY decodeAudioData AND NOT <audio>. A loop has to be seamless, and an MP3
 * cannot be: the format pads the start and end of the stream, so looping the
 * element leaves an audible gap at the seam. Decoding to an AudioBuffer and
 * looping with sample-accurate loopStart/loopEnd sidesteps the padding
 * entirely, which is what makes a track exported from a generator usable
 * without hand-editing it first.
 */

import { audio, MAX_GAIN, registerStopper } from "@/lib/sfx";

/** The sounds a file may replace. Names map to filenames: "kickoff" looks for
 *  /audio/kickoff.mp3 and then /audio/kickoff.wav. */
export type Track =
  | "kickoff" // plays once when a kickoff is about to be returned
  | "drive" // loops for the length of a play from scrimmage
  | "touchdown" // plays once on a score
  | "move-up" // a blip when the runner turns upfield
  | "move-down"; // and the other way

/* MP3 FIRST because that is what music generators export, WAV second because
 * that is what they export when you pay them. Two probes per track, and only
 * for a track that is actually asked for, so enabling sound and pressing snap
 * costs at most two requests. */
const EXTENSIONS = ["mp3", "wav"] as const;

/** Decoded and ready. A track that failed is stored as null so the failure is
 *  cached too and a missing file is not re-fetched on every play. */
const cache = new Map<Track, AudioBuffer | null>();
const inFlight = new Map<Track, Promise<AudioBuffer | null>>();

async function load(ctx: AudioContext, name: Track): Promise<AudioBuffer | null> {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const pending = inFlight.get(name);
  if (pending) return pending;

  const attempt = (async () => {
    for (const ext of EXTENSIONS) {
      try {
        const res = await fetch(`/audio/${name}.${ext}`, { cache: "force-cache" });
        if (!res.ok) continue; // not provided in this format; try the next
        const bytes = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(bytes);
        cache.set(name, buf);
        return buf;
      } catch {
        /* A decode failure is as good as a missing file: fall through to the
         * next extension and then to the synth. Deliberately silent — a
         * console error here would appear for every visitor who has sound on
         * and no music files, which is the normal state of this repository. */
      }
    }
    cache.set(name, null);
    return null;
  })();

  inFlight.set(name, attempt);
  const out = await attempt;
  inFlight.delete(name);
  return out;
}

/** Warm the cache for the tracks a play needs. Safe to call repeatedly; does
 *  nothing at all while sound is off. */
export function preload(names: Track[]): void {
  const ctx = audio();
  if (!ctx) return;
  for (const n of names) void load(ctx, n);
}

/* ------------------------------------------------------------- one-shots */

/** Play `name` once. Returns false if there is no file, so the caller can fall
 *  back to its synthesised version — which is why this is fire-and-check
 *  rather than fire-and-forget. */
export function playOnce(name: Track, level = 1): boolean {
  const ctx = audio();
  if (!ctx) return false;
  const buf = cache.get(name);
  /* Only plays from cache. A sound that has to be fetched first would arrive
   * hundreds of milliseconds after the thing it is meant to punctuate, so the
   * first press falls back to the synth and the file is warmed for next time. */
  if (!buf) {
    void load(ctx, name);
    return false;
  }
  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = MAX_GAIN * level;
    src.connect(gain).connect(ctx.destination);
    src.start();
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------------- loops */

let loop: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let unregister: (() => void) | null = null;

/** Loop `name` until stopLoop(). Returns false when there is no file, so the
 *  caller can start the synthesised loop instead. */
export function startLoop(name: Track, level = 0.5): boolean {
  if (loop) return true;
  const ctx = audio();
  if (!ctx) return false;
  const buf = cache.get(name);
  if (!buf) {
    void load(ctx, name);
    return false;
  }
  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    /* SAMPLE-ACCURATE LOOP POINTS, which is the entire reason for decoding
     * rather than using an <audio> element. MP3 encoders pad both ends of the
     * stream; looping the element plays that padding as a gap every time
     * round. Looping the buffer over an explicit range does not. */
    src.loopStart = 0;
    src.loopEnd = buf.duration;

    const gain = ctx.createGain();
    gain.gain.value = MAX_GAIN * level;
    src.connect(gain).connect(ctx.destination);
    src.start();
    loop = { src, gain };
    unregister = registerStopper(stopLoop);
    return true;
  } catch {
    loop = null;
    return false;
  }
}

/** Stop the file loop. Ramped, because cutting a waveform to zero clicks. */
export function stopLoop(): void {
  if (unregister) {
    unregister();
    unregister = null;
  }
  const current = loop;
  loop = null;
  if (!current) return;
  try {
    const ctx = current.gain.context;
    current.gain.gain.cancelScheduledValues(ctx.currentTime);
    current.gain.gain.setValueAtTime(current.gain.gain.value, ctx.currentTime);
    current.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.03);
    current.src.stop(ctx.currentTime + 0.05);
  } catch {
    // Already stopped.
  }
}

/** True when a file is loaded for this track, so a caller can decide between
 *  the sample and the synth without triggering either. */
export const hasFile = (name: Track): boolean => Boolean(cache.get(name));
