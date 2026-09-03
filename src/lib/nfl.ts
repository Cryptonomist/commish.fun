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

export const TEAMS = [
  { i: 0, abbr: "ARI", name: "Cardinals", city: "Arizona" },
  { i: 1, abbr: "ATL", name: "Falcons", city: "Atlanta" },
  { i: 2, abbr: "BAL", name: "Ravens", city: "Baltimore" },
  { i: 3, abbr: "BUF", name: "Bills", city: "Buffalo" },
  { i: 4, abbr: "CAR", name: "Panthers", city: "Carolina" },
  { i: 5, abbr: "CHI", name: "Bears", city: "Chicago" },
  { i: 6, abbr: "CIN", name: "Bengals", city: "Cincinnati" },
  { i: 7, abbr: "CLE", name: "Browns", city: "Cleveland" },
  { i: 8, abbr: "DAL", name: "Cowboys", city: "Dallas" },
  { i: 9, abbr: "DEN", name: "Broncos", city: "Denver" },
  { i: 10, abbr: "DET", name: "Lions", city: "Detroit" },
  { i: 11, abbr: "GB", name: "Packers", city: "Green Bay" },
  { i: 12, abbr: "HOU", name: "Texans", city: "Houston" },
  { i: 13, abbr: "IND", name: "Colts", city: "Indianapolis" },
  { i: 14, abbr: "JAX", name: "Jaguars", city: "Jacksonville" },
  { i: 15, abbr: "KC", name: "Chiefs", city: "Kansas City" },
  { i: 16, abbr: "LAC", name: "Chargers", city: "Los Angeles" },
  { i: 17, abbr: "LAR", name: "Rams", city: "Los Angeles" },
  { i: 18, abbr: "LV", name: "Raiders", city: "Las Vegas" },
  { i: 19, abbr: "MIA", name: "Dolphins", city: "Miami" },
  { i: 20, abbr: "MIN", name: "Vikings", city: "Minnesota" },
  { i: 21, abbr: "NE", name: "Patriots", city: "New England" },
  { i: 22, abbr: "NO", name: "Saints", city: "New Orleans" },
  { i: 23, abbr: "NYG", name: "Giants", city: "New York" },
  { i: 24, abbr: "NYJ", name: "Jets", city: "New York" },
  { i: 25, abbr: "PHI", name: "Eagles", city: "Philadelphia" },
  { i: 26, abbr: "PIT", name: "Steelers", city: "Pittsburgh" },
  { i: 27, abbr: "SEA", name: "Seahawks", city: "Seattle" },
  { i: 28, abbr: "SF", name: "49ers", city: "San Francisco" },
  { i: 29, abbr: "TB", name: "Buccaneers", city: "Tampa Bay" },
  { i: 30, abbr: "TEN", name: "Titans", city: "Tennessee" },
  { i: 31, abbr: "WAS", name: "Commanders", city: "Washington" },
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

/* Season anchor. Week 1 kicks off Thursday 10 September 2026, 8:20pm ET
 * (00:20 UTC on the 11th). Picks lock at the week's FIRST kickoff, which is
 * this moment for week 1 — the deadline the whole product is built around. */
export const SEASON = 2026;
export const WEEK_1_KICKOFF = new Date("2026-09-11T00:20:00Z");

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
