/* A week's scoreboard, and where it comes from.
 *
 * THIS FEEDS NOTHING. It draws a bar on the landing page and it must never do
 * anything else. The entire trust story is that results enter through the
 * commissioner and every member can check them against a public scoreboard —
 * if this file ever reached `post_results`, the product would have quietly
 * become an oracle with no oracle's guarantees, and members would be trusting
 * an undocumented endpoint instead of their own eyes. The ticker lives on the
 * front door and nowhere near a pool for that reason.
 *
 * THE PROVIDER IS ONE FUNCTION. `Scoreboard` is the shape the app knows about;
 * `fetchScoreboard` is the only thing that talks to anybody. Swapping ESPN for
 * a licensed feed is this file and nothing else.
 *
 * ESPN's endpoint is undocumented, unversioned and unsupported. It is here to
 * see the thing working, not to run under a product that takes money: it can
 * change shape or start refusing without notice, and it carries no commercial
 * licence. Everything below parses defensively and returns an empty board
 * rather than throwing, so the worst case is a bar that falls back to the
 * countdown.
 */

import { abbrFromFeed, SEASON } from "@/lib/nfl";

export type GameState = "pre" | "in" | "post";

export type Game = {
  id: string;
  state: GameState;
  /** "8:20 PM EDT", "Q3 4:12", "Final" — whatever the feed calls it. */
  detail: string;
  home: { abbr: string; score: number | null };
  away: { abbr: string; score: number | null };
  /* Who won, but only once the game is over. `null` while it is scheduled or
   * in progress, which is what lets the results form fill only what is settled
   * and leave the rest for the commissioner to wait on. "tie" is its own answer
   * rather than a missing one: a tie is a real NFL outcome and, per the rules,
   * a loss for both sides rather than a push. */
  winner: "home" | "away" | "tie" | null;
};

export type Scoreboard = {
  season: number | null;
  week: number | null;
  games: Game[];
  /** Which feed answered, so the UI can say so and a swap is visible. */
  source: "espn" | "none";
};

export const EMPTY_BOARD: Scoreboard = {
  season: null,
  week: null,
  games: [],
  source: "none",
};

const ESPN =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

type Unknown = Record<string, unknown>;
const obj = (v: unknown): Unknown => (typeof v === "object" && v !== null ? (v as Unknown) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** ESPN reports scores as strings, and as "" before kickoff. */
function toScore(v: unknown): number | null {
  const n = Number(str(v));
  return str(v) !== "" && Number.isFinite(n) ? n : null;
}

function toState(v: string): GameState {
  return v === "in" || v === "post" ? v : "pre";
}

/** One ESPN event to one Game, or null if it is not shaped like a game. */
function toGame(raw: unknown): Game | null {
  const e = obj(raw);
  const comp = obj(arr(e.competitions)[0]);
  const teams = arr(comp.competitors);
  if (teams.length !== 2) return null;

  const side = (want: string) => {
    const c = obj(teams.find((t) => str(obj(t).homeAway) === want));
    const abbr = abbrFromFeed(str(obj(c.team).abbreviation));
    return abbr ? { abbr, score: toScore(c.score) } : null;
  };

  const home = side("home");
  const away = side("away");
  if (!home || !away) return null;

  const type = obj(obj(e.status).type);
  const state = toState(str(type.state));

  /* Only a completed game has a winner. The feed marks one competitor
   * `winner: true`; a completed game with neither marked is a tie. */
  let winner: Game["winner"] = null;
  if (state === "post" && type.completed === true) {
    const flag = (want: string) =>
      obj(teams.find((t) => str(obj(t).homeAway) === want)).winner === true;
    winner = flag("home") ? "home" : flag("away") ? "away" : "tie";
  }

  return {
    id: str(e.id) || `${away.abbr}-${home.abbr}`,
    state,
    // shortDetail is the compact one: "9/9 - 8:20 PM EDT", "Final", "Q3 4:12".
    detail: str(type.shortDetail) || str(type.description),
    home,
    away,
    winner,
  };
}

/** A week's board, or the current one when no week is named. Never throws; an
 *  unreachable feed is an empty board, which the ticker renders as the
 *  countdown instead and the results form reports as "could not reach". */
export async function fetchScoreboard(week?: number): Promise<Scoreboard> {
  try {
    const url =
      week && week >= 1 && week <= 18
        ? `${ESPN}?seasontype=2&week=${week}&dates=${SEASON}`
        : ESPN;
    const res = await fetch(url, {
      // One upstream call a minute for the whole site, not one per visitor.
      next: { revalidate: 60 },
      headers: { accept: "application/json" },
    });
    if (!res.ok) return EMPTY_BOARD;

    const d = obj(await res.json());
    const games = arr(d.events)
      .map(toGame)
      .filter((g): g is Game => g !== null);

    // Named apart from the `week` parameter: this is what the feed answered
    // with, which is not necessarily what was asked for.
    const season = obj(d.season).year;
    const weekNo = obj(d.week).number;
    return {
      season: typeof season === "number" ? season : null,
      week: typeof weekNo === "number" ? weekNo : null,
      games,
      source: "espn",
    };
  } catch {
    return EMPTY_BOARD;
  }
}
