"use client";

/* ONE NAV, ON EVERY PAGE.
 *
 * Before this there were six headers and no navigation. Each page put the mark
 * on the left and then improvised on the right: the landing page had an anchor
 * link and a connect button, the arcade had a start-a-pool button, three pages
 * had a connect button on its own, and the wallet page had nothing at all. A
 * visitor who landed on the leaderboard could reach the rest of the site only
 * through the footer, and the footer is where you look last.
 *
 * IT IS A MENU, not a row of links, because that is what this site is now. Hard
 * bordered blocks in the label face, the current one lit in the action colour,
 * and a press that moves the block four pixels down and right — the same
 * behaviour every other button here has. It reads as a cabinet menu and it is
 * still an ordinary list of anchors underneath.
 *
 * THE NAV GETS ITS OWN ROW rather than sharing with the mark and the connect
 * button. Four labels in a 10px bitmap face come to about 390 logical pixels;
 * a mark and a connect button take another 270. On the narrower pages — the
 * wallet page is max-w-2xl — that does not fit, and a nav that overflows its
 * container on one page in six is worse than one that costs a row everywhere.
 * On a phone the strip scrolls sideways and bleeds to both screen edges, which
 * is the honest answer rather than hiding items behind a hamburger.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/Laces";
import { WalletButton } from "@/components/WalletButton";

/* MY POOLS SITS FIRST, ahead of starting a new one, because finding the pool
 * you already have is the more common need and was the one with no route at
 * all: a pool is reachable only by its address, and the address only ever
 * appears in a share link. Close the tab and the site offered no way back. */
const ITEMS = [
  { href: "/pools", label: "MY POOLS" },
  { href: "/pools/new", label: "NEW POOL" },
  { href: "/leaderboard", label: "LEADERS" },
  { href: "/arcade", label: "ARCADE" },
  { href: "/wallet", label: "WALLET" },
] as const;

export function SiteNav({ markSize = 20 }: { markSize?: number }) {
  const pathname = usePathname();

  return (
    <header className="flex flex-col gap-3 py-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" aria-label="Commish home">
          <Wordmark size={markSize} />
        </Link>
        <WalletButton />
      </div>

      {/* IT WRAPS NOW; IT USED TO SCROLL, and the difference is one nav item.

          As a scrolling strip — `-mx-5 px-5 overflow-x-auto`, so a cut-off
          button read as "there is more this way" — this was fine at four
          items, which is what it had. Adding MY POOLS made five, and on a
          375px screen the last two then sat entirely past the right edge:
          measured at right 430 and 522. A button nobody can see is not a
          button that scrolled into view, it is a button that does not exist,
          and WALLET is the page somebody goes looking for precisely when they
          are stuck.

          Wrapping shows all five without asking for a gesture nothing on the
          screen suggests. At sm the row is wide enough for one line anyway, so
          nothing changes there. */}
      <nav
        aria-label="Main"
        className="flex flex-wrap gap-2 pb-1 sm:flex-nowrap sm:pb-0"
      >
        {ITEMS.map((item) => {
          /* Exact match only. `startsWith` would light NEW POOL on every pool
             page, since /p/<id> is not /pools/new but /pools/new is a prefix
             of nothing else — and the day somebody adds /pools/archive it
             would light two at once. */
          const current = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className="btn btn-nav shrink-0"
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
