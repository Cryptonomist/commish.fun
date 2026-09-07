import Link from "next/link";
import AttractCabinet from "@/components/AttractCabinet";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Laces } from "@/components/Laces";
import { Countdown } from "@/components/Countdown";
import { FieldMarkings } from "@/components/FieldMarkings";
import { ScoreTicker } from "@/components/ScoreTicker";
import { TryAWeek } from "@/components/TryAWeek";
import { fetchScoreboard } from "@/lib/scores";

/* The front door.
 *
 * One job: a commissioner reads this and understands, in about eight seconds,
 * what the product is, which formats it runs, and that they keep the job and
 * lose the custody.
 *
 * IT STATES THINGS RATHER THAN SELLING THEM. An earlier version opened on the
 * pot living in one friend's Venmo, which was vivid and read like an
 * advertisement rather than a product. The page names what is offered, says
 * which of it you can actually use today, and lets the mechanism argue for
 * itself — which it can, because the mechanism is the interesting part.
 *
 * THE HERO IS THE GAME, NOT A PICTURE OF IT. Everything below the fold argues
 * that the escrow is trustworthy, and none of that argument lands on somebody
 * who does not yet feel what a Survivor pick costs. So the page opens with a
 * playable week and earns the right to explain itself afterwards.
 *
 * The one numbered sequence on the page is THE DRIVE, and it is numbered
 * because it is genuinely ordered: each stage is gated on the one before it by
 * the program, in that order, with a clock between them. The three setup steps
 * are not numbered, because a reader can do those in any order they like.
 */

const DRIVE = [
  {
    yard: "LOCK",
    h: "Picks lock at kickoff",
    p: "To the second, at the week's first game. A missed pick is an elimination, in every mode, with no grace.",
  },
  {
    yard: "+3H",
    h: "Results go up",
    p: "The commissioner cannot post until three hours after that lock. Not a claim that every game is final, but a floor that stops a week being called before it is played.",
  },
  {
    yard: "OPEN",
    h: "The dispute window",
    p: "Everyone still alive sees exactly what was claimed and can strike it down. A strict majority clears the posting and the commissioner has to post again.",
  },
  {
    yard: "FINAL",
    h: "The week commits",
    p: "The window closes and anyone can fire the crank, not just the commissioner. Somebody who loses interest in March cannot freeze the pot.",
  },
  {
    yard: "NEXT",
    h: "Settle and advance",
    p: "The result is applied to every member, and the week either opens the next one or decides the pool and pays out.",
  },
];

/* What the product actually offers, and honestly which of it you can use.
 *
 * All three are creatable now. This list said otherwise for as long as it was
 * true, and the honesty was the point: `mode_enabled` in the program permits
 * exactly Survivor, Loser and League, and every other value in the enum is
 * refused at runtime rather than half-built. If a fourth mode appears in the
 * program, it does not belong on this page until it has screens. */
const FORMATS = [
  {
    status: "AVAILABLE NOW",
    live: true,
    h: "Survivor",
    p: "One team a week to win, each team once a season. Your team loses or ties and you are out. Last member standing takes the pot.",
    detail:
      "Picks lock at the week's first kickoff and are recorded on chain, so nobody can claim on Monday that they definitely picked the Bills.",
  },
  {
    status: "AVAILABLE NOW",
    live: true,
    h: "Loser pool",
    p: "The same game inverted. Pick a team to lose, and if they win you are out. Burn the worst teams early and December gets interesting.",
    detail:
      "A tie carries you here and eliminates you in Survivor, because the rule is that your team must not win rather than that it must lose.",
  },
  {
    status: "AVAILABLE NOW",
    live: true,
    h: "League dues",
    p: "A season buy-in for a fantasy league you play somewhere else. Held in the same escrow, paid out against a prize sheet rather than a last-one-standing rule.",
    detail:
      "The commissioner posts who finished where, and can pull the final table straight from Sleeper. Members get the same dispute window they get on a weekly result, and each winner claims their own slot.",
  },
];

const SETUP = [
  {
    h: "Create a pool",
    p: "Set the buy-in in USDC, pick a dispute window, share a join link. About a minute.",
  },
  {
    h: "Everyone joins",
    p: "Each member pays their buy-in into a vault that is the pool's own account. No individual can move it, you included.",
  },
  {
    h: "Get paid",
    p: "Last one standing claims the pot straight from the vault. Nobody has to release it and there is nobody to chase.",
  },
];

const CANNOT = [
  ["Spend the pot", "The vault moves by four named paths, and none of them names a person"],
  ["Change the rules mid-season", "Buy-in, schedule and dispute window are fixed at creation"],
  ["Slow-pay the winner", "Settlement is a permissionless crank anyone can fire"],
  ["Quietly post fake results", "A dispute window lets members veto anything you can check on a scoreboard"],
  ["Strand the money", "Past the refund deadline every paid member takes their share back"],
];

export default async function Home() {
  /* Fetched here rather than in the browser so the bar is full on first paint.
     The upstream call is cached for a minute, so this costs one request a
     minute for the whole site rather than one per visitor. */
  const board = await fetchScoreboard();

  return (
    <>
      <ScoreTicker initial={board} />
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 sm:px-8">
        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        {/* The "How a week works" anchor that used to live here is gone: the
            hero carries a button with the same words and the same target, and
            two links to one anchor within an inch of each other is not a menu,
            it is a stutter. */}
        <SiteNav markSize={22} />

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-8 pb-10">
          {/* The field is scoped to the copy rather than the whole section, so
              both rows of yard numbers land inside it and neither ends up
              behind the demo card below. */}
          {/* TYPE DOES NOT TOUCH TURF, and this is where that rule earns its
              keep. It shipped for ten minutes with the headline and body copy
              straight on the grass and the yard numbers running through them:
              cream-dim at 4.91:1 over a moving background, which is legal by a
              hair and genuinely hard to read. The copy sits on a panel now and
              the field is the thing the panel is mounted on. */}
          <div className="relative py-10 sm:py-14">
            {/* Outside the panel. The markings are the field, not a texture
                behind the words. */}
            <FieldMarkings />

            {/* NO SLAB. The copy sits straight on the field again.
                The panel version was legible and hid the grass, which is the
                one thing this whole direction is built on. The fix is not a
                black rectangle, it is picking the right ink: chalk is 9.92:1
                on turf and cream is 9.01:1, both legal at any size, and the
                panel-coloured outline holds them against a mow band or a yard
                number passing behind a letter. Only cream-dim, action and out
                are illegal out here, and none of them is used. */}
            {/* THE COPY STARTS AT THE GOAL LINE, not at the back of the
                endzone. The field runs the full width of this section and its
                left endzone is the first 8.33% of it — ten yards of a hundred
                and twenty — so text beginning at the container edge began in
                the endzone, on top of the hatching and behind the goal line.
                Reading it, the words looked like they had been dropped onto
                the wrong part of the pitch.

                The inset is the endzone's own width, taken from the same
                fraction the markings use, so the two cannot drift apart. Only
                from sm upward: on a phone the field is barely wider than the
                text and giving away a tenth of it costs more than the
                alignment is worth. */}
            <div className="relative flex flex-col gap-7 sm:pl-[8.333%]">
              <span className="inline-flex w-fit items-center gap-2.5 border-2 border-chalk bg-panel px-4 py-2 font-matrix text-[10px] leading-4">
                <Laces size={13} className="text-action" />
                <span className="text-cream-dim">WEEK 1 LOCKS IN</span>
                <Countdown />
              </span>

              {/* The 8-bit title-card offset print, now with the sprite outline
                  around it so it survives the field behind it. */}
              {/* THREE SHORT LINES, AND THEY NAME BOTH PRODUCTS.
                  "NFL football pools" was true and told nobody what this is
                  for: a stranger cannot tell whether it holds season-long
                  fantasy dues or a weekly pick'em pot, and it does both. So
                  the two are said outright, in the order people meet them.

                  Three lines rather than two because the display face is a
                  bitmap one and sets about 0.72em per character. At the 3rem
                  ceiling that is roughly 35px a character, so a line has about
                  twenty-five before it runs past max-w-4xl — and the shorter
                  declaratives read better than one sentence wrapped badly. */}
              <h1 className="display field-display max-w-4xl text-[clamp(1.5rem,4.4vw,3rem)] uppercase">
                Fantasy dues.
                <br />
                Weekly pick&rsquo;em.
                <br />
                Escrowed on-chain.
              </h1>

              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <p className="field-type max-w-2xl text-lg font-medium leading-relaxed sm:text-xl">
                  Season-long league dues or a week&rsquo;s pick&rsquo;em pot:
                  every buy-in goes into a vault that is the pool&rsquo;s own
                  account. Picks, results and payouts are recorded on chain.
                  The commissioner runs the pool and never holds the money.
                </p>
                <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
                  <Link href="/pools/new" className="btn btn-primary">
                    START A POOL
                  </Link>
                  <Link href="#drive" className="btn btn-secondary">
                    HOW A WEEK WORKS
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Never played Survivor? You have now.
              The demo now lives inside the cabinet and is not mounted until
              somebody presses start, so a visitor who never does pays nothing
              for it. */}
          <AttractCabinet>
            <TryAWeek />
          </AttractCabinet>
        </section>

        {/* ── What you can run ────────────────────────────────────────────── */}
        <section className="border-t border-night-3 py-14">
          <h2 className="display text-xl uppercase sm:text-2xl">
            What you can run
          </h2>
          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-night-3 bg-night-3 md:grid-cols-2">
            {FORMATS.map((f) => (
              <div key={f.h} className="flex flex-col bg-night-2/60 p-6">
                <span
                  className={`w-fit rounded-none border px-3 py-1 text-xs font-bold tracking-[0.14em] ${
                    f.live
                      ? "border-alive/40 bg-alive/10 text-alive"
                      : "border-night-3 bg-night-2 text-cream-dim"
                  }`}
                >
                  {f.status}
                </span>
                <h3 className="display mt-4 text-base uppercase">{f.h}</h3>
                <p className="mt-2 leading-relaxed text-cream-dim">{f.p}</p>
                <p className="mt-3 text-sm leading-relaxed text-cream-dim/80">
                  {f.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── The drive ───────────────────────────────────────────────────── */}
        <section id="drive" className="scroll-mt-8 border-t border-night-3 py-14">
          <h2 className="display text-xl uppercase sm:text-2xl">
            How a week actually works
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-cream-dim">
            Results enter through the commissioner, checked against public scores.
            There is no oracle pretense. What the program does is put a clock and a
            vote around that one human step, in this order, every week.
          </p>

          <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-night-3 bg-night-3 sm:grid-cols-2 lg:grid-cols-5">
            {DRIVE.map((d) => (
              <li key={d.yard} className="flex flex-col bg-night-2/60 p-5">
                <span className="display text-sm tracking-widest text-action">
                  {d.yard}
                </span>
                <h3 className="mt-3 font-bold text-cream">{d.h}</h3>
                <p className="mt-2 text-sm leading-relaxed text-cream-dim">
                  {d.p}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── The trust model ─────────────────────────────────────────────── */}
        <section className="border-t border-night-3 py-14">
          <h2 className="display text-xl uppercase sm:text-2xl">
            The commissioner cannot
          </h2>
          <ul className="mt-8 divide-y divide-night-3 border-y border-night-3">
            {CANNOT.map(([cannot, because]) => (
              <li
                key={cannot}
                className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-6"
              >
                <span className="flex items-baseline gap-3 font-bold text-cream sm:w-72 sm:shrink-0">
                  <Laces size={11} className="shrink-0 text-out" />
                  {cannot}
                </span>
                <span className="leading-relaxed text-cream-dim">{because}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-lg font-bold text-alive">
            The commissioner keeps the job, loses the custody.
          </p>
        </section>

        {/* ── Getting started ─────────────────────────────────────────────── */}
        <section className="border-t border-night-3 py-14">
          <h2 className="display text-xl uppercase sm:text-2xl">
            Running one
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {SETUP.map((s) => (
              <div key={s.h}>
                <h3 className="flex items-baseline gap-3 text-lg font-bold text-cream">
                  <Laces size={11} className="shrink-0 text-action" />
                  {s.h}
                </h3>
                <p className="mt-2 leading-relaxed text-cream-dim">{s.p}</p>
              </div>
            ))}
          </div>
          <Link
            href="/pools/new"
            className="mt-9 inline-flex h-13 items-center justify-center rounded-xl bg-action px-7 py-4 text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi"
          >
            Start a pool
          </Link>
        </section>

        {/* Shared, because the terms somebody agrees to should be reachable
            from the screen where they agree. A join link goes straight to a
            pool page, which had no footer at all. */}
        <SiteFooter />
      </div>
    </>
  );
}
