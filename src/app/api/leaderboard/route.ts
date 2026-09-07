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
    /* Say which failure it is, without repeating Cloudflare word for word.
     *
     * "Unavailable" was the same word for "nobody set the credentials" and
     * "the credentials were refused", and those have opposite fixes, so the
     * kind is worth naming. The DETAIL is not, and the first version of this
     * got that wrong: it reflected `problem.detail` verbatim, and Cloudflare's
     * error 7003 quotes the request path back at you. That path is
     * `/client/v4/accounts/<CF_ACCOUNT_ID>/d1/database/<CF_D1_DATABASE_ID>/query`,
     * so a public 503 was one upstream message away from printing both ids. A
     * comment two files away asserted there was nothing in these strings worth
     * withholding; the comment was not a check, and it was wrong.
     *
     * So the kind goes to the caller and the message goes to the log, where
     * whoever is deploying can read it and nobody else can.
     *
     * The variable names are a different matter. They are in `.env.example` in
     * a public repository, they say nothing about this deployment, and naming
     * them is the entire difference between a five-minute fix and an
     * afternoon.
     *
     * Never cached: a 503 stuck in a CDN for a minute after the fix lands is
     * its own small trap. */
    const problem = result.problem;

    if (problem.kind === "rejected") {
      console.error("[leaderboard] Cloudflare rejected the query:", problem.detail);
    }

    const error =
      problem.kind === "unconfigured"
        ? `The leaderboard is not configured. Missing: ${problem.missing.join(", ")}. ` +
          "Set these in the Vercel project (the CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID " +
          "and CLOUDFLARE_API_TOKEN spellings are also accepted) and redeploy."
        : "The leaderboard's database refused the query. The reason is in the " +
          "server logs; it is usually an API token without D1 Edit on this database, " +
          "or a schema that has not been applied.";

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
