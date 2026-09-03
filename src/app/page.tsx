import Link from "next/link";
import { Laces, Wordmark } from "@/components/Laces";
import { WalletButton } from "@/components/WalletButton";
import { Countdown } from "@/components/Countdown";

/* The front door.
 *
 * One job: a commissioner who runs a pool on Venmo reads this and understands,
 * in about eight seconds, that they keep their job and lose the custody. The
 * pitch is not "blockchain" — it is "you stop holding four thousand dollars of
 * your friends' money for eighteen weeks".
 */

const STEPS = [
  {
    n: "01",
    h: "Create a pool",
    p: "Set the buy-in in USDC and share a join link. Takes about a minute.",
  },
  {
    n: "02",
    h: "Everyone joins",
    p: "Each member pays their buy-in into an escrow vault no individual can touch — you included.",
  },
  {
    n: "03",
    h: "Pick weekly",
    p: "One team to win, each week, each team once per season. Picks lock at the first kickoff and are recorded on-chain.",
  },
  {
    n: "04",
    h: "Survive",
    p: "Your team wins, you advance. Loses or ties, you are out. No arguments about who picked what.",
  },
  {
    n: "05",
    h: "Get paid",
    p: "Last member standing takes the pot automatically. No chasing, no “I will get to it”.",
  },
];

const CANNOT = [
  ["Spend the pot", "The vault only moves through payout logic"],
  ["Change the rules mid-season", "Rules are fixed at pool creation"],
  ["Slow-pay the winner", "Settlement is a permissionless crank anyone can fire"],
  ["Quietly post fake results", "A dispute window lets members veto anything you can check on a scoreboard"],
  ["Strand the money", "A deadman switch lets members reclaim their share if a pool is abandoned"],
];

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 sm:px-8">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between py-6">
        {/* the lockup scales down on a phone so it never crowds the connect button */}
        <Link href="/" aria-label="Commish home" className="origin-left scale-[0.82] sm:scale-100">
          <Wordmark size={22} />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="#how"
            className="hidden text-sm font-semibold text-cream-dim transition-colors hover:text-cream sm:block"
          >
            How it works
          </Link>
          <WalletButton />
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="yard-lines flex flex-col items-start gap-7 py-14 sm:py-20">
        <span className="inline-flex items-center gap-2.5 rounded-full border border-night-3 bg-night-2/80 px-4 py-2 text-xs font-bold tracking-[0.18em]">
          <Laces size={13} className="text-leather" />
          <span className="text-cream-dim">WEEK 1 LOCKS IN</span>
          <Countdown />
        </span>

        <h1 className="display max-w-4xl text-[clamp(2.6rem,8vw,5.5rem)] uppercase">
          Your Survivor pool,
          <br />
          out of that one guy&rsquo;s{" "}
          <span className="text-leather">Venmo</span>.
        </h1>

        <p className="max-w-2xl text-lg leading-relaxed text-cream-dim sm:text-xl">
          Buy-ins escrowed on-chain. Picks locked at kickoff. Last one standing
          takes the pot. You keep being the commissioner — you just stop holding
          everyone&rsquo;s money.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/pools/new"
            className="inline-flex h-13 items-center justify-center rounded-xl bg-leather px-7 py-4 text-sm font-bold tracking-wide text-night transition-colors hover:bg-leather-hi"
          >
            Start a pool
          </Link>
          <Link
            href="#how"
            className="inline-flex items-center justify-center rounded-xl border border-night-3 px-7 py-4 text-sm font-bold tracking-wide text-cream transition-colors hover:border-leather/60"
          >
            See how it works
          </Link>
        </div>
      </section>

      {/* ── The problem ─────────────────────────────────────────────────── */}
      <section className="border-t border-night-3 py-14">
        <p className="max-w-3xl text-xl leading-relaxed text-cream sm:text-2xl">
          Every Survivor pool works the same way: ten to a hundred people send
          their buy-in to one guy&rsquo;s Venmo, and then everyone trusts that
          guy for eighteen weeks.{" "}
          <span className="text-cream-dim">
            He holds the pot. He tracks the picks. He decides disputes. He pays
            out, eventually, if nothing goes wrong. Pools move thousands of
            dollars a season this way, secured by nothing but friendship.
          </span>
        </p>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how" className="scroll-mt-8 border-t border-night-3 py-14">
        <h2 className="display mb-10 text-3xl uppercase sm:text-4xl">
          How it works
        </h2>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-2xl border border-night-3 bg-night-2/60 p-6"
            >
              <span className="display text-2xl text-leather">{s.n}</span>
              <h3 className="mt-3 text-lg font-bold text-cream">{s.h}</h3>
              <p className="mt-2 leading-relaxed text-cream-dim">{s.p}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── The trust model ─────────────────────────────────────────────── */}
      <section className="border-t border-night-3 py-14">
        <h2 className="display text-3xl uppercase sm:text-4xl">
          The commissioner cannot
        </h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-cream-dim">
          Weekly results enter through the commissioner&rsquo;s confirmation,
          checked against public NFL scores. There is no oracle pretense. What
          the chain removes is every way commissioner trust historically fails.
        </p>
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

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="mt-auto flex flex-col gap-4 border-t border-night-3 py-8 text-sm text-cream-dim sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2.5">
          <Laces size={14} className="text-leather" />
          <span className="font-bold tracking-wide">COMMISH.FUN</span>
          <span>· Built on Solana</span>
        </span>
        <span className="max-w-md text-xs leading-relaxed">
          Escrow infrastructure for private pools among people who know each
          other. Not financial, gambling, or legal advice. Know the rules where
          you live before running a pool.
        </span>
      </footer>
    </div>
  );
}
