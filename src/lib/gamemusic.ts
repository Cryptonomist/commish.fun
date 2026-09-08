/* WHO IS ALLOWED TO BE PLAYING, AND WHEN.
 *
 * The music stacking on the arcade has been reported three times and fixed
 * twice, and both fixes were wrong in the same way: I reasoned about the code
 * and shipped. It could not be tested, because it lived inside a React
 * component behind requestAnimationFrame and an IntersectionObserver, and the
 * one surface available for looking at it fires no animation frames at all.
 *
 * So the decisions move here, where a test can replay any sequence of events a
 * player can produce and check what is sounding after each one. lib/bowl.ts and
 * lib/kick.ts exist for exactly this reason; this is the third time the answer
 * has been "make it a pure module and let the machine drive it".
 *
 * THIS FILE DECIDES. It does not play anything itself — every sound goes
 * through the sink, which in the app is audiokit and chiptune and in the tests
 * is those same modules over a fake AudioContext. There is one implementation
 * of the rules and both drive it.
 */

export type Track = "kickoff" | "drive" | "touchdown";

/** Everything the rules are allowed to do. */
export type MusicSink = {
  /** True when a file was found and the loop started; false means no file, and
   *  the caller should fall back to the synth. */
  startLoop: (name: "drive") => boolean;
  stopLoop: () => void;
  startSynth: () => void;
  stopSynth: () => void;
  /** True when a file played. `onEnded` runs only if it finishes on its own. */
  playOnce: (name: Track, onEnded?: () => void) => boolean;
  stopOneShots: () => void;
  /** The synth fanfare, for a score with no touchdown file. */
  fanfare: () => void;
};

export type Phase = "live" | "stopped";

export function createGameMusic(sink: MusicSink) {
  /* Which play the music belongs to. Every snap and every stop moves it on, so
   * a callback scheduled by an earlier play can tell it is stale. */
  let epoch = 0;

  /** Start the drive music: file if there is one, synth if not. Always stops
   *  first, so it is not possible to hold two sources from here. */
  const startDrive = () => {
    sink.stopSynth();
    sink.stopLoop();
    if (!sink.startLoop("drive")) sink.startSynth();
  };

  const stopAll = () => {
    epoch += 1;
    sink.stopSynth();
    sink.stopLoop();
  };

  return {
    /** The ball is snapped. A kickoff plays its own opening first and the drive
     *  loop waits for it, so the two are never sounding together. */
    snap(isKickoff: boolean, phaseNow: () => Phase) {
      sink.stopOneShots();
      epoch += 1;
      const mine = epoch;

      const opening =
        isKickoff &&
        sink.playOnce("kickoff", () => {
          if (epoch !== mine) return; // superseded by a later snap or a whistle
          if (phaseNow() !== "live") return; // already blown dead
          startDrive();
        });

      if (!opening) startDrive();
    },

    /** The whistle. Ends the music for this play. */
    whistle() {
      stopAll();
    },

    /** A score. The fanfare is a one-shot and outlives the whistle on purpose. */
    touchdown() {
      stopAll();
      if (!sink.playOnce("touchdown")) sink.fanfare();
    },

    /** Scrolled out of view, unmounted, or muted. */
    silence() {
      stopAll();
    },

    /** Back in view, or unmuted, mid-play. */
    resume(phaseNow: () => Phase) {
      if (phaseNow() !== "live") return;
      epoch += 1;
      startDrive();
    },

    /** For the tests: which play the music currently belongs to. */
    epochNow: () => epoch,
  };
}

export type GameMusic = ReturnType<typeof createGameMusic>;
