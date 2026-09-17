/* THE LONG KICK GAME'S RULES. No React, no canvas.
 *
 * One kick at a time from further and further back, until three misses end the
 * run. The score is the longest kick you made, and the number to chase is the
 * league's record.
 *
 * WHY THREE MISSES AND NOT ONE. The homepage's kick is a streak, and a streak
 * is the right game for a toy in a hero that somebody passes on the way to
 * something else. This one is a destination, and the interesting kicks are all
 * at the far end of the ladder: a single miss sending you back to thirty yards
 * means most people never see a sixty-yarder. Three strikes, with a miss
 * retaken from the same spot, means the game spends its time where the drama
 * is.
 */

export const START_DISTANCE = 30;
export const STRIKES = 3;

/* THE RECORD, AND WHERE IT CAME FROM. Sixty-eight yards, Cam Little of
 * Jacksonville at Las Vegas on 2 November 2025, two yards past the sixty-six
 * Justin Tucker had held since 2021. Only regular-season and playoff kicks
 * count, so his seventy-yarder in the 2025 preseason does not. Checked against
 * the league's record book in September 2026; if it falls, this is the line to
 * change. */
export const NFL_RECORD = 68;
export const NFL_RECORD_HOLDER = "Cam Little, 2025";

/** Five yards a rung to fifty, three to sixty-two, then two at a time: the
 *  kicks near the record are where the ladder slows down, because that is
 *  where every yard is a decision. */
export function nextDistance(d: number): number {
  return d < 50 ? d + 5 : d < 62 ? d + 3 : d + 2;
}

export type Run = {
  distance: number;
  strikesLeft: number;
  made: number;
  kicks: number;
  /** The longest kick made this run, or 0. */
  longest: number;
};

export const newRun = (): Run => ({
  distance: START_DISTANCE,
  strikesLeft: STRIKES,
  made: 0,
  kicks: 0,
  longest: 0,
});

/** A make moves you back; a miss costs a strike and you go again from there. */
export function afterKick(run: Run, good: boolean): Run {
  return good
    ? {
        distance: nextDistance(run.distance),
        strikesLeft: run.strikesLeft,
        made: run.made + 1,
        kicks: run.kicks + 1,
        longest: Math.max(run.longest, run.distance),
      }
    : {
        ...run,
        strikesLeft: run.strikesLeft - 1,
        kicks: run.kicks + 1,
      };
}

export const runOver = (run: Run): boolean => run.strikesLeft <= 0;

/** What the banner says under the call, if anything is worth saying. `best` is
 *  the personal best from before this kick. */
export function noteFor(distance: number, good: boolean, best: number): string | null {
  if (!good) return null;
  if (distance > NFL_RECORD) return `LONGER THAN THE NFL RECORD OF ${NFL_RECORD}!`;
  if (distance === NFL_RECORD) return `THAT TIES THE NFL RECORD!`;
  if (distance > best && best > 0) return `NEW PERSONAL BEST: ${distance} YARDS`;
  return null;
}

/** Whether a make deserves confetti: a personal best, or anything at or past
 *  the record. A first-ever make from thirty yards is a best, and it is also
 *  not a celebration, so a best only counts from forty on. */
export function celebrates(distance: number, good: boolean, best: number): boolean {
  if (!good) return false;
  return distance >= NFL_RECORD || (distance > best && distance >= 40);
}
