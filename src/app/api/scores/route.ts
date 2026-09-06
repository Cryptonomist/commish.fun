/* The only server route in the app, and it reads one public endpoint.
 *
 * It exists so the upstream feed is called once a minute for everybody rather
 * than once per visitor, and so the browser never talks to a third party
 * directly: whoever is serving scores does not get to see who is reading the
 * landing page.
 *
 * It takes no input and returns no user data, which is what keeps it a cache
 * rather than an API surface.
 */

import { fetchScoreboard } from "@/lib/scores";

/** Rebuild at most once a minute. In-play scores move slower than that. */
export const revalidate = 60;

export async function GET(request: Request) {
  /* `?week=N` for the results form, which needs a specific week rather than
   * whichever one the feed thinks is current. Anything unparseable falls back
   * to the current board rather than erroring: this is a cache, not an API. */
  const raw = new URL(request.url).searchParams.get("week");
  const week = raw && /^\d+$/.test(raw) ? Number(raw) : undefined;
  const board = await fetchScoreboard(week);
  return Response.json(board, {
    headers: {
      // Let the CDN serve a slightly stale board rather than a slow one, and
      // keep serving the last good answer for five minutes if the feed dies.
      "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
