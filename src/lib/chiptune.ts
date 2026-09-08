/* THE MUSIC. Four channels, no files, and it only ever plays while a down is
 * actually running.
 *
 * WHAT AN NES ACTUALLY HAD, and what this copies: two pulse channels that
 * carry the tune and the harmony, one triangle that is the bass and cannot
 * change its volume, and one noise channel that is every drum. Nothing else.
 * Every football game of that era sounds the way it does because of those four
 * voices and their limits, so the limits are the style — a fifth channel or a
 * sampled snare would sound wrong in a way nobody could name.
 *
 * IT PLAYS DURING A DOWN AND STOPS WHEN THE WHISTLE GOES. That is not a
 * technical constraint, it is the one rule that keeps music on a website from
 * being an imposition: it is bounded, it is tied to something the player just
 * did, and it can never be left droning under a page somebody walked away
 * from. Sound is off until somebody turns it on, as everywhere else here, and
 * turning it off stops the loop mid-bar rather than at the end of it.
 *
 * SCHEDULING IS DONE AHEAD OF TIME, not on a timer per note. setTimeout in a
 * busy tab drifts by tens of milliseconds, which is inaudible for a menu blip
 * and ruinous for a rhythm; WebAudio's clock does not drift. So each pass
 * through the loop is scheduled in one go against ctx.currentTime, and a
 * coarse timer only wakes up to queue the next pass.
 */

import { audio, MAX_GAIN, registerStopper } from "@/lib/sfx";

/* ------------------------------------------------------------------- notes */

/** Semitone offsets within an octave. Sharps only; this needs no flats. */
const STEP: Record<string, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

/** "A4" to 440. A rest is "-" and returns 0, which every voice treats as
 *  silence rather than as a frequency. */
export function freq(name: string): number {
  if (name === "-") return 0;
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) return 0;
  const midi = (Number(m[2]) + 1) * 12 + STEP[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* ------------------------------------------------------------------- tunes */

/* A bar is sixteen steps of a sixteenth note. `.` holds the note before it,
 * `-` is a rest. Written as strings because a tune you cannot read in the
 * source is a tune nobody will ever change.
 *
 * THE DRIVE LOOP is a marching fight song: a dotted, on-the-beat lead over a
 * root-fifth bass, in G, at a tempo that sits just above a jog. It is four
 * bars so it does not become a two-bar nag over a long run, and it ends on the
 * dominant so the loop point pulls forward instead of settling. */
export type Voice = {
  wave: OscillatorType;
  /** Relative level. The triangle bass sits under the leads, as it did. */
  level: number;
  steps: string[];
};

const bar = (s: string): string[] => s.trim().split(/\s+/);

/* Exported so a test can check it. A tune is data, and the ways this data goes
 * wrong are all silent: a mistyped note name parses to a rest, and a voice one
 * cell short drifts against the drums a little further every pass. Neither
 * throws, neither shows up in a typecheck, and both are the kind of thing you
 * only notice after shipping. */
export const DRIVE: { bpm: number; voices: Voice[]; drums: string[] } = {
  bpm: 150,
  voices: [
    {
      // Lead.
      wave: "square",
      level: 0.85,
      steps: [
        ...bar("G4 .  G4 .  A4 .  B4 .  D5 .  .  .  B4 .  -  . "),
        ...bar("C5 .  B4 .  A4 .  G4 .  A4 .  .  .  -  .  -  . "),
        ...bar("B4 .  B4 .  C5 .  D5 .  G5 .  .  .  D5 .  -  . "),
        ...bar("E5 .  D5 .  C5 .  B4 .  A4 .  .  .  -  .  -  . "),
      ],
    },
    {
      // Harmony, a third under, and quieter: the second pulse channel.
      wave: "square",
      level: 0.42,
      steps: [
        ...bar("B3 .  B3 .  C4 .  D4 .  G4 .  .  .  D4 .  -  . "),
        ...bar("E4 .  D4 .  C4 .  B3 .  C4 .  .  .  -  .  -  . "),
        ...bar("D4 .  D4 .  E4 .  G4 .  B4 .  .  .  G4 .  -  . "),
        ...bar("G4 .  G4 .  E4 .  D4 .  C4 .  .  .  -  .  -  . "),
      ],
    },
    {
      // Bass. Triangle, because that is what the chip put down here.
      wave: "triangle",
      level: 1,
      steps: [
        ...bar("G2 .  .  .  G2 .  -  .  D3 .  .  .  D3 .  -  . "),
        ...bar("C3 .  .  .  C3 .  -  .  D3 .  .  .  D3 .  -  . "),
        ...bar("G2 .  .  .  G2 .  -  .  E3 .  .  .  E3 .  -  . "),
        ...bar("C3 .  .  .  D3 .  -  .  D3 .  .  .  -  .  -  . "),
      ],
    },
  ],
  /* The noise channel. `k` is a kick, `s` a snare, `h` a hat, `.` nothing.
   * A marching backbeat: kick on one and three, snare on two and four, hats
   * filling the gaps. */
  drums: [
    ...bar("k . h . s . h . k . k . s . h ."),
    ...bar("k . h . s . h . k . k . s . h ."),
    ...bar("k . h . s . h . k . k . s . h ."),
    ...bar("k . h . s . h . k . s . s . s ."),
  ],
};

/* ---------------------------------------------------------------- playback */

/** One pulse/triangle note, scheduled at an absolute context time.
 *
 *  The gain is set and held, then ramped to zero over two milliseconds. A hard
 *  stop on a square wave clicks; the ramp costs nothing and removes it. */
function voiceNote(
  ctx: AudioContext,
  bus: GainNode,
  wave: OscillatorType,
  hz: number,
  at: number,
  dur: number,
  level: number,
): void {
  if (hz <= 0) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(hz, at);
  // A touch of decay inside the note, so a held chip note is not a flat slab.
  gain.gain.setValueAtTime(level, at);
  gain.gain.setValueAtTime(level * 0.72, at + Math.min(0.06, dur * 0.5));
  gain.gain.setValueAtTime(level * 0.72, at + dur - 0.004);
  gain.gain.linearRampToValueAtTime(0, at + dur);
  osc.connect(gain).connect(bus);
  osc.start(at);
  osc.stop(at + dur);
}

let noiseBuf: AudioBuffer | null = null;
function drumNoise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const b = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

function drum(
  ctx: AudioContext,
  bus: GainNode,
  kind: string,
  at: number,
): void {
  if (kind !== "k" && kind !== "s" && kind !== "h") return;
  const src = ctx.createBufferSource();
  src.buffer = drumNoise(ctx);
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  if (kind === "k") {
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(160, at);
    gain.gain.setValueAtTime(0.9, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    src.stop(at + 0.12);
  } else if (kind === "s") {
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(1600, at);
    filt.Q.value = 0.8;
    gain.gain.setValueAtTime(0.55, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    src.stop(at + 0.1);
  } else {
    filt.type = "highpass";
    filt.frequency.setValueAtTime(6000, at);
    gain.gain.setValueAtTime(0.18, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
    src.stop(at + 0.035);
  }

  src.connect(filt).connect(gain).connect(bus);
  src.start(at);
}

/** Everything currently sounding, so a stop can actually stop it rather than
 *  waiting for four bars of already-scheduled notes to finish. */
let bus: GainNode | null = null;
let timer: number | null = null;
let unregister: (() => void) | null = null;

/** Schedule one pass of the loop starting at `at`, and return when it ends. */
function schedulePass(ctx: AudioContext, out: GainNode, at: number): number {
  const stepDur = 60 / DRIVE.bpm / 4; // a sixteenth
  const total = DRIVE.drums.length;

  for (const v of DRIVE.voices) {
    for (let i = 0; i < v.steps.length; i++) {
      const cell = v.steps[i];
      if (cell === "." || cell === "-") continue;
      // A note lasts until the next cell that is not a hold.
      let len = 1;
      while (i + len < v.steps.length && v.steps[i + len] === ".") len++;
      voiceNote(
        ctx,
        out,
        v.wave,
        freq(cell),
        at + i * stepDur,
        len * stepDur * 0.94,
        v.level,
      );
    }
  }
  for (let i = 0; i < DRIVE.drums.length; i++) {
    drum(ctx, out, DRIVE.drums[i], at + i * stepDur);
  }
  return at + total * stepDur;
}

/** Start the drive loop. Safe to call when it is already running, when sound
 *  is off, and in a browser with no WebAudio at all. */
export function startDrive(): void {
  if (bus) return;
  const ctx = audio();
  if (!ctx) return;

  try {
    const out = ctx.createGain();
    /* Music sits well under the effects. A tackle has to cut through the loop,
     * not fight it, and a soundtrack that is as loud as its own sound effects
     * is the single most common way this goes wrong. */
    out.gain.value = MAX_GAIN * 0.5;
    out.connect(ctx.destination);
    bus = out;

    let next = ctx.currentTime + 0.06;
    next = schedulePass(ctx, out, next);

    /* Queue the following pass a little before this one runs out. The interval
     * is coarse on purpose: it only decides WHEN we schedule, never when a
     * note sounds, so drift in the timer is inaudible. */
    const passMs = ((60 / DRIVE.bpm / 4) * DRIVE.drums.length) * 1000;
    timer = window.setInterval(() => {
      const c = audio();
      if (!c || !bus) return;
      if (next - c.currentTime < passMs / 1000) next = schedulePass(c, bus, next);
    }, passMs / 3);

    unregister = registerStopper(stopMusic);
  } catch {
    // A device that will not play is not an error worth surfacing.
    bus = null;
  }
}

/** True while the synthesised loop is running. For the tests, which had no
 *  way to ask and therefore no way to catch two players at once. */
export const isPlaying = (): boolean => bus !== null;

/** Stop immediately, including notes already scheduled ahead of the clock. */
export function stopMusic(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  if (unregister) {
    unregister();
    unregister = null;
  }
  const out = bus;
  bus = null;
  if (!out) return;
  try {
    const ctx = out.context;
    /* A four-bar pass is already sitting in the scheduler, so silencing the
     * bus is the only thing that actually stops it. Twenty-five milliseconds
     * rather than an instant cut, because dropping a running oscillator to
     * zero clicks. */
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
    out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.025);
    window.setTimeout(() => {
      try {
        out.disconnect();
      } catch {
        // Already torn down.
      }
    }, 120);
  } catch {
    // Nothing to stop.
  }
}

/** The touchdown fanfare: a rising figure over the tonic, then the octave.
 *  Not looped, and it does not need stopping — it is over in a second. */
export function fanfare(): void {
  const ctx = audio();
  if (!ctx) return;
  try {
    const out = ctx.createGain();
    out.gain.value = MAX_GAIN;
    out.connect(ctx.destination);
    const t = ctx.currentTime + 0.02;
    const seq: [string, number, number][] = [
      ["G4", 0, 0.09],
      ["C5", 0.09, 0.09],
      ["E5", 0.18, 0.09],
      ["G5", 0.27, 0.22],
      ["E5", 0.5, 0.09],
      ["G5", 0.59, 0.4],
    ];
    for (const [n, at, dur] of seq) {
      voiceNote(ctx, out, "square", freq(n), t + at, dur, 0.9);
      voiceNote(ctx, out, "triangle", freq(n) / 2, t + at, dur, 1);
    }
    drum(ctx, out, "s", t + 0.27);
    drum(ctx, out, "s", t + 0.59);
    window.setTimeout(() => {
      try {
        out.disconnect();
      } catch {
        // Already gone.
      }
    }, 1600);
  } catch {
    // Silent failure is the contract for every path in this module.
  }
}
