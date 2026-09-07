/* The shell every legal page sits in.
 *
 * These are read by two very different people: somebody deciding whether to
 * trust this with a season of dues, and a lawyer checking whether it says what
 * it should. Both are served by the same thing, which is a readable measure and
 * real headings rather than a wall of justified small print.
 *
 * The "last updated" date is a prop rather than a build-time value on purpose.
 * A date that moves whenever the site redeploys tells a reader nothing about
 * when the TERMS changed, which is the only thing that date is for.
 */

import type { ReactNode } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";

export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  /** When the DOCUMENT last changed, not when the site last built. */
  updated: string;
  /** One sentence above the rule, saying what this page is for. */
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 sm:px-8">
      <SiteNav />

      <main className="py-8">
        <h1 className="display text-2xl uppercase sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm text-cream-dim">Last updated {updated}</p>
        {intro ? (
          <p className="mt-5 text-lg leading-relaxed text-cream">{intro}</p>
        ) : null}

        {/* Typography lives here rather than on every heading in every
            document, so the four pages cannot drift apart. */}
        <div
          className="mt-8 flex flex-col gap-5 leading-relaxed text-cream-dim
            [&_a]:text-action [&_a]:underline [&_a]:underline-offset-2
            [&_h2]:display [&_h2]:mt-7 [&_h2]:text-base [&_h2]:uppercase [&_h2]:text-cream
            [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-bold [&_h3]:tracking-wide [&_h3]:text-cream
            [&_li]:pl-1 [&_strong]:text-cream
            [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5"
        >
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/** A block that should stop somebody skimming. Used sparingly: three or four
 *  on a page and it is decoration rather than emphasis. */
export function Callout({
  tone = "warn",
  children,
}: {
  tone?: "warn" | "note";
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-4 text-cream ${
        tone === "warn"
          ? "border-out/40 bg-out/10"
          : "border-night-3 bg-night-2/60"
      }`}
    >
      {children}
    </div>
  );
}
