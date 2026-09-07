/* Three square-wave blips, synthesised, off by default.
 *
 * No files, no dependency, no network. Every sound is an OscillatorNode with
 * type "square" and a frequency, which is exactly how an NES made noise and
 * costs about forty lines instead of three audio assets.
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
  if (!next) return;
  try {
    ctx ??= new AudioContext();
    // Safari starts contexts suspended even inside a gesture.
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
    on = false;
  }
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

export type Sound = "move" | "confirm" | "out" | "win";

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
    }
  } catch {
    // A device that will not play is not an error worth surfacing.
  }
}
