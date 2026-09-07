import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { Laces, Wordmark } from "@/components/Laces";
import { WalletButton } from "@/components/WalletButton";
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
        <header className="flex items-center justify-between py-6">
          {/* the lockup scales down on a phone so it never crowds the connect button */}
          <Link href="/" aria-label="Commish home" className="origin-left scale-[0.82] sm:scale-100">
            <Wordmark size={22} />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="#drive"
              className="hidden text-sm font-semibold text-cream-dim transition-colors hover:text-cream sm:block"
            >
              How a week works
            </Link>
            <WalletButton />
          </div>
        </header>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-8 pb-10">
          {/* The field is scoped to the copy rather than the whole section, so
              both rows of yard numbers land inside it and neither ends up
              behind the demo card below. */}
          <div className="relative flex flex-col gap-7 py-14 sm:py-16">
            <FieldMarkings />
            <span className="inline-flex w-fit items-center gap-2.5 rounded-none border border-night-3 bg-night-2/80 px-4 py-2 font-matrix text-[10px] leading-4">
              <Laces size={13} className="text-action" />
              <span className="text-cream-dim">WEEK 1 LOCKS IN</span>
              <Countdown />
            </span>

            <h1 className="display max-w-4xl text-[clamp(2.4rem,7vw,5rem)] uppercase">
              NFL football pools,
              <br />
              <span className="text-action">escrowed</span> on-chain.
            </h1>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <p className="max-w-2xl text-lg leading-relaxed text-cream-dim sm:text-xl">
                Members pay their buy-in into a vault that is the pool&rsquo;s own
                account. Picks, results and payouts are recorded on chain. The
                commissioner runs the pool and never holds the money.
              </p>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/pools/new"
                  className="inline-flex h-13 items-center justify-center rounded-xl bg-action px-7 py-4 text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi"
                >
                  Start a pool
                </Link>
                <Link
                  href="#drive"
                  className="inline-flex items-center justify-center rounded-xl border border-night-3 px-7 py-4 text-sm font-bold tracking-wide text-cream transition-colors hover:border-action/60"
                >
                  How a week works
                </Link>
              </div>
            </div>
          </div>

          {/* Never played Survivor? You have now. */}
          <TryAWeek />
        </section>

        {/* ── What you can run ────────────────────────────────────────────── */}
        <section className="border-t border-night-3 py-14">
          <h2 className="display text-3xl uppercase sm:text-4xl">
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
                <h3 className="display mt-4 text-2xl uppercase">{f.h}</h3>
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
          <h2 className="display text-3xl uppercase sm:text-4xl">
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
                <span className="display text-xl tracking-widest text-action">
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
          <h2 className="display text-3xl uppercase sm:text-4xl">
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
          <h2 className="display text-3xl uppercase sm:text-4xl">
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
