/* The public leaderboard.
 *
 * Rendered on the server so the page is a page, not a spinner that turns into
 * one. The panel that changes your own listing is the one client island on it.
 *
 * Everything here comes from people who signed a message saying "publish this
 * pairing", so the page has no filters, no search and no way to look up an
 * address that did not opt in. That is not an omission. A leaderboard that
 * doubles as a handle-to-address lookup for everybody who linked would make
 * the second opt-in meaningless.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/Laces";
import { SiteFooter } from "@/components/SiteFooter";
import { WalletButton } from "@/components/WalletButton";
import XLink from "@/components/XLink";
import { formatUsdc, shortAddress } from "@/lib/format";
import { buildLeaderboard } from "@/lib/leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard",
  description:
    "Commish players who chose to be listed in public, and what they have won.",
};

/** Matches the API route, so the page and the data it shows go stale together. */
export const revalidate = 60;

/** Totals travel as decimal strings because JSON has no u64. The shared
 *  formatter takes it from there, so a dollar here reads exactly like a dollar
 *  on a pool page. */
const usd = (base: string): string => formatUsdc(BigInt(base || "0"));

export default async function LeaderboardPage() {
  /* Called directly rather than through `/api/leaderboard`. A server component
   * fetching its own API is a network round trip to reach a function in the
   * same process, and it needs an absolute URL it has no reliable way to
   * know. */
  const result = await buildLeaderboard();
  const data = result.ok ? result.board : null;

  /* Same shell as every other page: the mark, the wallet button, and the
   * footer. The footer is not decoration here, it is where the terms and the
   * privacy policy live, and this is a page that talks people into publishing
   * their handle. It would be a strange one to leave them off. */
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <Link href="/" aria-label="Commish home">
          <Wordmark size={20} />
        </Link>
        <WalletButton />
      </header>

      <main className="flex flex-col gap-8 py-10">
        <div className="flex flex-col gap-3">
          <h1 className="display text-4xl uppercase sm:text-5xl">Leaderboard</h1>
          {/* One line. The mechanics of the second opt-in belong on the panel
              below, where somebody is actually deciding, and on the privacy
              page. Explaining them here made a leaderboard read like a policy
              document to people who only wanted to see who was winning. */}
          <p className="max-w-xl text-sm leading-relaxed text-cream-dim">
            Players who chose to be listed. Wins are read from the chain.
          </p>
        </div>

      {data === null ? (
        <p className="rounded-xl border border-night-3 bg-night-2 p-4 text-sm text-cream-dim">
          The leaderboard could not be loaded just now. Nothing is wrong with
          your pool: this page reads a cache and the cache is having a moment.
        </p>
      ) : data.rows.length === 0 ? (
        <p className="rounded-xl border border-night-3 bg-night-2 p-4 text-sm text-cream-dim">
          Nobody has opted in yet. Be the first, or do not: a pool works exactly
          the same either way.
        </p>
      ) : (
        <>
          {!data.live ? (
            /* Say so rather than showing stale numbers as though they were
             * live. A leaderboard that quietly lies about being current is
             * worse than one that admits it is a minute behind. */
            <p className="text-xs text-cream-dim">
              Showing the last cached standings. The chain could not be reached
              on this refresh.
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-cream-dim">
                  <th className="border-b border-night-3 py-2 pr-3 font-semibold">
                    #
                  </th>
                  <th className="border-b border-night-3 py-2 pr-3 font-semibold">
                    Player
                  </th>
                  <th className="border-b border-night-3 py-2 pr-3 text-right font-semibold">
                    Pools
                  </th>
                  <th className="border-b border-night-3 py-2 pr-3 text-right font-semibold">
                    Won
                  </th>
                  <th className="border-b border-night-3 py-2 text-right font-semibold">
                    Claimed
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.wallet}>
                    <td className="border-b border-night-3 py-3 pr-3 font-mono text-cream-dim tabular-nums">
                      {i + 1}
                    </td>
                    <td className="border-b border-night-3 py-3 pr-3">
                      <a
                        href={`https://x.com/${r.handle}`}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="flex items-center gap-2.5 group"
                      >
                        {r.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.avatarUrl}
                            alt=""
                            width={28}
                            height={28}
                            className="h-7 w-7 shrink-0 rounded-full"
                          />
                        ) : (
                          <span className="h-7 w-7 shrink-0 rounded-full bg-night-3" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-cream group-hover:text-action">
                            @{r.handle}
                          </span>
                          <span className="block truncate font-mono text-xs text-cream-dim">
                            {shortAddress(r.wallet)}
                          </span>
                        </span>
                      </a>
                    </td>
                    <td className="border-b border-night-3 py-3 pr-3 text-right tabular-nums text-cream">
                      {r.poolsJoined}
                    </td>
                    <td className="border-b border-night-3 py-3 pr-3 text-right tabular-nums text-cream">
                      {r.poolsWon}
                    </td>
                    <td className="border-b border-night-3 py-3 text-right tabular-nums text-gold">
                      {usd(r.claimedBase)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-cream">Your listing</h2>
          <XLink />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
