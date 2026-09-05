/* The lock schedule, and the rule that a week has to be long enough to play.
 *
 * WHY THIS IS ITS OWN MODULE. `create_pool` rejects a schedule whose weeks are
 * too close together, and it does so AFTER the commissioner has committed to
 * everything else on the form. The check below is the same arithmetic the
 * program does, run in the browser, so the form can refuse before a wallet
 * popup rather than after a failed transaction.
 *
 * These numbers are duplicated from `programs/commish/src/constants.rs` and
 * that duplication is a liability: if the program's values change, this file is
 * wrong and the UI will happily let someone build a pool the chain refuses.
 * They are pinned by a test on the Rust side; treat a mismatch as a bug here,
 * not there.
 */

export const WEEKS = 18;

/** Results cannot be posted until this long after a week's lock. */
export const MIN_POST_DELAY_SECS = 3 * 60 * 60;

export const MIN_DISPUTE_WINDOW_SECS = 60 * 60;
export const MAX_DISPUTE_WINDOW_SECS = 7 * 24 * 60 * 60;
export const DEFAULT_DISPUTE_WINDOW_SECS = 48 * 60 * 60;

/** The shortest gap between two locks that still leaves room to post results,
 *  wait out the dispute window, and finalize before the next week locks. */
export function minWeekGapSecs(disputeWindowSecs: number): number {
  return MIN_POST_DELAY_SECS + disputeWindowSecs;
}

/** Eighteen weekly locks, in unix seconds, starting from the first kickoff. */
export function seasonLockSchedule(firstKickoff: Date): number[] {
  const start = Math.floor(firstKickoff.getTime() / 1000);
  return Array.from({ length: WEEKS }, (_, i) => start + i * 7 * 24 * 60 * 60);
}

/** After the last lock, with room for the season to finish. The program only
 *  requires it to be later than week 18; a fortnight is the deadman's grace. */
export function refundDeadlineFor(locks: number[]): number {
  return locks[WEEKS - 1] + 14 * 24 * 60 * 60;
}

export type ScheduleProblem = {
  field: "schedule" | "disputeWindow" | "startWeek";
  message: string;
};

/* Everything `create_pool` checks about time, checked here first.
 *
 * Returns the FIRST problem, or null. One message at a time: a form that
 * reports five errors at once is a form nobody reads. */
export function validateSchedule(opts: {
  locks: number[];
  disputeWindowSecs: number;
  startWeek: number;
  nowSecs: number;
}): ScheduleProblem | null {
  const { locks, disputeWindowSecs, startWeek, nowSecs } = opts;

  if (locks.length !== WEEKS) {
    return { field: "schedule", message: `The schedule needs ${WEEKS} weeks.` };
  }
  if (startWeek < 1 || startWeek > WEEKS) {
    return { field: "startWeek", message: "Pick a week between 1 and 18." };
  }
  if (
    disputeWindowSecs < MIN_DISPUTE_WINDOW_SECS ||
    disputeWindowSecs > MAX_DISPUTE_WINDOW_SECS
  ) {
    return {
      field: "disputeWindow",
      message: "The dispute window has to be between 1 hour and 7 days.",
    };
  }
  if (locks[startWeek - 1] <= nowSecs) {
    return {
      field: "startWeek",
      message: "That week has already kicked off. Start from a later one.",
    };
  }

  const minGap = minWeekGapSecs(disputeWindowSecs);
  for (let w = 1; w < WEEKS; w++) {
    const gap = locks[w] - locks[w - 1];
    if (gap <= 0) {
      return { field: "schedule", message: "The weeks are out of order." };
    }
    if (gap <= minGap) {
      /* This is the failure worth explaining rather than just refusing. A
       * commissioner who picks a long dispute window on a tight schedule has
       * built a pool that takes buy-ins and then cannot advance past week one,
       * because finalizing week N lands after week N+1 has already locked. */
      return {
        field: "disputeWindow",
        message:
          `A ${hours(disputeWindowSecs)} dispute window needs more than ` +
          `${hours(minGap)} between locks, and week ${w + 1} is only ` +
          `${hours(gap)} after week ${w}. Shorten the window or spread the ` +
          `weeks out.`,
      };
    }
  }
  return null;
}

function hours(secs: number): string {
  const h = secs / 3600;
  if (h >= 48 && h % 24 === 0) return `${h / 24}-day`;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}
