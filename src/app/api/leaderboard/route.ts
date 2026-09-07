/* The leaderboard as JSON.
 *
 * The page does not use this. It calls `buildLeaderboard` directly, because a
 * server component fetching its own API over HTTP is a round trip through the
 * network to reach a function in the same process. This route exists for
 * anyone who wants the numbers without the markup.
 *
 * `force-dynamic` rather than a prerender: a build with no D1 credentials
 * would otherwise bake an error into the route, and a leaderboard frozen at
 * build time is not a leaderboard. The CDN still caches it for a minute.
 */

import { buildLeaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const board = await buildLeaderboard();

  if (!board) {
    return Response.json(
      { error: "The leaderboard is not available." },
      { status: 503 },
    );
  }

  return Response.json(board, {
    headers: {
      "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
