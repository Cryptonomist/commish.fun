/* THE ARCADE. Two games, no wallet.
 *
 * A page of its own rather than a block on the landing page, for two reasons.
 * A game on the home page competes with the pitch for the same attention and
 * usually wins, which is the wrong outcome for a product that has thirty
 * seconds to explain escrow. And a game is a thing somebody chooses, so making
 * it a destination is more honest than making it an ambush.
 *
 * Nothing here touches a wallet, an RPC or the chain, and the page collects
 * nothing. The only things it writes are a longest run and a longest kick, in
 * this browser.
 *
 * The credit below says what these are and are not: original games in the
 * visual idiom of 1987, not Tecmo Bowl and not an emulator of it.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { ArcadeSwitch } from "@/components/ArcadeSwitch";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Arcade",
  description:
    "Commish Bowl, a full four-quarter football game against the computer, and Long Kick, a field goal game to chase the NFL record. No wallet, no chain, no sign-up.",
};

export default function ArcadePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 sm:px-8">
      <SiteNav />

      <main className="flex flex-col gap-8 py-6">
        <div className="flex flex-col gap-3">
          <h1 className="display field-display text-2xl uppercase sm:text-3xl">Arcade</h1>
          <p className="field-type max-w-xl text-sm font-medium leading-relaxed">
            Commish Bowl is a whole game: kickoffs, four downs, punts, field goals and a clock,
            against the computer, in the weather you pick. Long Kick is one question: how far back
            can you make a field goal from? No wallet, no sign-up, and nothing here goes anywhere
            near the chain.
          </p>
        </div>

        <ArcadeSwitch />

        {/* THE CREDIT, and it matters. Somebody who grew up on Tecmo Bowl will
            recognise the idiom instantly and reasonably wonder what they are
            looking at. Saying plainly that these are homages and not that
            game, on the page rather than only in a source comment, is both the
            honest answer and the one that keeps them homages. */}
        <div className="panel flex flex-col gap-3 p-5 text-sm leading-relaxed text-cream-dim sm:p-6">
          <p className="font-matrix text-[10px] leading-4 text-cream-dim">ABOUT THESE GAMES</p>
          <p>
            These are original games, written for this site, in the visual style of late-1980s
            console football. They are not <span className="text-cream">Tecmo Bowl</span> and they
            are not an emulator: that game belongs to Tecmo, and the real names in it were licensed
            from the NFL and the players&rsquo; association. None of that is ours to hand out. What
            is ours is a field, some sprites made of rectangles, and the arithmetic of a football
            in the wind.
          </p>
          <p>
            Team colours are used the same way they are on the rest of the site, as a way to tell
            thirty-two clubs apart at a glance. No club marks, no logos, no player names, no
            affiliation, no endorsement. The rules follow the NFL&rsquo;s 2026 rulebook where a
            small game can, and simplify where it cannot.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/" className="btn btn-secondary">
            BACK TO THE POOL
          </Link>
          <p className="text-sm text-cream-dim">
            The real game is upstairs: one team a week, lose once and your season is over, and the
            pot sits in the pool&rsquo;s own vault rather than in anybody&rsquo;s account.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
