"use client";

/* The scoreboard along the top of the front door.
 *
 * IT IS DECORATION AND IT SAYS SO. This bar exists on the landing page and
 * nowhere else, deliberately: the moment live scores appear beside a pool,
 * somebody assumes they decide who is out. They do not. Results enter through
 * the commissioner and are checked by the members against a scoreboard of
 * their own choosing, which is the entire trust story, and a feed rendered
 * next to a pick grid would quietly undermine it.
 *
 * IT RENDERS AT REST. The board is fetched on the server and passed in, so the
 * bar is full on first paint rather than popping in. The client only polls
 * while a game is actually in progress — a bar that re-fetches every minute
 * through an entire February is just noise on somebody's data plan.
 *
 * The marquee duplicates its contents and translates by exactly half, which is
 * what makes the loop seamless. Under prefers-reduced-motion the animation is
 * dropped outright and the row becomes an ordinary horizontal scroller, rather
 * than being sped up to nothing by the blanket duration override in
 * globals.css.
 */

import { useEffect, useState } from "react";

import { Countdown } from "@/components/Countdown";
import { teamByAbbr } from "@/lib/nfl";
import type { Game, Scoreboard } from "@/lib/scores";

export function ScoreTicker({ initial }: { initial: Scoreboard }) {
  const [board, setBoard] = useState(initial);
  const live = board.games.some((g) => g.state === "in");

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      void fetch("/api/scores")
        .then((r) => (r.ok ? r.json() : null))
        .then((b: Scoreboard | null) => b && setBoard(b))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [live]);

  const label =
    board.week !== null ? `NFL · WEEK ${board.week}` : "NFL";

  if (board.games.length === 0) {
    return (
      <div className="border-b border-night-3 bg-night-2/40">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-2 text-xs sm:px-8">
          <span className="font-matrix text-[10px] leading-4 text-cream-dim">
            {label}
          </span>
          <span className="text-cream-dim">
            No games on the board. Week 1 locks in
          </span>
          <Countdown />
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden border-b border-night-3 bg-night-2/40">
      {/* The label sits over the marquee with a fade behind it so games slide
          under it rather than colliding with it. */}
      <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center gap-3 bg-gradient-to-r from-night via-night to-transparent py-2 pl-5 pr-10 font-matrix text-[10px] leading-4 text-cream-dim sm:pl-8">
        {label}
      </span>

      <div className="ticker-track flex w-max items-center py-2">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {board.games.map((g) => (
              <GameChip key={`${copy}-${g.id}`} game={g} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Side({ abbr, score, won }: { abbr: string; score: number | null; won: boolean }) {
  const team = teamByAbbr(abbr);
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-[3px] translate-y-px rounded-none"
        style={{ background: team?.lead ?? "currentColor" }}
      />
      <span className={won ? "font-bold text-cream" : "text-cream-dim"}>
        {abbr}
      </span>
      {score !== null ? (
        <span
          className={`tabular-nums ${won ? "font-bold text-cream" : "text-cream-dim"}`}
        >
          {score}
        </span>
      ) : null}
    </span>
  );
}

function GameChip({ game }: { game: Game }) {
  const final = game.state === "post";
  const homeWon = final && (game.home.score ?? 0) > (game.away.score ?? 0);
  const awayWon = final && (game.away.score ?? 0) > (game.home.score ?? 0);

  return (
    <span className="flex shrink-0 items-baseline gap-2 whitespace-nowrap px-5 text-xs">
      <Side abbr={game.away.abbr} score={game.away.score} won={awayWon} />
      <span className="text-cream-dim/50">at</span>
      <Side abbr={game.home.abbr} score={game.home.score} won={homeWon} />
      <span
        className={
          game.state === "in" ? "font-bold text-action" : "text-cream-dim/60"
        }
      >
        {game.detail}
      </span>
    </span>
  );
}
