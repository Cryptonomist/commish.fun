/* Keep the site out of search results while it is on devnet.
 *
 * The pages talk about buy-ins, vaults and pots in the present tense, because
 * they describe what the program does. Devnet tokens have no value, so a
 * stranger arriving from a search result reads a money product and finds play
 * money, which is the worst order to learn that in.
 *
 * This is not access control and should not be mistaken for it. Anyone with
 * the link still gets the whole site, and a crawler that ignores robots.txt
 * still indexes it. It stops the site being FOUND, not the site being READ.
 * The access-control answer is Vercel's Deployment Protection.
 *
 * DELETE THIS FILE when the program goes to mainnet. A launched product that
 * cannot be found is a different bug, and this one is invisible: nothing will
 * fail, no build will break, the site will simply never appear in a search.
 * `scripts/mainnet-cutover.sh` names it for that reason.
 */

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
