/* The start week the create-pool form proposes, as the season moves under it.
 *
 * WHAT THIS EXISTS TO CATCH. The form used to open on week one and stay there
 * all season. `create_pool` refuses a week that has already kicked off, so from
 * the first kickoff of September onward the default was an illegal pool: the
 * commissioner filled in a buy-in, a name and a dispute window, and the only
 * thing that told them the week was gone was a validation line at the bottom.
 *
 * The rule is one sentence — the default is the earliest week that has not
 * kicked off — and the tests below are about its edges, because that is where
 * a schedule rule goes wrong: the instant of the lock itself, the last week of
 * the season, and the days after it when there is no legal answer at all.
 */

import { expect } from "chai";

import {
  defaultStartWeek,
  seasonIsOver,
  validateSchedule,
  DEFAULT_DISPUTE_WINDOW_SECS,
  WEEKS,
} from "@/lib/schedule";
import { realLockSchedule } from "@/lib/season";

const LOCKS = realLockSchedule();
const DAY = 24 * 60 * 60;

describe("the start week a new pool defaults to", () => {
  it("is week 1 all through the preseason", () => {
    expect(defaultStartWeek(LOCKS[0] - 90 * DAY)).to.equal(1);
    expect(defaultStartWeek(LOCKS[0] - DAY)).to.equal(1);
    expect(defaultStartWeek(LOCKS[0] - 1)).to.equal(1);
  });

  /* THE LOCK IS THE BOUNDARY, not the end of the week's games. A pool starting
   * on a week whose first game has kicked off would be taking picks on a game
   * in progress, which is the one thing `submit_pick` exists to prevent. */
  it("rolls to week 2 at the exact second week 1 locks", () => {
    expect(defaultStartWeek(LOCKS[0] - 1)).to.equal(1);
    expect(defaultStartWeek(LOCKS[0])).to.equal(2);
    expect(defaultStartWeek(LOCKS[0] + 1)).to.equal(2);
  });

  it("holds a week until that week locks, then moves on", () => {
    /* Every week, not just the first: week N is the answer for the whole
     * stretch between week N-1's lock and its own. */
    for (let w = 1; w < WEEKS; w++) {
      const thisLock = LOCKS[w - 1];
      const nextLock = LOCKS[w];
      expect(defaultStartWeek(thisLock), `at week ${w}'s lock`).to.equal(w + 1);
      expect(
        defaultStartWeek(Math.floor((thisLock + nextLock) / 2)),
        `midway through week ${w}`,
      ).to.equal(w + 1);
      expect(defaultStartWeek(nextLock - 1), `just before week ${w + 1}`).to.equal(
        w + 1,
      );
    }
  });

  /* The season does not have a nineteenth week to offer, so the floor is
   * eighteen and it is `validateSchedule`'s job to explain that it is gone. */
  it("stops at the last week rather than inventing one past it", () => {
    expect(defaultStartWeek(LOCKS[WEEKS - 1] - 1)).to.equal(WEEKS);
    expect(defaultStartWeek(LOCKS[WEEKS - 1])).to.equal(WEEKS);
    expect(defaultStartWeek(LOCKS[WEEKS - 1] + 30 * DAY)).to.equal(WEEKS);
  });

  it("knows when the season has no week left in it", () => {
    expect(seasonIsOver(LOCKS[0] - DAY)).to.equal(false);
    expect(seasonIsOver(LOCKS[WEEKS - 1] - 1)).to.equal(false);
    expect(seasonIsOver(LOCKS[WEEKS - 1])).to.equal(true);
  });

  /* The point of the whole exercise: what the form proposes is what the
   * program will accept. Sampled across the season rather than at one date,
   * because the failure this replaces was a default that was right in August
   * and wrong every week after. */
  it("proposes a week the validator accepts, every week of the season", () => {
    const times = [
      LOCKS[0] - 30 * DAY,
      LOCKS[0] - 1,
      ...LOCKS.slice(0, WEEKS - 1).flatMap((lock) => [lock, lock + DAY]),
    ];
    for (const nowSecs of times) {
      const startWeek = defaultStartWeek(nowSecs);
      const problem = validateSchedule({
        locks: LOCKS,
        disputeWindowSecs: DEFAULT_DISPUTE_WINDOW_SECS,
        startWeek,
        nowSecs,
      });
      expect(
        problem,
        `week ${startWeek} at ${new Date(nowSecs * 1000).toISOString()}: ` +
          `${problem?.message ?? ""}`,
      ).to.equal(null);
    }
  });

  it("says the season is out of weeks instead of telling you to pick a later one", () => {
    const after = validateSchedule({
      locks: LOCKS,
      disputeWindowSecs: DEFAULT_DISPUTE_WINDOW_SECS,
      startWeek: WEEKS,
      nowSecs: LOCKS[WEEKS - 1] + DAY,
    });
    expect(after?.field).to.equal("startWeek");
    expect(after?.message).to.contain("no week left");
    expect(after?.message).to.not.contain("later one");

    /* Mid-season the advice is still good, so it is still given. */
    const midseason = validateSchedule({
      locks: LOCKS,
      disputeWindowSecs: DEFAULT_DISPUTE_WINDOW_SECS,
      startWeek: 1,
      nowSecs: LOCKS[0] + DAY,
    });
    expect(midseason?.message).to.contain("later one");
  });
});
