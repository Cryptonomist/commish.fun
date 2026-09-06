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

import { TEAMS, teamByAbbr } from "@/lib/nfl";
import { byeMask, gamesFor, isOnBye } from "@/lib/season";
import { TeamButton } from "@/components/TeamButton";
import { countdown } from "@/lib/format";
import {
  buildSubmitPick,
  hasUsed,
  isAlive,
  maskCount,
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

  /* The team a change moved away from, so it can be moved back.
   *
   * Tapping a team submits it immediately — no Save button, because a pick is
   * changeable until the lock and staging one behind a second click would be
   * ceremony. The cost of that is a mis-tap being a real transaction, and
   * somebody exploring the grid to see what each team looks like has already
   * changed their pick by the time they find out.
   *
   * Nothing is lost when they do: `used_mask` is not touched by `submit_pick`
   * at all — a team is spent in `settle_member`, once the week is over — so
   * the team they moved off is still there, and going back is just another
   * pick. This only has to remember which one it was. */
  const [changedFrom, setChangedFrom] = useState<number | null>(null);

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
  const byes = maskCount(byeMask(pool.currentWeek));
  const busy = status.at === "signing" || status.at === "confirming";

  /* THE WEEK IS A SLATE, NOT AN ALPHABET.
   *
   * Nobody deciding a Survivor pick thinks "Arizona, Atlanta, Baltimore". They
   * think "is Seattle beating Arizona", and then whether that is worth burning
   * Seattle in week one. Thirty-two cells in alphabetical order make the reader
   * reassemble the matchups in their head from a schedule they do not have in
   * front of them, which is the same complaint that turned the results form
   * from an alphabet into a list of games.
   *
   * Ordered by kickoff, so it reads the way a slate reads: Thursday night at
   * the top, Monday at the bottom. Teams on a bye simply are not here, which
   * is more honest than a greyed cell and needs no explaining — the count is in
   * the line above. */
  const matchups = useMemo(
    () =>
      gamesFor(pool.currentWeek)
        .map((g) => {
          const away = teamByAbbr(g.away);
          const home = teamByAbbr(g.home);
          return away && home ? { key: `${g.away}@${g.home}`, away, home, kickoff: g.kickoff } : null;
        })
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .sort((a, b) => a.kickoff - b.kickoff),
    [pool.currentWeek],
  );

  const stateOf = (i: number) =>
    thisWeeksPick === i
      ? "picked"
      : hasUsed(member.usedMask, i)
        ? "spent"
        : isOnBye(pool.currentWeek, i)
          ? "bye"
          : "available";

  const spent = TEAMS.filter((t) => hasUsed(member.usedMask, t.i));

  const kickoffLabel = (secs: number) =>
    new Date(secs * 1000).toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });

  // A new week is a new decision; last week's change is not undoable.
  useEffect(() => setChangedFrom(null), [pool.currentWeek]);

  const pick = useCallback(
    async (team: number) => {
      if (!publicKey || !signTransaction || busy || locked || !alive) return;
      if (hasUsed(member.usedMask, team)) return;
      // The button is already disabled; refusing here too means a stray call
      // cannot spend somebody's season on a team that is not playing.
      if (isOnBye(pool.currentWeek, team)) return;

      /* Read before the write. Whatever is on chain now is what an undo goes
       * back to, and after `onPicked` refreshes there is no way to recover it. */
      const previous =
        member.pickWeek === pool.currentWeek ? member.currentPick : NO_PICK;
      if (previous === team) return; // already picked; nothing to sign

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
        /* Offer the way back only when there was somewhere to come back from.
         * Undoing clears it rather than pointing at the team just left, which
         * would be a redo button wearing an undo label. */
        setChangedFrom(previous === NO_PICK ? null : previous === changedFrom ? null : previous);
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
      member.pickWeek,
      member.currentPick,
      changedFrom,
      pool.currentWeek,
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
            {locked ? "" : ", or tap another to change it."}
          </>
        )}{" "}
        · {remaining} of 32 teams left for the season
        {byes > 0 ? `, and ${byes} on a bye this week` : ""}.
      </p>

      {/* Only while it can still be acted on. After the lock this would be an
          offer the chain will refuse. */}
      {changedFrom !== null && !locked && thisWeeksPick !== changedFrom ? (
        <p className="mt-2 text-sm text-cream-dim">
          Changed from{" "}
          <span className="font-bold text-cream">
            {TEAMS[changedFrom].city} {TEAMS[changedFrom].name}
          </span>
          .{" "}
          <button
            type="button"
            onClick={() => pick(changedFrom)}
            disabled={busy}
            className="font-bold text-action underline underline-offset-2 hover:text-action-hi disabled:opacity-50"
          >
            Put it back
          </button>{" "}
          <span className="text-cream-dim">
            (nothing is spent until the week is settled, so switching costs
            only the signature)
          </span>
        </p>
      ) : null}

      {status.at === "error" ? (
        <p className="mt-4 rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
          {status.message}
        </p>
      ) : null}

      {matchups.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-2">
          {matchups.map((m) => (
            <li
              key={m.key}
              className="rounded-xl border border-night-3 bg-night-2/30 p-2"
            >
              <p className="px-1 pb-1.5 text-[11px] uppercase tracking-wide text-cream-dim">
                {kickoffLabel(m.kickoff)}
              </p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <TeamButton
                  team={m.away}
                  state={stateOf(m.away.i)}
                  disabled={locked || busy}
                  pending={busy && status.team === m.away.i}
                  onClick={pick}
                />
                <span
                  aria-hidden="true"
                  className="px-1 text-xs font-bold text-cream-dim"
                >
                  @
                </span>
                <TeamButton
                  team={m.home}
                  state={stateOf(m.home.i)}
                  disabled={locked || busy}
                  pending={busy && status.team === m.home.i}
                  onClick={pick}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        /* No schedule for this week — a pool running a compressed season, or a
         * data gap. The alphabet is a worse way to pick, but it is a far better
         * one than an empty screen. */
        <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {TEAMS.map((t) => (
            <li key={t.abbr}>
              <TeamButton
                team={t}
                state={stateOf(t.i)}
                disabled={locked || busy}
                pending={busy && status.team === t.i}
                onClick={pick}
              />
            </li>
          ))}
        </ul>
      )}

      {/* The alphabet earned its place for exactly one job: showing the whole
          season's spending at a glance. A slate cannot do that — it only knows
          this week — so the spending gets its own line rather than being lost
          with the grid that used to carry it. */}
      {spent.length > 0 ? (
        <p className="mt-4 text-xs text-cream-dim">
          <span className="uppercase tracking-wide">Spent this season</span>{" "}
          <span className="text-cream-dim/70 line-through">
            {spent.map((t) => t.abbr).join(" · ")}
          </span>
        </p>
      ) : null}

      <p className="mt-2 text-xs text-cream-dim">
        A team you pick is spent for the season whether it wins or loses. A
        cancelled game is not a loss. You survive, and the team is still gone.
        {byes > 0 ? " Teams on a bye are not listed; they play again next week." : ""}
      </p>
    </section>
  );
}
