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
  | "kickoff" // plays once when the kickoff is snapped
  | "drive" // loops from the first snap until the drive ends
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

/** Where the music actually ends, in seconds, once trailing silence is
 *  discounted. Keyed alongside the buffer — see trimmedEnd. */
const musicEnd = new Map<Track, number>();

/* GENERATORS LEAVE SILENCE ON THE END, and a loop point placed after it is a
 * gap you hear once per pass. The first drive track supplied came in at 12.76
 * seconds with its last 60ms at a peak of 0.0002 — inaudible, but the loop
 * would have stopped there and restarted, every time round.
 *
 * So the loop end is measured rather than assumed: scan back from the last
 * sample for the first one above a floor, and loop there. This costs one pass
 * over the buffer, once, at load — and it means a file exported from anything,
 * by anyone, loops correctly without being edited first.
 *
 * The floor is -60 dBFS. Low enough that a real decaying note is kept, high
 * enough that dither and encoder noise are not mistaken for music. */
const SILENCE_FLOOR = 0.001;

function trimmedEnd(buf: AudioBuffer): number {
  let last = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = d.length - 1; i > last; i--) {
      if (Math.abs(d[i]) > SILENCE_FLOOR) {
        if (i > last) last = i;
        break;
      }
    }
  }
  /* Fall back to the whole buffer if the file is silent throughout, rather
   * than returning a zero-length loop that plays nothing forever. */
  return last > 0 ? (last + 1) / buf.sampleRate : buf.duration;
}

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
        musicEnd.set(name, trimmedEnd(buf));
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

/** The one-shot currently sounding. A touchdown fanfare can run for seconds,
 *  and without this it plays straight over the kickoff of the next drive —
 *  two pieces of music at once, which sounds like a bug because it is one. */
let shot: AudioBufferSourceNode | null = null;

/** What to run when the current one-shot finishes ON ITS OWN. Cleared by
 *  stopOneShots, because a track that was cut short did not finish. */
let shotDone: (() => void) | null = null;

/** Silence whatever one-shot is playing. Called when a new play starts. */
export function stopOneShots(): void {
  const s = shot;
  shot = null;
  /* Dropped, not called. The caller waiting on this is waiting for the track
   * to END, and being interrupted is the opposite of that — running it here
   * would start the drive loop at the exact moment somebody hit snap. */
  shotDone = null;
  if (!s) return;
  try {
    s.stop();
  } catch {
    // Already finished.
  }
}

/** Play `name` once. Returns false if there is no file, so the caller can fall
 *  back to its synthesised version — which is why this is fire-and-check
 *  rather than fire-and-forget. */
export function playOnce(
  name: Track,
  level = 1,
  /* Runs when the track reaches its own end, and never when it is cut short.
   * This exists because a one-shot that is a piece of MUSIC cannot share the
   * air with the loop: the kickoff track and the drive loop were started back
   * to back, so 2.5 seconds of one played under 12.8 seconds of the other, on
   * every kickoff. Both came from the same generator, which is why it sounded
   * like one track playing twice rather than two tracks clashing. */
  onEnded?: () => void,
): boolean {
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
    stopOneShots();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = MAX_GAIN * level;
    src.connect(gain).connect(ctx.destination);
    src.onended = () => {
      if (shot !== src) return; // superseded; whoever replaced it owns the slot
      shot = null;
      const done = shotDone;
      shotDone = null;
      if (done) done();
    };
    src.start();
    shot = src;
    shotDone = onEnded ?? null;
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
    src.loopEnd = musicEnd.get(name) ?? buf.duration;

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
