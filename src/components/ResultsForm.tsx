"use client";

/* The commissioner posts a week, against the week's actual games.
 *
 * THIS IS THE ONE PIECE OF TRUST THE DESIGN KEEPS, so the screen is built to
 * make it checkable rather than to make it fast. Results enter through a human,
 * and the defence is that everything that human claims is visible to everyone
 * else against a scoreboard they already have open, for a window long enough to
 * do something about it.
 *
 * FILLING FROM THE SCOREBOARD DOES NOT MAKE THIS AN ORACLE. The chain only ever
 * sees what the commissioner signed, and the members' veto is unchanged, so the
 * feed is a typing aid and nothing more. It is a button rather than something
 * that happens on load, because the commissioner is accountable for what they
 * post and should take somebody else's data deliberately. It fills only games
 * that are FINAL, which pairs with the rule below: a week cannot be posted
 * while any game is unresolved, so it cannot be posted before the games are
 * actually over.
 *
 * THE OUTCOMES ARE THE STATE, NOT THE MASKS. Two bitmasks cannot express a tie
 * — neither team won and it is not a push — and a tie is a real NFL result that
 * the rules count as a loss for both sides. Holding one outcome per game and
 * deriving the masks makes that sayable, and makes "undecided" countable rather
 * than indistinguishable from "both lost".
 *
 * BYES ARE NOT LOSSES AND ARE NOT MARKABLE. A team that is not playing cannot
 * be picked, so it belongs in neither mask.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { teamByAbbr, type Team } from "@/lib/nfl";
import { gamesFor, weekOf } from "@/lib/season";
import { countdown } from "@/lib/format";
import { MIN_POST_DELAY_SECS } from "@/lib/schedule";
import { ClubBar } from "@/components/TeamButton";
import type { Scoreboard } from "@/lib/scores";
import {
  buildPostResults,
  maskCount,
  maskWith,
  readableProgramError,
  type PoolView,
} from "@/lib/program";

type Status =
  | { at: "idle" }
  | { at: "filling" }
  | { at: "signing" }
  | { at: "confirming" }
  | { at: "error"; message: string };

/** What a game's row claims. A tie contributes to neither mask, exactly as a
 *  loss for both sides should. */
type Outcome = "undecided" | "away" | "home" | "push" | "tie";

type Matchup = { key: string; away: Team; home: Team };

export function ResultsForm({
  poolKey,
  pool,
  onPosted,
}: {
  poolKey: PublicKey;
  pool: PoolView;
  onPosted: () => void | Promise<void>;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [filled, setFilled] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ at: "idle" });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const week = pool.currentWeek;
  const lockSecs = pool.lockTs[week - 1];
  const opensAt = useMemo(
    () => (lockSecs ? new Date((lockSecs + MIN_POST_DELAY_SECS) * 1000) : null),
    [lockSecs],
  );
  const open = !!opensAt && now >= opensAt;

  /* Pair the schedule's abbreviations with the on-chain team index once. A game
   * whose team is not in the index is dropped rather than guessed at, which can
   * only happen if the schedule and lib/nfl.ts have drifted. */
  const games: Matchup[] = useMemo(
    () =>
      gamesFor(week)
        .map((g) => {
          const away = teamByAbbr(g.away);
          const home = teamByAbbr(g.home);
          return away && home
            ? { key: `${g.away}@${g.home}`, away, home }
            : null;
        })
        .filter((g): g is Matchup => g !== null),
    [week],
  );

  const byes = useMemo(
    () =>
      (weekOf(week)?.byes ?? [])
        .map(teamByAbbr)
        .filter((t): t is Team => t !== undefined),
    [week],
  );

  const outcomeOf = (g: Matchup): Outcome => outcomes[g.key] ?? "undecided";

  /* The masks the program actually receives, derived rather than stored. A tie
   * and an undecided game both contribute nothing — which is correct, because
   * the program reads an unmarked team as a loss and that is what a tie is. */
  const { winners, pushes } = useMemo(() => {
    let w = 0;
    let p = 0;
    for (const g of games) {
      switch (outcomes[g.key]) {
        case "away":
          w = maskWith(w, g.away.i);
          break;
        case "home":
          w = maskWith(w, g.home.i);
          break;
        case "push":
          p = maskWith(maskWith(p, g.away.i), g.home.i);
          break;
        default:
          break;
      }
    }
    return { winners: w, pushes: p };
  }, [games, outcomes]);

  /** One outcome per game. Choosing the same one again clears it. */
  const decide = (g: Matchup, next: Outcome) => {
    if (!open || status.at === "signing" || status.at === "confirming") return;
    setFilled(null);
    setOutcomes((o) => ({
      ...o,
      [g.key]: (o[g.key] ?? "undecided") === next ? "undecided" : next,
    }));
  };

  const undecided = games.filter((g) => outcomeOf(g) === "undecided").length;
  const ties = games.filter((g) => outcomeOf(g) === "tie").length;
  const busy = status.at === "signing" || status.at === "confirming";

  /* Fill what the scoreboard already knows. Only final games: one still being
   * played has no answer yet, and guessing at it is the one thing this screen
   * must never do. */
  const fill = useCallback(async () => {
    setStatus({ at: "filling" });
    try {
      const res = await fetch(`/api/scores?week=${week}`);
      if (!res.ok) throw new Error(`The scoreboard returned ${res.status}.`);
      const board = (await res.json()) as Scoreboard;

      const pair = (a: string, b: string) => [a, b].sort().join("|");
      const feed = new Map(
        board.games.map((g) => [pair(g.away.abbr, g.home.abbr), g]),
      );

      let applied = 0;
      const next: Record<string, Outcome> = {};
      for (const g of games) {
        const f = feed.get(pair(g.away.abbr, g.home.abbr));
        if (!f || f.winner === null) continue;
        const winAbbr =
          f.winner === "home"
            ? f.home.abbr
            : f.winner === "away"
              ? f.away.abbr
              : null;
        next[g.key] =
          f.winner === "tie"
            ? "tie"
            : winAbbr === g.away.abbr
              ? "away"
              : winAbbr === g.home.abbr
                ? "home"
                : "undecided";
        if (next[g.key] !== "undecided") applied++;
      }

      setOutcomes((o) => ({ ...o, ...next }));
      setStatus({ at: "idle" });
      const short = games.length - applied;
      setFilled(
        short === 0
          ? `Filled all ${applied} games from the scoreboard. Check them.`
          : `Filled ${applied} of ${games.length}. ${short} ${short === 1 ? "game is" : "games are"} not final yet.`,
      );
    } catch (err) {
      setStatus({
        at: "error",
        message: `Could not read the scoreboard: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  }, [week, games]);

  const post = useCallback(async () => {
    if (!publicKey || !signTransaction || busy || !open || undecided > 0) return;

    setStatus({ at: "signing" });
    try {
      const instruction = buildPostResults({
        pool: poolKey,
        commissioner: publicKey,
        week,
        winners,
        pushes,
      });

      const latest = await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }).add(instruction);

      /* Signed by the wallet, broadcast by the app. `sendTransaction` would have
       * the wallet submit through ITS configured RPC, so a wallet on devnet and
       * an app on localnet build against one chain and submit to another. */
      const signed = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      setStatus({ at: "confirming" });

      const result = await connection.confirmTransaction(
        { signature, ...latest },
        "confirmed",
      );
      if (result.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
      }

      setStatus({ at: "idle" });
      setOutcomes({});
      setFilled(null);
      await onPosted();
    } catch (err) {
      setStatus({ at: "error", message: readableProgramError(err) });
    }
  }, [
    publicKey,
    signTransaction,
    busy,
    open,
    undecided,
    poolKey,
    week,
    winners,
    pushes,
    connection,
    onPosted,
  ]);

  return (
    <section className="mt-8 rounded-xl border border-night-3 bg-night-2/60 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-base uppercase">Post week {week}</h2>
        <p className="text-sm">
          {open ? (
            <span className="font-bold text-alive">OPEN</span>
          ) : opensAt ? (
            <>
              <span className="text-cream-dim">Opens in </span>
              <span className="font-bold text-action">
                {countdown(opensAt, now)}
              </span>
            </>
          ) : (
            <span className="text-cream-dim">No lock set for this week.</span>
          )}
        </p>
      </div>

      <p className="mt-2 text-sm text-cream-dim">
        {open
          ? "Tap the team that won each game, or fill them from the scoreboard and check the result. A cancelled game is a push and carries whoever picked either side; a tie is a loss for both, which is the rule these pools have always run."
          : "Results cannot be posted until three hours after a week's first kickoff. That floor is in the program, not in this form."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={fill}
          disabled={!open || busy || status.at === "filling"}
          className="inline-flex h-10 items-center rounded-xl border border-action/50 px-4 text-xs font-bold tracking-[0.1em] text-action transition-colors hover:bg-action/10 disabled:cursor-not-allowed disabled:border-night-3 disabled:text-cream-dim"
        >
          {status.at === "filling" ? "READING…" : "FILL FROM SCOREBOARD"}
        </button>
        {filled ? (
          <span className="text-xs text-cream-dim">{filled}</span>
        ) : (
          <span className="text-xs text-cream-dim">
            You are still the one signing it, and members can still vote it down.
          </span>
        )}
      </div>

      <ul className="mt-4 flex flex-col gap-1.5">
        {games.map((g) => {
          const o = outcomeOf(g);
          return (
            <li
              key={g.key}
              className="grid grid-cols-[1fr_auto_1fr_auto_auto] items-stretch gap-1.5"
            >
              <Side
                team={g.away}
                won={o === "away"}
                dim={o === "home" || o === "push" || o === "tie"}
                disabled={!open || busy}
                onClick={() => decide(g, "away")}
              />
              <span className="self-center px-1 text-[11px] text-cream-dim/60">
                at
              </span>
              <Side
                team={g.home}
                won={o === "home"}
                dim={o === "away" || o === "push" || o === "tie"}
                disabled={!open || busy}
                onClick={() => decide(g, "home")}
              />
              <Flag
                label="PUSH"
                on={o === "push"}
                disabled={!open || busy}
                title={`${g.away.city} at ${g.home.city}: mark the game a push`}
                onClick={() => decide(g, "push")}
              />
              <Flag
                label="TIE"
                on={o === "tie"}
                disabled={!open || busy}
                title={`${g.away.city} at ${g.home.city}: mark the game a tie`}
                onClick={() => decide(g, "tie")}
              />
            </li>
          );
        })}
      </ul>

      {byes.length > 0 ? (
        <p className="mt-4 text-xs text-cream-dim">
          <span className="font-bold tracking-[0.14em]">ON A BYE</span>{" "}
          {byes.map((t) => t.abbr).join(" ")}. Not playing, and not pickable, so
          they belong to neither result.
        </p>
      ) : null}

      {status.at === "error" ? (
        <p className="mt-4 rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
          {status.message}
        </p>
      ) : null}

      <p className="mt-5 text-sm text-cream-dim">
        <span className="font-bold text-alive">{maskCount(winners)} won</span>
        {" · "}
        <span className="font-bold text-cream">{maskCount(pushes) / 2} push</span>
        {ties > 0 ? (
          <>
            {" · "}
            <span className="font-bold text-cream">{ties} tied</span>
          </>
        ) : null}
        {undecided > 0 ? (
          <>
            {" · "}
            <span className="font-bold text-out">{undecided} undecided</span>
          </>
        ) : null}
        .{" "}
        {undecided > 0
          ? "A game left undecided is not neutral: the program reads an unmarked team as a loss, so both sides would go out."
          : "Every game is accounted for."}
      </p>

      <button
        type="button"
        onClick={post}
        disabled={!open || busy || undecided > 0}
        className="mt-4 h-14 w-full rounded-xl bg-action text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
      >
        {status.at === "signing"
          ? "Confirm in your wallet…"
          : status.at === "confirming"
            ? "Waiting for the network…"
            : undecided > 0
              ? `${undecided} game${undecided === 1 ? "" : "s"} still to mark`
              : `Post week ${week} for review`}
      </button>

      <p className="mt-3 text-xs text-cream-dim">
        Posting settles nothing and moves no money. It opens the dispute window,
        and a majority of the members still alive can strike it down.
      </p>
    </section>
  );
}

function Side({
  team,
  won,
  dim,
  disabled,
  onClick,
}: {
  team: Team;
  won: boolean;
  dim: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={won}
      aria-label={`${team.city} ${team.name}${won ? ", winner" : ""}`}
      className={[
        "relative flex h-12 items-center gap-2 overflow-hidden rounded-lg border px-3 text-left transition-colors",
        won
          ? "border-alive bg-alive/15 text-cream"
          : dim
            ? "border-night-3 bg-night-2/40 text-cream-dim/50"
            : "border-night-3 bg-night-2 text-cream hover:border-action",
        disabled ? "cursor-not-allowed" : "",
      ].join(" ")}
    >
      <ClubBar team={team} dim={dim} />
      <span className="text-sm font-bold tracking-wide">{team.abbr}</span>
      <span className="truncate text-[11px] uppercase tracking-wide opacity-60">
        {team.name}
      </span>
    </button>
  );
}

/** The two rare outcomes, kept small because they almost never happen. */
function Flag({
  label,
  on,
  disabled,
  title,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={title}
      className={[
        "rounded-lg border px-2 text-[10px] font-bold tracking-[0.08em] transition-colors",
        on
          ? "border-cream-dim bg-cream-dim/20 text-cream"
          : "border-night-3 text-cream-dim/60 hover:border-cream-dim/60",
        disabled ? "cursor-not-allowed" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
