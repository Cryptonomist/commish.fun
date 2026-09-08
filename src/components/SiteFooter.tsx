/* One footer, on every page.
 *
 * The landing page had a footer and nothing else did, which is fine for a
 * marketing site and wrong for one that takes money: the terms somebody is
 * agreeing to should be reachable from the screen where they agree, not only
 * from the page they may never have seen. A join link goes straight to a pool.
 *
 * The disclaimer stays short here and the detail lives behind the links. A wall
 * of small print in a footer is read by nobody and protects no one.
 */

import Link from "next/link";

import { Laces } from "@/components/Laces";

const LINKS = [
  { href: "/leaderboard", label: "Leaderboard" },
  /* The game. In the footer rather than the header, because it is a toy and
   * the header is for the product — but on every page rather than only the
   * landing one, because otherwise nobody ever finds it. */
  { href: "/arcade", label: "Arcade" },
  /* Reachable from every page, not only from the join screen that discovers
   * you have no wallet. Somebody sent a pool link is often reading the terms
   * before they get anywhere near a Connect button. */
  { href: "/wallet", label: "Get a wallet" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/risk", label: "Risks" },
  { href: "/play", label: "Playing responsibly" },
];

export function SiteFooter() {
  return (
    /* ON A PANEL, like everything else that carries words.
       It was sitting straight on the grass, so the mow bands ran behind the
       links and the small print, and cream-dim at 4.91:1 over a moving
       background is the exact case the panel rule exists to prevent. */
    <footer className="panel mt-auto mb-8 flex flex-col gap-5 p-5 text-sm text-cream-dim sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* `whitespace-nowrap` on the tagline, because "Built on Solana" was
            breaking after "Built on" and dropping "Solana" onto the line below
            the links, which read as a stray word rather than as part of the
            lockup. */}
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Laces size={14} className="text-action" />
          <span className="font-matrix text-[10px] leading-4 text-chalk">
            COMMISH.FUN
          </span>

          {/* POWERED BY SOLANA — OUR TYPE, THEIR MARK, AND THAT SPLIT IS
              DELIBERATE.
              A pixel-art version of the wordmark would sit better with
              everything else on this site, and it is the one treatment Solana's
              brand page rules out by name: "Don't apply logo in low resolution"
              and "Don't stretch the logo". So the blocky half is OUR words, set
              in the face the rest of the site uses, and the mark is their own
              SVG served untouched — not recreated, not recoloured, not
              rasterised. Same look, nothing borrowed that was not offered.

              The file is their published asset from solana.com/src/img/branding.
              It carries its own gradient and white wordmark, which is why it
              needs no colour handling here and must not be given any.

              `<img>` rather than inlining the SVG: inlined, its <defs> ids
              would collide with anything else on the page defining the same
              names, and a stray global fill rule could reach inside it. An img
              is an opaque box, which for somebody else's trademark is the
              correct relationship. Height is set and width follows, so it can
              never be stretched. */}
          <span className="flex items-center gap-2 whitespace-nowrap pl-1">
            <span className="font-matrix text-[9px] leading-4 text-cream-dim">
              POWERED BY
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/solana-wordmark.svg"
              alt="Solana"
              width={81}
              height={12}
              className="h-3 w-auto"
            />
          </span>
        </span>

        {/* A single row that wraps as whole links rather than mid-phrase.
            "Playing responsibly" is two words and was the one that broke the
            line, so it holds together and the row wraps around it. */}
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap underline decoration-rule underline-offset-4 transition-colors hover:text-cream hover:decoration-action"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <p className="max-w-2xl text-xs leading-relaxed">
        Escrow infrastructure for private pools among people who know each other.
        Not financial or legal advice. Team names identify clubs and imply no
        affiliation or endorsement. Know the rules where you live before running
        a pool.
      </p>
    </footer>
  );
}
