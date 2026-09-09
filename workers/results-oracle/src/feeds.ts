/* WHERE THE SCORES COME FROM, and there have to be two of them.
 *
 * Each feed is one function from a week to a Board: the same shape whatever
 * the source, abbreviations already in the on-chain spelling, `final` meaning
 * the feed itself considers the game over. Everything that differs between
 * providers stays inside its adapter, so adding a third, or swapping one for a
 * licensed one, touches this file and nothing else.
 *
 * ESPN comes through src/lib/scores.ts, the same parser the landing page
 * ticker uses, which is deliberate: if that endpoint changes shape, the ticker
 * breaks visibly on the front door at the same moment this feed starts
 * returning empty boards, and an empty board is a refusal to post rather than
 * a wrong one.
 *
 * api-sports.io is the second source. It is documented and keyed, its NFL
 * endpoint answers a whole week at once, and it is independent of ESPN — which
 * is the property that matters. TheSportsDB was tried first and rejected: its
 * 2026 NFL season held fifteen events, all in a placeholder round.
 *
 * THE FIXTURE FEED IS FOR DEVNET ONLY. It returns whatever board the
 * environment hands it, so a posting can be exercised end to end before any
 * game has been played. run.ts refuses to construct it on mainnet.
 */

import { fetchScoreboard } from "@/lib/scores";
import { TEAMS } from "@/lib/nfl";

import type { Board, Outcome } from "./decide";

export interface Feed {
  readonly name: string;
  week(week: number, season: number): Promise<Board>;
}

/** ESPN, through the app's own parser. */
export function espnFeed(): Feed {
  return {
    name: "espn",
    async week(week) {
      const b = await fetchScoreboard(week);
      const games: Outcome[] = b.games.map((g) => ({
        home: g.home.abbr,
        away: g.away.abbr,
        final: g.state === "post" && g.winner !== null,
        winner: g.state === "post" ? g.winner : null,
      }));
      return { source: "espn", games };
    },
  };
}

/* api-sports names teams in full: "Seattle Seahawks". The on-chain index
 * speaks in abbreviations, and TEAMS carries city and nickname for every club,
 * so the map is built from data that already exists rather than typed out
 * again. Lower-cased and squashed, because "Washington Commanders" and
 * "Washington  Commanders" are the same club. */
const FULL_NAME_TO_ABBR: Record<string, string> = Object.fromEntries(
  TEAMS.map((t) => [squash(`${t.city} ${t.name}`), t.abbr]),
);
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function abbrFromFullName(name: string): string | null {
  return FULL_NAME_TO_ABBR[squash(name)] ?? null;
}

type Unknown = Record<string, unknown>;
const obj = (v: unknown): Unknown =>
  typeof v === "object" && v !== null ? (v as Unknown) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/* api-sports marks a finished game FT, or AOT after overtime. Anything else
 * (NS, Q1..Q4, HT, OT, and the postponement codes) is not final, and a game
 * that is not final blocks the posting. */
const FINAL_STATUS = new Set(["FT", "AOT"]);

export function apiSportsFeed(apiKey: string, fetchImpl: typeof fetch = fetch): Feed {
  return {
    name: "apisports",
    async week(week, season) {
      const url = `https://v1.american-football.api-sports.io/games?league=1&season=${season}&week=${week}`;
      const res = await fetchImpl(url, {
        headers: { "x-apisports-key": apiKey, accept: "application/json" },
      });
      if (!res.ok) return { source: "apisports", games: [] };
      return { source: "apisports", games: parseApiSports(await res.json()) };
    },
  };
}

/** Exported so the parser can be tested against a captured response. */
export function parseApiSports(body: unknown): Outcome[] {
  const out: Outcome[] = [];
  for (const raw of arr(obj(body).response)) {
    const r = obj(raw);
    const teams = obj(r.teams);
    const home = abbrFromFullName(str(obj(teams.home).name));
    const away = abbrFromFullName(str(obj(teams.away).name));
    if (!home || !away) continue;

    const status = str(obj(obj(r.game).status).short);
    const final = FINAL_STATUS.has(status);
    const scores = obj(r.scores);
    const hs = num(obj(scores.home).total);
    const as = num(obj(scores.away).total);

    let winner: Outcome["winner"] = null;
    if (final && hs !== null && as !== null) {
      winner = hs > as ? "home" : as > hs ? "away" : "tie";
    }
    out.push({ home, away, final: final && winner !== null, winner });
  }
  return out;
}

/** A board handed in from the environment. Devnet only; see run.ts. */
export function fixtureFeed(name: string, board: Board): Feed {
  return { name, week: async () => ({ ...board, source: name }) };
}
