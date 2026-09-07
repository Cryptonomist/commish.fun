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
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/risk", label: "Risks" },
  { href: "/play", label: "Playing responsibly" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto flex flex-col gap-5 border-t border-night-3 py-8 text-sm text-cream-dim">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2.5">
          <Laces size={14} className="text-action" />
          <span className="font-bold tracking-wide">COMMISH.FUN</span>
          <span>· Built on Solana</span>
        </span>

        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="underline decoration-night-3 underline-offset-4 transition-colors hover:text-cream hover:decoration-action"
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
