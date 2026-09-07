/* The leaderboard as JSON.
 *
 * The page does not use this. It calls `buildLeaderboard` directly, because a
 * server component fetching its own API over HTTP is a round trip through the
 * network to reach a function in the same process. This route exists for
 * anyone who wants the numbers without the markup, and as the place an
 * operator looks first when the page says it cannot load.
 *
 * `force-dynamic` rather than a prerender: a build with no D1 credentials
 * would otherwise bake an error into the route, and a leaderboard frozen at
 * build time is not a leaderboard. The CDN still caches it for a minute.
 */

import { buildLeaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await buildLeaderboard();

  if (!result.ok) {
    /* Say which failure it is.
     *
     * "Unavailable" is the same word for "nobody set the credentials" and "the
     * credentials were refused", and those have opposite fixes. Both messages
     * describe OUR configuration, name no user and expose no value, so the
     * only thing distinguishing them costs is that whoever is deploying stops
     * guessing.
     *
     * Never cached: a 503 that sticks in a CDN for a minute after the fix
     * lands is its own small trap. */
    const problem = result.problem;
    const error =
      problem.kind === "unconfigured"
        ? `The leaderboard is not configured. Missing: ${problem.missing.join(", ")}. ` +
          "Set these in the Vercel project (the CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID " +
          "and CLOUDFLARE_API_TOKEN spellings are also accepted) and redeploy."
        : `Cloudflare refused the query: ${problem.detail}`;

    return Response.json(
      { error, problem: problem.kind },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json(result.board, {
    headers: {
      "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
