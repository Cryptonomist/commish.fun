/* Reading a league that lives somewhere else.
 *
 * THIS IS THE WHOLE LEAGUE PITCH. The season is played on Sleeper, or ESPN, or
 * Yahoo, and Commish has no opinion about any of it — it holds the dues and
 * records who won. So the commissioner should not have to retype a final table
 * they are already looking at in another tab. Same argument as filling a week
 * from the scoreboard, and the same limit: it is a typing aid, never an oracle.
 * The chain sees what the commissioner signed and the members' veto is
 * untouched.
 *
 * SLEEPER, AND NOT THE OTHERS, FOR NOW. Sleeper publishes a documented REST API
 * that needs no token at all for reads. Yahoo's is real but wants an OAuth app
 * and an approved use case. ESPN has no public API: the one everybody uses is
 * undocumented and, for private leagues, needs the member's own `SWID` and
 * `espn_s2` session cookies out of their browser. Asking people to paste
 * session cookies into a site that holds their money is a habit worth not
 * teaching, so ESPN leagues type their standings in.
 *
 * NOTHING HERE IDENTIFIES A PERSON TO US. The route reads a league id and
 * returns names and records. It never sees a wallet, and the mapping from a
 * Sleeper display name to a pool member is a decision the commissioner makes
 * on screen, not one this file guesses at.
 */

const BASE = "https://api.sleeper.app/v1";

/** Sleeper league ids are numeric strings. Anything else is not a league id,
 *  and since this value ends up in a URL the check is a security boundary
 *  rather than a nicety: without it a caller chooses what the server fetches. */
export const isLeagueId = (id: string): boolean => /^[0-9]{6,24}$/.test(id);

export type SleeperStanding = {
  rank: number;
  rosterId: number;
  /** Team name if they set one, else their display name, else the user id. */
  name: string;
  wins: number;
  losses: number;
  ties: number;
  /** Points for, already recombined from Sleeper's split integer/decimal. */
  points: number;
};

export type SleeperLeague = {
  id: string;
  name: string;
  season: string;
  status: string;
  totalRosters: number;
  standings: SleeperStanding[];
  /** Roster ids from the playoff bracket, when the season has got that far. */
  championRosterId: number | null;
  runnerUpRosterId: number | null;
};

type RawUser = {
  user_id: string;
  display_name?: string;
  metadata?: { team_name?: string } | null;
};

type RawRoster = {
  roster_id: number;
  owner_id: string | null;
  settings?: {
    wins?: number;
    losses?: number;
    ties?: number;
    fpts?: number;
    fpts_decimal?: number;
  } | null;
};

type RawBracketMatch = {
  r?: number;
  /** Placement. 1 is the championship match where Sleeper provides it. */
  p?: number;
  w?: number | null;
  l?: number | null;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json" },
    // Sleeper asks for under 1000 calls a minute. The route caches so a league
    // being watched by twelve people is still one call.
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "No league with that id."
        : `Sleeper returned ${res.status}.`,
    );
  }
  return (await res.json()) as T;
}

/** Points for, as one number. Sleeper splits it: 1234 and 56 means 1234.56. */
const points = (r: RawRoster): number =>
  (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100;

export async function fetchSleeperLeague(id: string): Promise<SleeperLeague> {
  if (!isLeagueId(id)) throw new Error("That is not a Sleeper league id.");

  const [league, users, rosters] = await Promise.all([
    get<{
      league_id: string;
      name?: string;
      season?: string;
      status?: string;
      total_rosters?: number;
    }>(`/league/${id}`),
    get<RawUser[]>(`/league/${id}/users`),
    get<RawRoster[]>(`/league/${id}/rosters`),
  ]);

  /* The bracket only exists once the playoffs are drawn, and asking for it
   * before then is a 404 or an empty array rather than an error worth
   * surfacing. A league mid-season still has standings. */
  const bracket = await get<RawBracketMatch[]>(
    `/league/${id}/winners_bracket`,
  ).catch(() => [] as RawBracketMatch[]);

  const nameOf = new Map(
    users.map((u) => [
      u.user_id,
      u.metadata?.team_name?.trim() || u.display_name?.trim() || u.user_id,
    ]),
  );

  /* Wins first, then points for. That is the ordinary tiebreak and it is what
   * a commissioner is looking at in the other tab — but it is the REGULAR
   * SEASON table, and in most leagues the champion comes out of the bracket
   * instead. Both are returned so the screen can say which is which rather
   * than quietly presenting one as the other. */
  const standings: SleeperStanding[] = rosters
    .map((r) => ({
      rosterId: r.roster_id,
      name: r.owner_id ? (nameOf.get(r.owner_id) ?? `Roster ${r.roster_id}`) : `Roster ${r.roster_id}`,
      wins: r.settings?.wins ?? 0,
      losses: r.settings?.losses ?? 0,
      ties: r.settings?.ties ?? 0,
      points: points(r),
    }))
    .sort((a, b) => b.wins - a.wins || b.points - a.points)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  /* The championship match, when Sleeper labels one. `p: 1` is the placement
   * marker; where it is absent the last round is the final, and a round with a
   * third-place match in it would make "the last match" the wrong answer, so
   * an unlabelled bracket is left alone rather than guessed at. */
  const final =
    bracket.find((m) => m.p === 1) ??
    (bracket.every((m) => m.p === undefined) && bracket.length > 0
      ? bracket.reduce((best, m) => ((m.r ?? 0) > (best.r ?? 0) ? m : best))
      : undefined);

  return {
    id: league.league_id ?? id,
    name: league.name?.trim() || "Untitled league",
    season: league.season ?? "",
    status: league.status ?? "",
    totalRosters: league.total_rosters ?? rosters.length,
    standings,
    championRosterId: final?.w ?? null,
    runnerUpRosterId: final?.l ?? null,
  };
}

/** The standings in the order a payout sheet usually wants them: the bracket
 *  champion first when there is one, then the rest by the regular-season
 *  table. Returned separately from `standings` so a caller can show both and
 *  let a person choose, rather than this file deciding what "1st" means in
 *  somebody else's league. */
export function payoutOrder(league: SleeperLeague): SleeperStanding[] {
  const { championRosterId, runnerUpRosterId, standings } = league;
  if (championRosterId === null) return standings;

  const pull = (id: number | null) =>
    id === null ? null : (standings.find((s) => s.rosterId === id) ?? null);
  const first = pull(championRosterId);
  const second = pull(runnerUpRosterId);
  const rest = standings.filter(
    (s) => s !== first && s !== second,
  );
  return [first, second, ...rest].filter((s): s is SleeperStanding => s !== null);
}
