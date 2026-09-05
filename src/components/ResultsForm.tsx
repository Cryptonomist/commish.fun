"use client";

/* The commissioner proposes a week.
 *
 * THIS IS THE ONE PIECE OF TRUST THE DESIGN KEEPS, so the screen is built to
 * make it checkable rather than to make it fast. Results enter through a human,
 * and the defence is that everything that human claims is visible to everyone
 * else against a scoreboard they already have open, for a window long enough to
 * do something about it. A form that made posting feel like an administrative
 * chore would be hiding the only moment where the commissioner can be wrong.
 *
 * EVERY TEAM IS ONE CONTROL WITH THREE STATES: not marked, won, push. Two
 * independent mask editors would let a commissioner mark a team both a winner
 * and a push, which the program refuses with OverlappingMasks, and which would
 * otherwise make the survive test depend on which branch ran first. Cycling one
 * control makes the illegal state unreachable rather than merely rejected.
 *
 * NOT MARKED IS A LOSS. `rules::survives` carries a member on `won() ||
 * pushed()`, so a team left alone eliminates everyone who picked it. That is
 * the sentence the summary line has to say out loud, because the destructive
 * outcome here is the one that comes from doing nothing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { TEAMS } from "@/lib/nfl";
import { countdown } from "@/lib/format";
import { MIN_POST_DELAY_SECS } from "@/lib/schedule";
import {
  buildPostResults,
  maskCount,
  maskHas,
  maskWith,
  maskWithout,
  readableProgramError,
  TEAM_COUNT,
  type PoolView,
} from "@/lib/program";

type Status =
  | { at: "idle" }
  | { at: "signing" }
  | { at: "confirming" }
  | { at: "error"; message: string };

/** Not marked, won, push. The order the control cycles through. */
type Mark = "none" | "won" | "push";

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

  /* `post_results` refuses until three hours after the week's own lock, a floor
   * that stops a commissioner posting a week before it has been played. Showing
   * the clock beats showing a disabled button with no reason, and refusing here
   * means the wallet never opens on a transaction the chain would reject. */
  const week = pool.currentWeek;
  const lockSecs = pool.lockTs[week - 1];
  const opensAt = useMemo(
    () => (lockSecs ? new Date((lockSecs + MIN_POST_DELAY_SECS) * 1000) : null),
    [lockSecs],
  );
  const open = !!opensAt && now >= opensAt;

  const marked = maskCount(winners) + maskCount(pushes);
  const busy = status.at === "signing" || status.at === "confirming";

  const markOf = (team: number): Mark =>
    maskHas(winners, team) ? "won" : maskHas(pushes, team) ? "push" : "none";

  const cycle = (team: number) => {
    if (busy || !open) return;
    switch (markOf(team)) {
      case "none":
        setWinners((w) => maskWith(w, team));
        break;
      case "won":
        setWinners((w) => maskWithout(w, team));
        setPushes((p) => maskWith(p, team));
        break;
      case "push":
        setPushes((p) => maskWithout(p, team));
        break;
    }
  };

  const post = useCallback(async () => {
    if (!publicKey || !signTransaction || busy || !open) return;

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
              <span className="font-bold text-leather">
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
          ? "Mark every team that won. Tap again for a push, a cancelled or voided game, which carries whoever picked it. Everything you leave alone is a loss."
          : "Results cannot be posted until three hours after a week's first kickoff. That floor is in the program, not in this form."}
      </p>

      <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {TEAMS.map((t) => {
          const mark = markOf(t.i);
          const next =
            mark === "none" ? "a winner" : mark === "won" ? "a push" : "unmarked";
          const said =
            mark === "none" ? "not marked" : mark === "won" ? "winner" : "push";

          return (
            <li key={t.abbr}>
              <button
                type="button"
                onClick={() => cycle(t.i)}
                disabled={!open || busy}
                aria-label={`${t.city} ${t.name}: ${said}. Tap to mark ${next}.`}
                className={[
                  "flex h-16 w-full flex-col items-center justify-center rounded-xl border text-center transition-colors",
                  mark === "won"
                    ? "border-alive bg-alive text-night"
                    : mark === "push"
                      ? "border-cream-dim bg-cream-dim/15 text-cream"
                      : "border-night-3 bg-night-2 text-cream hover:border-leather",
                  !open || busy ? "cursor-not-allowed opacity-70" : "",
                ].join(" ")}
              >
                <span className="text-sm font-bold tracking-wide">{t.abbr}</span>
                <span className="text-[10px] uppercase tracking-wide opacity-70">
                  {mark === "won" ? "WON" : mark === "push" ? "PUSH" : t.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {status.at === "error" ? (
        <p className="mt-4 rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
          {status.message}
        </p>
      ) : null}

      <p className="mt-5 text-sm text-cream-dim">
        <span className="font-bold text-alive">{maskCount(winners)} won</span>
        {" · "}
        <span className="font-bold text-cream">{maskCount(pushes)} push</span>
        {" · "}
        <span className="font-bold text-out">{TEAM_COUNT - marked} not marked</span>
        . Every member who picked an unmarked team is out.
      </p>

      <button
        type="button"
        onClick={post}
        disabled={!open || busy || marked === 0}
        className="mt-4 h-14 w-full rounded-xl bg-leather text-sm font-bold tracking-wide text-night transition-colors hover:bg-leather-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
      >
        {status.at === "signing"
          ? "Confirm in your wallet…"
          : status.at === "confirming"
            ? "Waiting for the network…"
            : marked === 0
              ? "Mark the week's results"
              : `Post week ${week} for review`}
      </button>

      <p className="mt-3 text-xs text-cream-dim">
        Posting settles nothing and moves no money. It opens the dispute window,
        and a majority of the members still alive can strike it down.
      </p>
    </section>
  );
}
