/* THE DECISION: turn what the feeds say into the two masks the program takes,
 * or refuse. Pure, so it can be tested against every shape of disagreement
 * without a network or a chain.
 *
 * THE RULE IS AGREEMENT OR NOTHING. A week is posted only when at least
 * `minAgreeing` independent feeds each report every fixture in the week as
 * final, and every one of them names the same winner for every game. Any gap,
 * any game still in progress, any disagreement, and the answer is "do not
 * post" with a reason a human can act on. The commissioner's own door is
 * always open, so refusing costs a manual posting and never a wrong one.
 *
 * WHY NOT ONE FEED. ESPN's endpoint is undocumented, unversioned and
 * unlicensed, and scores.ts says in its first paragraph that wiring it to
 * post_results alone would make the product an oracle with no oracle's
 * guarantees. Two sources that have to agree is what turns "an undocumented
 * endpoint decides money" into "two independent endpoints would both have to
 * be wrong in the same direction, and the members can still veto".
 *
 * WHAT THIS NEVER DOES. It never marks a push. A push voids a game for both
 * sides, and the situations that call for one (a postponement, a cancelled
 * game, a ruling) are exactly the ones a feed does not describe and a person
 * should. A game the feeds cannot settle stops the posting; it does not get
 * quietly voided.
 *
 * TIES. A tie is a real NFL outcome and the rules make it a loss for both
 * sides, which is also what the program does with an unmarked team. So a tie
 * contributes no bit, the same as the results form.
 */

import { teamByAbbr } from "@/lib/nfl";
import type { Game as Fixture } from "@/lib/season";

/** One game as a feed reports it, abbreviations already normalized. */
export type Outcome = {
  home: string;
  away: string;
  /** True only once the feed considers the game over. */
  final: boolean;
  /** Meaningful only when `final`. */
  winner: "home" | "away" | "tie" | null;
};

export type Board = {
  source: string;
  games: Outcome[];
};

export type Verdict =
  | {
      post: true;
      winners: number;
      pushes: 0;
      /** Which sources agreed, for the log. */
      sources: string[];
      games: number;
    }
  | { post: false; reason: string };

const key = (home: string, away: string) => `${away}@${home}`;

/**
 * Was a posting for the current week already made and struck down?
 *
 * THE ORACLE NEVER ARGUES WITH THE MEMBERS. If it posts a week and a majority
 * vetoes it, the feeds have not changed, so posting again would propose the
 * identical result every ten minutes until the members gave up. From a veto
 * onward that week belongs to the commissioner.
 *
 * The program leaves exactly one trace of a cleared posting: a veto resets
 * `pending_week`, the masks and the status, but not `pending_posted_ts`. So
 * "nothing is pending, yet something was posted after this week's lock" can
 * only mean a posting for this week was struck down. A leftover timestamp
 * from an earlier week cannot fool it, because the schedule forces every
 * week's posting to land before the next week's lock.
 */
export function struckDown(pool: {
  pendingWeek: number;
  pendingPostedTs: number;
  currentWeek: number;
  lockTs: number[];
}): boolean {
  const lock = pool.lockTs[pool.currentWeek - 1];
  if (!lock) return false;
  return pool.pendingWeek === 0 && pool.pendingPostedTs >= lock;
}

/**
 * Decide a week. `fixtures` is the schedule the pool was created against;
 * `boards` is what each feed said just now.
 */
export function decideWeek(
  fixtures: Fixture[],
  boards: Board[],
  minAgreeing = 2,
): Verdict {
  if (fixtures.length === 0) {
    return { post: false, reason: "no fixtures for this week" };
  }
  if (minAgreeing < 1) {
    return { post: false, reason: "minAgreeing must be at least 1" };
  }
  if (boards.length < minAgreeing) {
    return {
      post: false,
      reason: `only ${boards.length} feed(s) answered; ${minAgreeing} required`,
    };
  }

  /* Every board is indexed by matchup. A feed that lists the same matchup
   * twice is treated as not having it: two answers is no answer. */
  const indexed = boards.map((b) => {
    const m = new Map<string, Outcome | "dup">();
    for (const g of b.games) {
      const k = key(g.home, g.away);
      m.set(k, m.has(k) ? "dup" : g);
    }
    return { source: b.source, m };
  });

  let winners = 0;
  for (const f of fixtures) {
    const k = key(f.home, f.away);
    let agreed: Outcome["winner"] | undefined;

    for (const { source, m } of indexed) {
      const g = m.get(k);
      if (!g) return { post: false, reason: `${k} missing from ${source}` };
      if (g === "dup") return { post: false, reason: `${k} listed twice by ${source}` };
      if (!g.final) return { post: false, reason: `${k} not final on ${source}` };
      if (g.winner === null) {
        return { post: false, reason: `${k} final on ${source} but no winner given` };
      }
      if (agreed === undefined) agreed = g.winner;
      else if (agreed !== g.winner) {
        return {
          post: false,
          reason: `feeds disagree on ${k}: ${indexed[0].source} says ${agreed}, ${source} says ${g.winner}`,
        };
      }
    }

    if (agreed === "tie") continue; // a loss for both, so no bit for either
    const abbr = agreed === "home" ? f.home : f.away;
    const team = teamByAbbr(abbr);
    if (!team) return { post: false, reason: `unknown team ${abbr} in fixtures` };
    winners = (winners | (1 << team.i)) >>> 0;
  }

  return {
    post: true,
    winners,
    pushes: 0,
    sources: boards.map((b) => b.source),
    games: fixtures.length,
  };
}
