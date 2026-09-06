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

import { WEEK_1_KICKOFF } from "@/lib/nfl";
import { realLockSchedule } from "@/lib/season";

export const WEEKS = 18;

/* THE FAST CLOCK, AND WHY IT LIVES ON BOTH SIDES.
 *
 * `--features devnet,fastclock` drops the program's posting and dispute floors
 * from hours to seconds so a whole week can be played against a local validator
 * while somebody watches. This file duplicates those numbers, and the header
 * above already calls that duplication a liability: with a fastclock program
 * and default values here, the form would refuse schedules the chain accepts
 * and nothing would explain why.
 *
 * So the switch is mirrored, as a build-time env var read the same way
 * `NEXT_PUBLIC_USDC_MINT` is. Set NEXT_PUBLIC_FAST_CLOCK=1 for, and only for, a
 * deployment whose program was built with the feature. Getting the two out of
 * step is a form that lies in one direction or the other, which is why the pair
 * is documented in .env.example rather than left to be discovered.
 *
 * It also compresses the season. Shortening the floors alone would not make the
 * loop testable: `create_pool` refuses a first lock already in the past, and
 * the real schedule starts at the real week-1 kickoff, so a local pool would
 * still sit and wait for September. Under the fast clock a season is eighteen
 * weeks two minutes apart, starting two minutes from now.
 */
export const FAST_CLOCK = process.env.NEXT_PUBLIC_FAST_CLOCK === "1";

/** Results cannot be posted until this long after a week's lock. */
export const MIN_POST_DELAY_SECS = FAST_CLOCK ? 60 : 3 * 60 * 60;

export const MIN_DISPUTE_WINDOW_SECS = FAST_CLOCK ? 30 : 60 * 60;
export const MAX_DISPUTE_WINDOW_SECS = 7 * 24 * 60 * 60;
export const DEFAULT_DISPUTE_WINDOW_SECS = FAST_CLOCK ? 30 : 48 * 60 * 60;

/** Seconds between weekly locks. Long enough to clear `minWeekGapSecs` at the
 *  default window in either mode. */
export const WEEK_SPACING_SECS = FAST_CLOCK ? 120 : 7 * 24 * 60 * 60;

/** Where a new pool's season starts.
 *
 *  On a real clock this is the fixed week-1 kickoff. On a fast clock it has to
 *  keep moving: `create_pool` refuses a first lock that is already past, so an
 *  anchor fixed at page load would go stale in the time it takes to fill the
 *  form in. Callers refresh it.
 *
 *  FIVE MINUTES, NOT TWO. Joining closes at the first lock — the dues deadline
 *  for a pick pool is that same instant — so everything a test pool needs, all
 *  of its members and all of their picks, has to land before it. Two minutes
 *  was not enough to copy the pool address out of the browser and run one
 *  command, which meant a pool that could never be played. */
export function firstKickoffFor(now: Date = new Date()): Date {
  return FAST_CLOCK ? new Date(now.getTime() + 300_000) : WEEK_1_KICKOFF;
}

/** The shortest gap between two locks that still leaves room to post results,
 *  wait out the dispute window, and finalize before the next week locks. */
export function minWeekGapSecs(disputeWindowSecs: number): number {
  return MIN_POST_DELAY_SECS + disputeWindowSecs;
}

/* Eighteen weekly locks, in unix seconds.
 *
 * ON A REAL CLOCK THESE ARE FACTS, NOT ARITHMETIC, and `firstKickoff` is
 * ignored. They come from the committed schedule, because a season's kickoffs
 * are not evenly spaced: week one to week two is eight days, week twelve moves
 * for Thanksgiving, week eighteen opens on a Saturday afternoon. The old
 * `start + n × 7 days` was three days out by the end of the season, and locking
 * a week at the wrong moment is the one thing this product cannot get wrong.
 *
 * On a fast clock there is no real season to read, so the compressed one is
 * generated from the anchor as before. */
export function seasonLockSchedule(firstKickoff: Date): number[] {
  if (!FAST_CLOCK) return realLockSchedule();
  const start = Math.floor(firstKickoff.getTime() / 1000);
  return Array.from({ length: WEEKS }, (_, i) => start + i * WEEK_SPACING_SECS);
}

/** After the last lock, with room for the season to finish. The program only
 *  requires it to be later than week 18; a fortnight is the deadman's grace,
 *  or a minute on a fast clock, where the point is to reach it. */
export function refundDeadlineFor(locks: number[]): number {
  return locks[WEEKS - 1] + (FAST_CLOCK ? 60 : 14 * 24 * 60 * 60);
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
