/* NFL constants, shared by the app and the on-chain program.
 *
 * THE TEAM INDEX IS A CONTRACT. The Anchor program stores a member's used teams
 * as a 32-bit mask, one bit per team, and a pick as a single u8. Both sides must
 * agree on which number is which team forever — a reordering after a pool is
 * created silently rewrites everyone's history.
 *
 * So the order is fixed: the 32 teams sorted by their standard abbreviation,
 * ARI = 0 through WAS = 31. Alphabetical is chosen precisely because it is
 * mechanical; there is no judgement to drift.
 */

/* TEAM COLOURS ARE CONTENT, NOT PALETTE.
 *
 * The Pigskin rules govern the product's own surfaces. These thirty-two pairs
 * are data about somebody else's brand, the way a photograph is, and they are
 * the reason a fan can find Buffalo in a thirty-two cell grid without reading a
 * word. That is worth more than it looks: a Survivor grid is scanned under time
 * pressure, minutes before a lock.
 *
 * NO LOGOS. Club marks are registered trademarks and this product takes money,
 * which makes using them a licensing question rather than a design one. Colours
 * are not protectable in this use and carry most of the recognition anyway.
 *
 * `lead` is the colour that has to survive being drawn on a near-black button,
 * so for the clubs whose primary is black or a very dark navy it is the other
 * one. Raiders lead silver, Saints lead gold. Every team here has at least one
 * colour that reads against `--color-night-2`, which is what makes the two-stop
 * stripe legible for all thirty-two.
 */
export const TEAMS = [
  { i: 0, abbr: "ARI", name: "Cardinals", city: "Arizona", lead: "#97233F", trim: "#FFB612" },
  { i: 1, abbr: "ATL", name: "Falcons", city: "Atlanta", lead: "#A71930", trim: "#A5ACAF" },
  { i: 2, abbr: "BAL", name: "Ravens", city: "Baltimore", lead: "#241773", trim: "#9E7C0C" },
  { i: 3, abbr: "BUF", name: "Bills", city: "Buffalo", lead: "#00338D", trim: "#C60C30" },
  { i: 4, abbr: "CAR", name: "Panthers", city: "Carolina", lead: "#0085CA", trim: "#BFC0BF" },
  { i: 5, abbr: "CHI", name: "Bears", city: "Chicago", lead: "#C83803", trim: "#0B162A" },
  { i: 6, abbr: "CIN", name: "Bengals", city: "Cincinnati", lead: "#FB4F14", trim: "#101820" },
  { i: 7, abbr: "CLE", name: "Browns", city: "Cleveland", lead: "#FF3C00", trim: "#311D00" },
  { i: 8, abbr: "DAL", name: "Cowboys", city: "Dallas", lead: "#869397", trim: "#041E42" },
  { i: 9, abbr: "DEN", name: "Broncos", city: "Denver", lead: "#FB4F14", trim: "#002244" },
  { i: 10, abbr: "DET", name: "Lions", city: "Detroit", lead: "#0076B6", trim: "#B0B7BC" },
  { i: 11, abbr: "GB", name: "Packers", city: "Green Bay", lead: "#FFB612", trim: "#203731" },
  { i: 12, abbr: "HOU", name: "Texans", city: "Houston", lead: "#A71930", trim: "#03202F" },
  { i: 13, abbr: "IND", name: "Colts", city: "Indianapolis", lead: "#5D8FBC", trim: "#A2AAAD" },
  { i: 14, abbr: "JAX", name: "Jaguars", city: "Jacksonville", lead: "#00839C", trim: "#D7A22A" },
  { i: 15, abbr: "KC", name: "Chiefs", city: "Kansas City", lead: "#E31837", trim: "#FFB81C" },
  { i: 16, abbr: "LAC", name: "Chargers", city: "Los Angeles", lead: "#0080C6", trim: "#FFC20E" },
  { i: 17, abbr: "LAR", name: "Rams", city: "Los Angeles", lead: "#5A7FC4", trim: "#FFA300" },
  { i: 18, abbr: "LV", name: "Raiders", city: "Las Vegas", lead: "#A5ACAF", trim: "#101820" },
  { i: 19, abbr: "MIA", name: "Dolphins", city: "Miami", lead: "#008E97", trim: "#FC4C02" },
  { i: 20, abbr: "MIN", name: "Vikings", city: "Minnesota", lead: "#6B3FA0", trim: "#FFC62F" },
  { i: 21, abbr: "NE", name: "Patriots", city: "New England", lead: "#C60C30", trim: "#B0B7BC" },
  { i: 22, abbr: "NO", name: "Saints", city: "New Orleans", lead: "#D3BC8D", trim: "#101820" },
  { i: 23, abbr: "NYG", name: "Giants", city: "New York", lead: "#A71930", trim: "#1B3A8C" },
  { i: 24, abbr: "NYJ", name: "Jets", city: "New York", lead: "#2A8B62", trim: "#F0F2EC" },
  { i: 25, abbr: "PHI", name: "Eagles", city: "Philadelphia", lead: "#1B7F86", trim: "#A5ACAF" },
  { i: 26, abbr: "PIT", name: "Steelers", city: "Pittsburgh", lead: "#FFB612", trim: "#101820" },
  { i: 27, abbr: "SEA", name: "Seahawks", city: "Seattle", lead: "#69BE28", trim: "#4A7CC0" },
  { i: 28, abbr: "SF", name: "49ers", city: "San Francisco", lead: "#C8102E", trim: "#B3995D" },
  { i: 29, abbr: "TB", name: "Buccaneers", city: "Tampa Bay", lead: "#D50A0A", trim: "#FF7900" },
  { i: 30, abbr: "TEN", name: "Titans", city: "Tennessee", lead: "#4B92DB", trim: "#0C2340" },
  { i: 31, abbr: "WAS", name: "Commanders", city: "Washington", lead: "#FFB612", trim: "#7A2226" },
] as const;

export type Team = (typeof TEAMS)[number];

export const teamByIndex = (i: number): Team | undefined => TEAMS[i];
export const teamByAbbr = (abbr: string): Team | undefined =>
  TEAMS.find((t) => t.abbr === abbr.toUpperCase());

/** Has this member already spent that team? (mask is the on-chain u32) */
export const hasUsedTeam = (mask: number, teamIndex: number): boolean =>
  (mask & (1 << teamIndex)) !== 0;

/** The mask after spending a team. Pure — callers own the write. */
export const withTeamUsed = (mask: number, teamIndex: number): number =>
  (mask | (1 << teamIndex)) >>> 0;

/** Which teams are still available to a member. */
export const availableTeams = (mask: number): Team[] =>
  TEAMS.filter((t) => !hasUsedTeam(mask, t.i));

/* Season anchor. Week 1 kicks off WEDNESDAY 9 September 2026, 8:20pm EDT
 * (00:20 UTC on the 10th), New England at Seattle. Picks lock at the week's
 * FIRST kickoff, which is this moment for week 1 — the deadline the whole
 * product is built around.
 *
 * THIS WAS WRONG BY EXACTLY TWENTY-FOUR HOURS and it is worth saying why,
 * because the failure was not cosmetic. It read Thursday the 10th, on the
 * reasonable assumption that a season opens on a Thursday. 2026 opens on a
 * Wednesday. `seasonLockSchedule` derives all eighteen locks from this instant
 * and `create_pool` writes them on chain, where `submit_pick` enforces them —
 * so every pool built from the old value would have accepted picks for a full
 * day after the opener had been played. Someone could have watched Seattle
 * win and then picked Seattle.
 *
 * Verified against the league schedule rather than reasoned about. The deeper
 * fix is not to anchor a season on one constant at all: real weeks are not
 * seven days apart, so see the note in lib/schedule.ts. */
export const SEASON = 2026;
export const WEEK_1_KICKOFF = new Date("2026-09-10T00:20:00Z");

/* ESPN calls Washington WSH. The on-chain team index calls it WAS, and that
 * index is a contract that cannot move. One alias, in one place. */
const FEED_ALIASES: Record<string, string> = { WSH: "WAS" };

/** Normalize a feed's abbreviation to the one the program uses. */
export const abbrFromFeed = (abbr: string): string =>
  FEED_ALIASES[abbr.toUpperCase()] ?? abbr.toUpperCase();

/** Weeks are 7 days from week 1's kickoff. Good enough for the countdown and
 *  the UI; the on-chain lock time is whatever the pool was created with. */
export function kickoffForWeek(week: number): Date {
  return new Date(WEEK_1_KICKOFF.getTime() + (week - 1) * 7 * 24 * 3600 * 1000);
}

/** The week currently being played, 1-18, or 0 before the season opens. */
export function currentWeek(now: Date = new Date()): number {
  const ms = now.getTime() - WEEK_1_KICKOFF.getTime();
  if (ms < 0) return 0;
  return Math.min(18, Math.floor(ms / (7 * 24 * 3600 * 1000)) + 1);
}
