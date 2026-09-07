"use client";

/* Survivor, playable in fifteen seconds, before anyone connects anything.
 *
 * THE HARDEST PART OF THIS PITCH IS NOT THE ESCROW. It is that a stranger has
 * to already understand the game for "last one standing takes the pot" to mean
 * anything, and no paragraph teaches a game as fast as one round of it. So the
 * hero is not a picture of the product. It is the product's core loop with the
 * money and the chain taken out: pick a team, watch the week resolve, find out
 * whether you are still alive.
 *
 * IT KEEPS YOUR SPENT TEAMS BETWEEN ROUNDS, which is the whole strategy of
 * Survivor and the part a paragraph always fails to convey. Winning week one
 * with Kansas City is easy. It is week nine, with Kansas City gone, that ends
 * pools — and three rounds of this makes that obvious without saying it.
 *
 * The weeks below are invented. They are labelled as a demonstration on screen
 * and never dressed up as real scores: a product whose entire argument is
 * "results you can check against a scoreboard" cannot open by showing you
 * results you cannot.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { TEAMS, type Team } from "@/lib/nfl";
import { play } from "@/lib/sfx";

/* Three invented weeks. Every club wins in at least one and loses in at least
 * one, so a replay is never the round you just played, and no pick is safe
 * across all three. */
const WEEKS: readonly (readonly string[])[] = [
  ["BAL", "BUF", "CIN", "DAL", "DET", "GB", "HOU", "KC", "LAC", "MIA", "MIN", "PHI", "SEA", "SF", "TB", "WAS"],
  ["ARI", "BUF", "CHI", "CIN", "DEN", "DET", "GB", "IND", "KC", "LAR", "MIN", "NO", "NYJ", "PHI", "PIT", "SF"],
  ["ATL", "BAL", "CAR", "CLE", "DAL", "HOU", "JAX", "LAC", "LV", "MIA", "NE", "NYG", "SEA", "TB", "TEN", "WAS"],
];

type Phase = "pick" | "locking" | "result";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function TryAWeek() {
  const [week, setWeek] = useState(0);
  const [phase, setPhase] = useState<Phase>("pick");
  const [picked, setPicked] = useState<number | null>(null);
  const [spent, setSpent] = useState<number[]>([]);

  const winners = useMemo(
    () => new Set<string>(WEEKS[week % WEEKS.length]),
    [week],
  );

  const survived = picked !== null && winners.has(TEAMS[picked].abbr);
  const finished = phase === "result";

  const choose = useCallback((i: number) => {
    play("confirm");
    setPicked(i);
    setPhase("locking");
    // The beat between the pick and the result is the whole tension of the
    // week compressed into a second. It is the one thing here worth animating,
    // and it is skipped outright for anyone who has asked for less motion.
    window.setTimeout(() => setPhase("result"), reducedMotion() ? 0 : 900);
  }, []);

  const nextWeek = useCallback(() => {
    setSpent((s) => (picked === null ? s : [...s, picked]));
    setPicked(null);
    setWeek((w) => w + 1);
    setPhase("pick");
  }, [picked]);

  const restart = useCallback(() => {
    setSpent([]);
    setPicked(null);
    setWeek(0);
    setPhase("pick");
  }, []);

  const cellState = (t: Team) => {
    if (picked === t.i) return "yours" as const;
    if (spent.includes(t.i)) return "spent" as const;
    if (finished) return winners.has(t.abbr) ? ("won" as const) : ("lost" as const);
    return "open" as const;
  };

  const weekNo = (week % WEEKS.length) + 1;
  const survivedThree = finished && survived && spent.length >= 2;

  /* GAME OVER, CONTINUE? 9, 8, 7.
   *
   * Runs only while eliminated, counts to zero, and then stops. Reaching zero
   * does nothing except drop the digit and leave an ordinary Try again button:
   * a countdown that navigated or reset on its own would be a trap wearing a
   * joke's clothes, and somebody reading the sentence next to it would lose
   * their place mid-line. */
  const [continueIn, setContinueIn] = useState<number | null>(null);
  const eliminated = finished && !survived;
  useEffect(() => {
    if (!eliminated) {
      setContinueIn(null);
      return;
    }
    if (reducedMotion()) return; // a ticking number is motion
    setContinueIn(9);
    const id = window.setInterval(() => {
      setContinueIn((n) => {
        if (n === null || n <= 0) {
          window.clearInterval(id);
          return null;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [eliminated]);

  /* Sound, only ever when somebody has turned it on. The result is the one
   * moment in the demo with a verdict, so it is the one moment worth a noise. */
  useEffect(() => {
    if (!finished) return;
    play(survived ? "win" : "out");
  }, [finished, survived]);

  return (
    <div className="panel p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-matrix text-[10px] leading-4 text-cream-dim">
          TRY A WEEK
          <span className="ml-2 font-normal tracking-normal opacity-70">
            demonstration, invented results
          </span>
        </p>
        {spent.length > 0 ? (
          <p className="text-xs text-cream-dim">
            <span className="font-bold text-cream">{spent.length}</span> team
            {spent.length === 1 ? "" : "s"} spent · {32 - spent.length} left
          </p>
        ) : null}
      </div>

      <p
        className="display mt-2 text-2xl uppercase sm:text-3xl"
        aria-live="polite"
      >
        {phase === "pick" ? (
          <>Week {weekNo}. Pick one team to win.</>
        ) : phase === "locking" ? (
          <>Picks locked.</>
        ) : survived ? (
          <>
            <span className="text-alive">{TEAMS[picked!].city} held.</span> You
            survive.
          </>
        ) : (
          <>
            <span className="text-out">{TEAMS[picked!].city} lost.</span> You are
            out.
          </>
        )}
      </p>

      <ul className="mt-5 grid grid-cols-4 gap-1.5 sm:grid-cols-8">
        {TEAMS.map((t) => {
          const s = cellState(t);
          return (
            <li key={t.abbr}>
              <button
                type="button"
                onClick={phase === "pick" ? () => choose(t.i) : undefined}
                disabled={phase !== "pick" || s === "spent"}
                aria-label={`${t.city} ${t.name}${
                  s === "spent" ? ", already used" : ""
                }`}
                /* THIS GRID DUPLICATES TeamButton AND ALWAYS HAS.
                   The state models differ (yours / won / lost / spent here,
                   picked / spent / bye there) which is why it was forked in the
                   first place, and the cost showed up the moment the tiles were
                   restyled: TeamButton was rebuilt as a club-coloured sprite
                   block and this grid silently kept the old dark cards. If a
                   third state model ever appears, merge them instead. */
                style={
                  s === "open" || s === "won"
                    ? { background: t.lead }
                    : undefined
                }
                className={[
                  "relative flex h-14 w-full flex-col items-center justify-center overflow-hidden",
                  "text-center transition-transform duration-75",
                  s === "yours"
                    ? finished
                      ? survived
                        ? "bg-alive text-panel bevel-in"
                        : "bg-out text-panel bevel-in"
                      : "bg-action text-panel bevel-in"
                    : /* Dither, never opacity. A spent team keeps a fully
                         legible label and the checkerboard carries the state. */
                      s === "spent" || s === "lost"
                      ? "bg-panel dither bevel"
                      : "bevel",
                  s === "won" ? "ring-2 ring-inset ring-alive" : "",
                  phase === "pick" && s !== "spent"
                    ? "cursor-pointer active:translate-x-[2px] active:translate-y-[2px]"
                    : "cursor-default",
                ].join(" ")}
              >
                {s === "open" || s === "won" ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[4px]"
                    style={{ background: t.trim }}
                  />
                ) : null}
                <span
                  className={`font-matrix text-[10px] leading-4 ${
                    s === "yours" ? "" : "tile-label"
                  } ${s === "spent" ? "line-through" : ""}`}
                >
                  {t.abbr}
                </span>
                <span
                  className={`text-[9px] uppercase tracking-wide ${
                    s === "yours" ? "text-panel" : "tile-label"
                  }`}
                >
                  {t.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        {phase === "pick" ? (
          <p className="text-sm text-cream-dim">
            One team a week. Win and you advance, lose or tie and you are out,
            and each team is spent for the season whether it carried you or not.
          </p>
        ) : phase === "locking" ? (
          <p className="text-sm text-cream-dim">Waiting on the scoreboard…</p>
        ) : survivedThree ? (
          <>
            <Link
              href="/pools/new"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-action px-6 text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi"
            >
              Start a real pool
            </Link>
            <p className="text-sm text-cream-dim">
              Three weeks down. A season is eighteen, and by week nine the teams
              you have left are the whole game.
            </p>
          </>
        ) : survived ? (
          <>
            <button
              type="button"
              onClick={nextWeek}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-action px-6 text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi"
            >
              Play week {weekNo + 1}
            </button>
            <p className="text-sm text-cream-dim">
              {TEAMS[picked!].name} are spent now. You cannot pick them again
              this season.
            </p>
          </>
        ) : (
          <>
            {/* CONTINUE?, counting down from ten, which is the single most
                Tecmo element on the site and costs one interval.

                It never navigates, never steals focus, and letting it reach
                zero does nothing worse than leaving the button as an ordinary
                one. A countdown that took an action on its own would be a trap
                rather than a joke. */}
            <button
              type="button"
              onClick={restart}
              className="btn btn-secondary"
            >
              {continueIn !== null ? (
                <>
                  CONTINUE?{" "}
                  <span className="ml-2 tabular-nums text-action">
                    {continueIn}
                  </span>
                </>
              ) : (
                "TRY AGAIN"
              )}
            </button>
            <p className="text-sm text-cream-dim">
              That is the whole game. One wrong week and the season is over,
              which is why nobody wants the pot sitting in a friend&rsquo;s
              account while it plays out.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
