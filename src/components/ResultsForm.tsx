"use client";

/* The commissioner posts a week, against the week's actual games.
 *
 * THIS IS THE ONE PIECE OF TRUST THE DESIGN KEEPS, so the screen is built to
 * make it checkable rather than to make it fast. Results enter through a human,
 * and the defence is that everything that human claims is visible to everyone
 * else against a scoreboard they already have open, for a window long enough to
 * do something about it.
 *
 * IT SHOWS GAMES, NOT AN ALPHABET. It used to be thirty-two teams sorted A to
 * Z, which asked a commissioner to remember sixteen scores and offered no way
 * to check their work. Worse, it made two illegal states reachable: both teams
 * in one game marked winners, and a game silently left unresolved — which is
 * not a neutral act, because the program reads an unmarked team as a loss, so
 * forgetting one game eliminates everybody who picked either side of it.
 *
 * Both are now unreachable. A game holds one outcome, and the form refuses to
 * post while any game is undecided.
 *
 * BYES ARE NOT LOSSES AND ARE NOT SHOWN AS MARKABLE. A team that is not playing
 * cannot be picked — the pick grid enforces that — so it belongs in neither
 * mask, and listing it separately is the only honest place for it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { teamByAbbr, type Team } from "@/lib/nfl";
import { gamesFor, weekOf } from "@/lib/season";
import { countdown } from "@/lib/format";
import { MIN_POST_DELAY_SECS } from "@/lib/schedule";
import { ClubBar } from "@/components/TeamButton";
import {
  buildPostResults,
  maskCount,
  maskHas,
  maskWith,
  maskWithout,
  readableProgramError,
  type PoolView,
} from "@/lib/program";

type Status =
  | { at: "idle" }
  | { at: "signing" }
  | { at: "confirming" }
  | { at: "error"; message: string };

/** What a game's row is currently claiming. */
type Outcome = "undecided" | "away" | "home" | "push";

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

  const [winners, setWinners] = useState(0);
  const [pushes, setPushes] = useState(0);
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
  const games = useMemo(
    () =>
      gamesFor(week)
        .map((g) => {
          const away = teamByAbbr(g.away);
          const home = teamByAbbr(g.home);
          return away && home ? { away, home } : null;
        })
        .filter((g): g is { away: Team; home: Team } => g !== null),
    [week],
  );
  const byes = useMemo(
    () =>
      (weekOf(week)?.byes ?? [])
        .map(teamByAbbr)
        .filter((t): t is Team => t !== undefined),
    [week],
  );

  const outcomeOf = (g: { away: Team; home: Team }): Outcome => {
    if (maskHas(pushes, g.away.i)) return "push";
    if (maskHas(winners, g.away.i)) return "away";
    if (maskHas(winners, g.home.i)) return "home";
    return "undecided";
  };

  /* One outcome per game, enforced by construction: setting any of them clears
   * the other three. Two winners in one game is not a state this form can
   * produce, which is stronger than refusing it afterwards. */
  const decide = (g: { away: Team; home: Team }, next: Outcome) => {
    if (!open || status.at !== "idle") return;
    const clear = (m: number) => maskWithout(maskWithout(m, g.away.i), g.home.i);
    const current = outcomeOf(g);
    const target = current === next ? "undecided" : next;

    setWinners((w) => {
      const cleared = clear(w);
      if (target === "away") return maskWith(cleared, g.away.i);
      if (target === "home") return maskWith(cleared, g.home.i);
      return cleared;
    });
    setPushes((p) => {
      const cleared = clear(p);
      return target === "push"
        ? maskWith(maskWith(cleared, g.away.i), g.home.i)
        : cleared;
    });
  };

  const undecided = games.filter((g) => outcomeOf(g) === "undecided").length;
  const busy = status.at === "signing" || status.at === "confirming";

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
      setWinners(0);
      setPushes(0);
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
        <h2 className="display text-2xl uppercase">Post week {week}</h2>
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
          ? "Tap the team that won each game. A cancelled or tied game is a push, which carries whoever picked either side."
          : "Results cannot be posted until three hours after a week's first kickoff. That floor is in the program, not in this form."}
      </p>

      <ul className="mt-5 flex flex-col gap-1.5">
        {games.map((g) => {
          const o = outcomeOf(g);
          return (
            <li
              key={`${g.away.abbr}-${g.home.abbr}`}
              className="grid grid-cols-[1fr_auto_1fr_auto] items-stretch gap-1.5"
            >
              <Side
                team={g.away}
                won={o === "away"}
                lost={o === "home"}
                push={o === "push"}
                disabled={!open || busy}
                onClick={() => decide(g, "away")}
              />
              <span className="self-center px-1 text-[11px] text-cream-dim/60">
                at
              </span>
              <Side
                team={g.home}
                won={o === "home"}
                lost={o === "away"}
                push={o === "push"}
                disabled={!open || busy}
                onClick={() => decide(g, "home")}
              />
              <button
                type="button"
                onClick={() => decide(g, "push")}
                disabled={!open || busy}
                aria-pressed={o === "push"}
                aria-label={`${g.away.city} at ${g.home.city}: mark the game a push`}
                className={[
                  "rounded-lg border px-2.5 text-[10px] font-bold tracking-[0.1em] transition-colors",
                  o === "push"
                    ? "border-cream-dim bg-cream-dim/20 text-cream"
                    : "border-night-3 text-cream-dim/60 hover:border-cream-dim/60",
                  !open || busy ? "cursor-not-allowed" : "",
                ].join(" ")}
              >
                PUSH
              </button>
            </li>
          );
        })}
      </ul>

      {byes.length > 0 ? (
        <p className="mt-4 text-xs text-cream-dim">
          <span className="font-bold tracking-[0.14em]">ON A BYE</span>{" "}
          {byes.map((t) => t.abbr).join(" ")} — not playing, and not pickable, so
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
        <span className="font-bold text-cream">
          {maskCount(pushes) / 2} push
        </span>
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
  lost,
  push,
  disabled,
  onClick,
}: {
  team: Team;
  won: boolean;
  lost: boolean;
  push: boolean;
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
          : push
            ? "border-cream-dim/40 bg-night-2 text-cream-dim"
            : lost
              ? "border-night-3 bg-night-2/40 text-cream-dim/50"
              : "border-night-3 bg-night-2 text-cream hover:border-action",
        disabled ? "cursor-not-allowed" : "",
      ].join(" ")}
    >
      <ClubBar team={team} dim={lost || push} />
      <span className="text-sm font-bold tracking-wide">{team.abbr}</span>
      <span className="truncate text-[11px] uppercase tracking-wide opacity-60">
        {team.name}
      </span>
    </button>
  );
}
