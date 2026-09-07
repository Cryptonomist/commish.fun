/* THE ARCADE. One route, one game, no wallet.
 *
 * A page of its own rather than a block on the landing page, for two reasons.
 * A game on the home page competes with the pitch for the same attention and
 * usually wins, which is the wrong outcome for a product that has thirty
 * seconds to explain escrow. And a game is a thing somebody chooses, so making
 * it a destination is more honest than making it an ambush.
 *
 * Nothing here touches a wallet, an RPC or the chain, and the page collects
 * nothing. The only thing it writes is a longest run, in this browser.
 *
 * The component carries the note about what this is and is not: it is an
 * original game in the visual idiom of 1987, not Tecmo Bowl and not an
 * emulator of it.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { CommishBowl } from "@/components/CommishBowl";
import { Wordmark } from "@/components/Laces";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Commish Bowl",
  description:
    "Four downs to move the chains, eighty yards to the endzone. A small football game in eight colours. No wallet, no chain, no sign-up.",
};

export default function ArcadePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <Link href="/" aria-label="Commish home">
          <Wordmark size={20} />
        </Link>
        <Link href="/pools/new" className="btn btn-primary">
          START A POOL
        </Link>
      </header>

      <main className="flex flex-col gap-8 py-6">
        <div className="flex flex-col gap-3">
          <h1 className="display field-display text-4xl uppercase sm:text-5xl">
            Commish Bowl
          </h1>
          <p className="field-type max-w-xl text-sm font-medium leading-relaxed">
            Four downs to gain ten. Eighty yards to the endzone. Seven
            defenders, three blockers and one spin move a play. No wallet, no
            sign-up, and nothing here goes anywhere near the chain.
          </p>
        </div>

        <CommishBowl />

        {/* THE CREDIT, and it matters. Somebody who grew up on Tecmo Bowl will
            recognise the idiom instantly and reasonably wonder what they are
            looking at. Saying plainly that it is a homage and not that game,
            on the page rather than only in a source comment, is both the
            honest answer and the one that keeps this an homage. */}
        <div className="panel flex flex-col gap-3 p-5 text-sm leading-relaxed text-cream-dim sm:p-6">
          <p className="font-matrix text-[10px] leading-4 text-cream-dim">
            ABOUT THIS GAME
          </p>
          <p>
            This is an original game, written for this site, in the visual style
            of late-1980s console football. It is not{" "}
            <span className="text-cream">Tecmo Bowl</span> and it is not an
            emulator: that game belongs to Tecmo, and the real names in it were
            licensed from the NFL and the players&rsquo; association. None of
            that is ours to hand out. What is ours is a field, eleven sprites
            made of rectangles and about four hundred lines of arithmetic.
          </p>
          <p>
            Team colours are used the same way they are on the rest of the site
            — as a way to tell thirty-two clubs apart at a glance. No club
            marks, no logos, no affiliation, no endorsement.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/" className="btn btn-secondary">
            BACK TO THE POOL
          </Link>
          <p className="text-sm text-cream-dim">
            The real game is upstairs: one team a week, lose once and your
            season is over, and the pot sits in the pool&rsquo;s own vault
            rather than in anybody&rsquo;s account.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
