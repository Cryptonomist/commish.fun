/* Read a Sleeper league, server side.
 *
 * The scores route next door takes no input, which is what makes it a cache
 * rather than an API surface. This one takes a league id from whoever is
 * asking, and that changes what it has to be careful about: a route that
 * fetches a URL built from user input is a request forgery waiting to happen.
 * `isLeagueId` is the boundary — six to twenty-four digits and nothing else, so
 * there is no path, no host and no scheme a caller can influence.
 *
 * It also keeps the browser from talking to Sleeper directly, so Sleeper does
 * not learn which of our members is reading which league, and twelve people
 * watching one payout sheet is one upstream call rather than twelve.
 */

import { fetchSleeperLeague, isLeagueId } from "@/lib/sleeper";

/** Standings move once a week at most. Five minutes is generous. */
export const revalidate = 300;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("league")?.trim() ?? "";

  if (!isLeagueId(id)) {
    return Response.json(
      {
        error:
          "That is not a Sleeper league id. It is the long number in the " +
          "league's URL, like sleeper.com/leagues/123456789012345678.",
      },
      { status: 400 },
    );
  }

  try {
    const league = await fetchSleeperLeague(id);
    return Response.json(league, {
      headers: {
        "cache-control": "public, s-maxage=300, stale-while-revalidate=900",
      },
    });
  } catch (e) {
    /* Sleeper being down, or a league id that is well-formed but not real.
     * Neither is our fault and neither is the caller's problem to debug, so
     * the message says which it was and stops there. */
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not reach Sleeper." },
      { status: 502 },
    );
  }
}
