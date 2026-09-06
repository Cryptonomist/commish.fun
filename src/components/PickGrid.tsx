"use client";

/* Thirty-two teams, one pick, one deadline.
 *
 * THE SPENT TEAMS ARE THE GAME. A Survivor pool is easy in week one and brutal
 * in week nine, entirely because of what you have already used. So the grid
 * shows the whole season's spending at a glance rather than hiding it behind a
 * dropdown: a struck-through team is gone for good, and the count of what is
 * left is the number that should worry you.
 *
 * THE DEADLINE IS THE PRODUCT. `submit_pick` refuses at `lock_ts`, to the
 * second, and a missed pick is elimination in every mode with no grace. A
 * countdown that only updates on reload would be a lie of omission, so it ticks.
 *
 * A pick is changeable until the lock, which is why clicking a team submits
 * immediately rather than staging a change behind a Save button. The wallet
 * popup is the confirmation step, and there is nothing to lose by picking
 * early and switching later.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { TEAMS } from "@/lib/nfl";
import { TeamButton } from "@/components/TeamButton";
import { countdown } from "@/lib/format";
import {
  buildSubmitPick,
  hasUsed,
  isAlive,
  readableProgramError,
  NO_PICK,
  type MemberView,
  type PoolView,
} from "@/lib/program";

type Status =
  | { at: "idle" }
  | { at: "signing"; team: number }
  | { at: "confirming"; team: number }
  | { at: "error"; message: string };

export function PickGrid({
  poolKey,
  pool,
  member,
  onPicked,
}: {
  poolKey: PublicKey;
  pool: PoolView;
  member: MemberView;
  onPicked: () => void | Promise<void>;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [status, setStatus] = useState<Status>({ at: "idle" });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const lock = useMemo(() => {
    const secs = pool.lockTs[pool.currentWeek - 1];
    return secs ? new Date(secs * 1000) : null;
  }, [pool.lockTs, pool.currentWeek]);

  const locked = !!lock && now >= lock;
  const alive = isAlive(member);

  /* `current_pick` is only this week's pick if `pick_week` says so — the field
   * is not cleared between weeks until the member is settled, so reading it
   * without the week would show last week's team as if it still counted. */
  const thisWeeksPick =
    member.pickWeek === pool.currentWeek ? member.currentPick : NO_PICK;

  const remaining = TEAMS.filter((t) => !hasUsed(member.usedMask, t.i)).length;
  const busy = status.at === "signing" || status.at === "confirming";

  const pick = useCallback(
    async (team: number) => {
      if (!publicKey || !signTransaction || busy || locked || !alive) return;
      if (hasUsed(member.usedMask, team)) return;

      setStatus({ at: "signing", team });
      try {
        const instruction = buildSubmitPick({
          pool: poolKey,
          wallet: publicKey,
          team,
        });

        const latest = await connection.getLatestBlockhash();
        const tx = new Transaction({
          feePayer: publicKey,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        }).add(instruction);

        const signed = await signTransaction(tx);
        const signature = await connection.sendRawTransaction(
          signed.serialize(),
          { preflightCommitment: "confirmed" },
        );
        setStatus({ at: "confirming", team });

        const result = await connection.confirmTransaction(
          { signature, ...latest },
          "confirmed",
        );
        if (result.value.err) {
          throw new Error(
            `Transaction failed: ${JSON.stringify(result.value.err)}`,
          );
        }

        setStatus({ at: "idle" });
        await onPicked();
      } catch (err) {
        setStatus({ at: "error", message: readableProgramError(err) });
      }
    },
    [
      publicKey,
      signTransaction,
      busy,
      locked,
      alive,
      member.usedMask,
      poolKey,
      connection,
      onPicked,
    ],
  );

  if (!alive) {
    return (
      <div className="mt-8 rounded-xl border border-out/40 bg-out/10 p-6">
        <h2 className="display text-2xl uppercase">
          Out in week {member.eliminatedWeek}
        </h2>
        <p className="mt-2 text-sm text-cream-dim">
          Your season is over. If the pool is abandoned before it settles you can
          still reclaim your dues after the refund deadline.
        </p>
      </div>
    );
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-2xl uppercase">Week {pool.currentWeek}</h2>
        <p className="text-sm">
          {locked ? (
            <span className="font-bold text-out">LOCKED</span>
          ) : lock ? (
            <>
              <span className="text-cream-dim">Locks in </span>
              <span className="font-bold text-action">
                {countdown(lock, now)}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <p className="mt-1 text-sm text-cream-dim">
        {thisWeeksPick === NO_PICK ? (
          locked ? (
            "You missed this week. A missed pick is an elimination."
          ) : (
            "No pick yet. A missed pick is an elimination."
          )
        ) : (
          <>
            Picked{" "}
            <span className="font-bold text-cream">
              {TEAMS[thisWeeksPick].city} {TEAMS[thisWeeksPick].name}
            </span>
            {locked ? "" : " — tap another to change it."}
          </>
        )}{" "}
        · {remaining} of 32 teams left for the season.
      </p>

      {status.at === "error" ? (
        <p className="mt-4 rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
          {status.message}
        </p>
      ) : null}

      <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {TEAMS.map((t) => {
          const spent = hasUsed(member.usedMask, t.i);
          const picked = thisWeeksPick === t.i;
          return (
            <li key={t.abbr}>
              <TeamButton
                team={t}
                state={picked ? "picked" : spent ? "spent" : "available"}
                disabled={locked || busy}
                pending={
                  (status.at === "signing" || status.at === "confirming") &&
                  status.team === t.i
                }
                onClick={pick}
              />
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-cream-dim">
        A team you pick is spent for the season whether it wins or loses. A
        cancelled game is not a loss — you survive, and the team is still gone.
      </p>
    </section>
  );
}
