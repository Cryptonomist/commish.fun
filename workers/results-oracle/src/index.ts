/* The results oracle: a scheduled worker that posts a week's results when two
 * independent feeds agree, then cranks the week through to settlement.
 *
 * It holds one key, named on chain by the admin, that the program allows to
 * do exactly one thing: propose results. What it proposes waits out the same
 * dispute window and faces the same member veto as a commissioner's posting,
 * and the commissioner's own door stays open. So the worst this worker can do
 * is propose something the members refuse, and the thing it is for is that in
 * an ordinary week nobody has to remember anything.
 *
 * There is no HTTP surface. `scheduled` is the only entry point that acts;
 * `fetch` answers with a line of text and does nothing, so nothing can ask
 * this worker to post.
 */

import { runCycle, type Env } from "./run";

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    try {
      const s = await runCycle(env);
      console.log(
        JSON.stringify({
          cluster: s.cluster,
          poster: s.poster,
          pools: s.pools,
          actions: s.actions,
          errors: s.errors,
          skipped: s.skipped.length,
        }),
      );
      for (const k of s.skipped) console.log(`skip ${k.pool}: ${k.why}`);
    } catch (e) {
      console.error(`tick failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    }
  },

  async fetch(): Promise<Response> {
    return new Response("commish results oracle: runs on a schedule and takes no requests\n", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
} satisfies ExportedHandler<Env>;
