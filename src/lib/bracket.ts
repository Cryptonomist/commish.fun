/* Playoff brackets: the two formats, and the scoring the program will run.
 *
 * WHY THIS IS ITS OWN MODULE, and why it duplicates Rust. `programs/commish/
 * src/rules.rs` scores a bracket on chain; this file scores the same bracket in
 * the browser so a form can refuse a nonsense entry before a wallet popup and a
 * standings table can show a score that matches what the chain will pay on.
 * That is the same bargain `schedule.ts` makes with `constants.rs`, and it
 * carries the same liability: if the Rust changes and this does not, the site
 * lies. `tests-web/bracket.test.ts` pins the numbers on this side and
 * `rules.rs`'s own tests pin them on that side, against the same worked
 * examples.
 *
 * SEEDS, NOT TEAMS. The program never learns a team name. A bit in a mask means
 * SEED N in this pool's field, and the mapping from a seed to a club or a
 * school lives here, in `FORMATS`. That is the whole reason one engine can run
 * the NFL playoffs and the College Football Playoff: the parts that differ are
 * names and byes, and neither is on chain.
 */

/** Both formats we support play four rounds to a champion. */
export const BRACKET_ROUNDS = 4;

/** What a correct pick is worth, by round. Doubling, so the final matters and
 *  the first round is not decoration. Mirrors BRACKET_ROUND_POINTS in Rust. */
export const BRACKET_ROUND_POINTS = [1, 2, 4, 8] as const;

export const MIN_BRACKET_SEEDS = 9;
export const MAX_BRACKET_SEEDS = 16;

/** One entry: four bitmasks, one per round. Bit N == seed N advances. */
export type Bracket = [number, number, number, number];

export type BracketFormat = {
  key: "nfl" | "cfp";
  /** What the pool is called on the site. */
  label: string;
  /** Size of the field. Drives the shape, the byes and the perfect score. */
  seeds: number;
  /** Seeds that skip the first round, as bit indices. */
  byeSeeds: number[];
  /** Round names, in order. */
  rounds: readonly [string, string, string, string];
  /** A human label for a seed, e.g. "AFC 1" or "4". */
  seedLabel: (seed: number) => string;
  /** When the field is announced, so the site knows when a pool can be built. */
  fieldSetNote: string;
};

/* THE NFL PLAYOFFS: fourteen teams, seven per conference.
 *
 * Seeds 0-6 are the AFC's one through seven and 7-13 are the NFC's, which is an
 * arbitrary but fixed choice — arbitrary because the program does not care, and
 * fixed because a saved bracket has to mean the same thing next January. The
 * top seed in each conference rests in the wild card round, which is why the
 * byes are seeds 0 and 7 rather than 0 and 1. */
const NFL: BracketFormat = {
  key: "nfl",
  label: "NFL Playoffs",
  seeds: 14,
  byeSeeds: [0, 7],
  rounds: ["Wild Card", "Divisional", "Conference", "Super Bowl"],
  seedLabel: (seed) =>
    seed < 7 ? `AFC ${seed + 1}` : `NFC ${seed - 6}`,
  fieldSetNote: "The field is set when the regular season ends in early January.",
};

/* THE COLLEGE FOOTBALL PLAYOFF: twelve teams, one bracket, four byes.
 *
 * Seeds 0-11 are the committee's one through twelve. The top four rest through
 * the first round, which is the difference that makes the CFP's first round
 * four games where the NFL's wild card weekend is six. */
const CFP: BracketFormat = {
  key: "cfp",
  label: "College Football Playoff",
  seeds: 12,
  byeSeeds: [0, 1, 2, 3],
  rounds: ["First Round", "Quarterfinal", "Semifinal", "National Championship"],
  seedLabel: (seed) => `${seed + 1}`,
  fieldSetNote: "The field is announced on Selection Day in early December.",
};

export const FORMATS: Record<BracketFormat["key"], BracketFormat> = {
  nfl: NFL,
  cfp: CFP,
};

export function formatFor(key: string): BracketFormat | null {
  return key === "nfl" || key === "cfp" ? FORMATS[key] : null;
}

/** Every seed in the field, as a mask. */
export function seedField(seeds: number): number {
  requireFieldSize(seeds);
  return (1 << seeds) - 1;
}

/** How many teams come out of each round. See the derivation in constants.rs:
 *  both formats field eight in round two, so round one yields `seeds - 8`. */
export function bracketShape(seeds: number): [number, number, number, number] {
  requireFieldSize(seeds);
  return [seeds - 8, 4, 2, 1];
}

/** How many teams sit out the first round. */
export function bracketByes(seeds: number): number {
  requireFieldSize(seeds);
  return MAX_BRACKET_SEEDS - seeds;
}

/** The most any entry can score in a field this size. NFL 30, CFP 28. */
export function perfectScore(seeds: number): number {
  return bracketShape(seeds).reduce(
    (total, advancing, round) => total + advancing * BRACKET_ROUND_POINTS[round],
    0,
  );
}

export type BracketProblem = { round: number; message: string };

/* Everything the program checks about an entry, checked here first.
 *
 * The rules match `validate_bracket` in Rust exactly, including the awkward
 * one: round two may contain seeds that were not in round one, because the bye
 * teams join there, but no more of them than the format actually rests. A plain
 * "round two is a subset of round one" would reject every CFP entry where a bye
 * team wins its quarter-final, which is most of them.
 *
 * Returns the FIRST problem, or null, the same way `validateSchedule` does: a
 * form that reports four errors at once is a form nobody reads. */
export function validateBracket(
  entry: Bracket,
  seeds: number,
): BracketProblem | null {
  const field = seedField(seeds);
  const shape = bracketShape(seeds);
  const byes = bracketByes(seeds);

  for (let r = 0; r < BRACKET_ROUNDS; r++) {
    if ((entry[r] & ~field) !== 0) {
      return { round: r, message: "That seed is not in this field." };
    }
    const picked = popcount(entry[r]);
    if (picked !== shape[r]) {
      return {
        round: r,
        message: `Pick ${shape[r]} to advance, not ${picked}.`,
      };
    }
  }
  if (popcount(entry[1] & ~entry[0]) > byes) {
    return {
      round: 1,
      message:
        `Only ${byes} ${byes === 1 ? "team rests" : "teams rest"} in the first ` +
        `round, so no more than that can appear here for the first time.`,
    };
  }
  for (let r = 2; r < BRACKET_ROUNDS; r++) {
    if ((entry[r] & ~entry[r - 1]) !== 0) {
      return {
        round: r,
        message: "A team that lost cannot come back and win a later round.",
      };
    }
  }
  return null;
}

/* WHAT WINS THE POT: a perfect bracket, and nothing else.
 *
 * Every game in a round has to be right, so one missed game in the first round
 * ends an entry as surely as losing the final. Mirrors `bracket_survives_round`
 * in Rust.
 *
 * Usually nobody wins, and the site has to say so plainly rather than letting
 * somebody assume the closest bracket takes it. When no entry is perfect the
 * pot is refunded in full: `reclaim_dues` splits the vault pro rata after the
 * refund deadline and charges no fee, because the fee is only ever taken when a
 * pool actually settles on a winner. Jackpot, or your buy-in back. */
export function survivesRound(picks: number, winners: number): boolean {
  return picks === winners;
}

/** Is this entry still perfect after `posted` rounds have been finalized? */
export function stillPerfect(
  entry: Bracket,
  winners: Bracket,
  posted: number,
): boolean {
  const through = Math.min(Math.max(posted, 0), BRACKET_ROUNDS);
  for (let r = 0; r < through; r++) {
    if (!survivesRound(entry[r], winners[r])) return false;
  }
  return true;
}

/* WHO GETS PAID, mirroring `rules.rs`.
 *
 * At least one perfect entry and they split the whole pot evenly, ladder
 * ignored. Nobody perfect and the ladder pays the top finishers by points. A
 * tie splits the slots it spans, so two members tied for second in a 60/30/10
 * pool take twenty each rather than thirty and ten decided by a coin toss.
 *
 * The last rank group absorbs any slot the roster was too small to reach, so a
 * three-person pool against a five-slot ladder still pays its pot out in full
 * on the day it settles. A league on this program once could not post a payout
 * at all for exactly that reason, and an unfilled slot locks money until the
 * refund deadline.
 *
 * Amounts are micro-USDC as bigint, the way the rest of the client carries
 * money, and written as `BigInt(...)` rather than `0n` because the project
 * targets ES2017. Integer division throughout, so the dust stays in the vault.
 *
 * `ladderMemberShare` with a single member is the same arithmetic as
 * `slotAmount` in `program.ts`, which pays a league's prize slots. The two are
 * pinned together by a test rather than sharing an import, so this module stays
 * free of web3 dependencies the way `rules.rs` stays free of Anchor accounts. */

const BPS_DENOM = BigInt(10_000);
const ZERO = BigInt(0);

/** What each perfect entry takes. */
export function perfectShare(payable: bigint, perfectCount: number): bigint {
  if (perfectCount <= 0) throw new Error("A perfect share needs a winner.");
  return payable / BigInt(perfectCount);
}

/** The share one rank group covers, in basis points. */
export function ladderGroupBps(
  ladder: readonly number[],
  taken: number,
  size: number,
  last: boolean,
): number {
  if (size <= 0) throw new Error("A rank group has at least one member.");
  const start = Math.min(taken, ladder.length);
  const end = Math.max(
    last ? ladder.length : Math.min(taken + size, ladder.length),
    start,
  );
  let total = 0;
  for (let i = start; i < end; i++) total += ladder[i];
  return total;
}

/** What one member of a rank group is paid. */
export function ladderMemberShare(
  payable: bigint,
  coveredBps: number,
  size: number,
): bigint {
  if (size <= 0) throw new Error("A rank group has at least one member.");
  if (coveredBps < 0 || BigInt(coveredBps) > BPS_DENOM) {
    throw new Error("A group cannot cover more than the whole pot.");
  }
  return (payable * BigInt(coveredBps)) / BPS_DENOM / BigInt(size);
}

/** A finished or in-progress standing, highest score first. */
export type Standing = { wallet: string; points: number; perfect: boolean };

/* What every member would be paid if the pool settled on these standings.
 *
 * The site's answer to "what am I playing for", usable mid-playoffs as a
 * projection and after the final as the real thing. Returns a share for every
 * standing in the order given. */
export function payoutTable(
  standings: readonly Standing[],
  ladder: readonly number[],
  payable: bigint,
): bigint[] {
  const perfect = standings.filter((s) => s.perfect).length;
  if (perfect > 0) {
    const share = perfectShare(payable, perfect);
    return standings.map((s) => (s.perfect ? share : ZERO));
  }
  const paid = standings.map(() => ZERO);
  let i = 0;
  let taken = 0;
  while (i < standings.length) {
    let j = i;
    while (j < standings.length && standings[j].points === standings[i].points) j++;
    const size = j - i;
    const bps = ladderGroupBps(ladder, taken, size, j === standings.length);
    const share = ladderMemberShare(payable, bps, size);
    for (let k = i; k < j; k++) paid[k] = share;
    taken += size;
    i = j;
  }
  return paid;
}

/* Everything below scores an entry in POINTS, which decides no money.
 *
 * It is the standing the site shows while the playoffs run — who is still
 * alive, who busted on wild card weekend — and nothing more. The pot is decided
 * by `stillPerfect` above. Keeping them apart matters: a leaderboard that looks
 * like a payout order, in a pool that pays only perfection, tells people they
 * are owed money they are not. */

/** What one round scored. */
export function roundPoints(
  picks: number,
  winners: number,
  round: number,
): number {
  if (round < 0 || round >= BRACKET_ROUNDS) return 0;
  return popcount(picks & winners) * BRACKET_ROUND_POINTS[round];
}

/** What a whole entry scored against results so far. Rounds not yet posted
 *  contribute nothing, so this is also the running standing. */
export function bracketTotal(entry: Bracket, winners: Bracket): number {
  let total = 0;
  for (let r = 0; r < BRACKET_ROUNDS; r++) {
    total += roundPoints(entry[r], winners[r], r);
  }
  return total;
}

/** The points still available to an entry after `posted` rounds. What the site
 *  needs to say "still alive" rather than just showing a score. */
export function pointsRemaining(seeds: number, postedRounds: number): number {
  const shape = bracketShape(seeds);
  let left = 0;
  for (let r = Math.max(0, postedRounds); r < BRACKET_ROUNDS; r++) {
    left += shape[r] * BRACKET_ROUND_POINTS[r];
  }
  return left;
}

/** Seeds in a mask, ascending. For rendering an entry. */
export function seedsIn(mask: number): number[] {
  const out: number[] = [];
  for (let s = 0; s < MAX_BRACKET_SEEDS; s++) {
    if (mask & (1 << s)) out.push(s);
  }
  return out;
}

function popcount(mask: number): number {
  let n = mask >>> 0;
  let count = 0;
  while (n) {
    n &= n - 1;
    count++;
  }
  return count;
}

function requireFieldSize(seeds: number): void {
  if (
    !Number.isInteger(seeds) ||
    seeds < MIN_BRACKET_SEEDS ||
    seeds > MAX_BRACKET_SEEDS
  ) {
    throw new Error(
      `A playoff bracket needs ${MIN_BRACKET_SEEDS} to ${MAX_BRACKET_SEEDS} seeds, not ${seeds}.`,
    );
  }
}
