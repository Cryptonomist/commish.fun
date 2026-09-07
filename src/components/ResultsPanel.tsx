"use client";

/* The results phase of a week: posted, disputed, committed.
 *
 * THE DISPUTE WINDOW IS THE WHOLE TRUST STORY, and until it is on screen the
 * story is only true, not visible. The README's claim is that a commissioner
 * cannot quietly post fake results because "a dispute window lets members veto
 * results anyone can verify on any scoreboard". That sentence is worth nothing
 * unless the posting is legible, the clock is running where people can see it,
 * and the button is one tap away. So this panel shows what was claimed, how
 * long is left to argue, how many votes it would take, and what the posting
 * does to the member reading it.
 *
 * THE PANEL IS DRIVEN BY `pool.status`, NOT BY THE WEEK. A pick pool sits at
 * OPEN until its first posting and returns to LOCKED between weeks, so gating
 * on LOCKED alone would hide the form for the whole of week one.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { TEAMS } from "@/lib/nfl";
import { countdown } from "@/lib/format";
import { MIN_POST_DELAY_SECS } from "@/lib/schedule";
import { ClaimPot } from "@/components/ClaimPot";
import { ResultsForm } from "@/components/ResultsForm";
import { RunWeek } from "@/components/RunWeek";
import {
  buildVetoResults,
  hasVetoedPosting,
  isAlive,
  maskToTeams,
  readableProgramError,
  survivesPosting,
  vetoThreshold,
  NO_PICK,
  STATUS_ABANDONED,
  STATUS_FINALIZED,
  STATUS_RESULTS_POSTED,
  STATUS_SETTLED,
  TEAM_COUNT,
  type MemberView,
  type PoolView,
} from "@/lib/program";

type Status =
  | { at: "idle" }
  | { at: "signing" }
  | { at: "confirming" }
  | { at: "error"; message: string };

export function ResultsPanel({
  poolKey,
  pool,
  member,
  onChanged,
}: {
  poolKey: PublicKey;
  pool: PoolView;
  member: MemberView | null;
  onChanged: () => void | Promise<void>;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [status, setStatus] = useState<Status>({ at: "idle" });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isCommissioner =
    !!publicKey && publicKey.equals(pool.commissioner);

  const veto = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    setStatus({ at: "signing" });
    try {
      const instruction = buildVetoResults({ pool: poolKey, wallet: publicKey });

      const latest = await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }).add(instruction);

      /* Signed by the wallet, broadcast by the app. See the note in
       * ResultsForm: `sendTransaction` submits through the wallet's own RPC. */
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
      await onChanged();
    } catch (err) {
      setStatus({ at: "error", message: readableProgramError(err) });
    }
  }, [publicKey, signTransaction, poolKey, connection, onChanged]);

  const closesAt = useMemo(
    () =>
      pool.pendingPostedTs
        ? new Date((pool.pendingPostedTs + pool.disputeWindowSecs) * 1000)
        : null,
    [pool.pendingPostedTs, pool.disputeWindowSecs],
  );

  /* An abandoned pool has no week left to run. The refund panel above it says
   * everything there is to say, and `post_results` refuses only a SETTLED pool
   * — so without this the commissioner of a dead pool would still be shown a
   * form for posting week nine of a season that stopped happening. */
  if (pool.status === STATUS_ABANDONED) return null;

  // ── A week is posted and the clock is running ──────────────────────────────
  if (pool.status === STATUS_RESULTS_POSTED) {
    const week = pool.pendingWeek;
    const winners = maskToTeams(pool.pendingWinners);
    const pushes = maskToTeams(pool.pendingPushes);
    const closed = !!closesAt && now >= closesAt;

    const needed = vetoThreshold(pool.aliveCount);
    const busy = status.at === "signing" || status.at === "confirming";

    /* One vote per member per POSTING. Keyed on the epoch, never the week: a
     * commissioner who gets struck down posts again, and that re-post is a
     * fresh vote for everybody. Comparing the week here would lock out every
     * member who voted the first time, which is the bug the program fixed. */
    const alreadyVoted = member ? hasVetoedPosting(member, pool) : false;
    const eligible = !!member && isAlive(member) && !alreadyVoted;

    /* `current_pick` is only this week's pick if `pick_week` agrees. The field
     * is not cleared between weeks until the member is settled. */
    const myPick =
      member && member.pickWeek === week ? member.currentPick : NO_PICK;
    const fate =
      member && isAlive(member)
        ? survivesPosting(pool.poolType, {
            madeAPick: myPick !== NO_PICK,
            team: myPick,
            winners: pool.pendingWinners,
            pushes: pool.pendingPushes,
          })
        : null;

    return (
      <>
        <section className="mt-8 rounded-xl border border-action/40 bg-night-2/60 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="display text-2xl uppercase">Week {week} posted</h2>
            <p className="text-sm">
              {closed ? (
                <span className="font-bold text-cream-dim">WINDOW CLOSED</span>
              ) : closesAt ? (
                <>
                  <span className="text-cream-dim">Dispute closes in </span>
                  <span className="font-bold text-action">
                    {countdown(closesAt, now)}
                  </span>
                </>
              ) : null}
            </p>
          </div>

          <p className="mt-2 text-sm text-cream-dim">
            The commissioner claims the following. Check it against any scoreboard.
            Nothing is committed and nobody is out until the week is finalized.
          </p>

          <TeamRow label="WON" teams={winners} tone="alive" />
          <TeamRow label="PUSH" teams={pushes} tone="cream" />
          <p className="mt-3 text-xs text-cream-dim">
            The other {TEAM_COUNT - winners.length - pushes.length} teams are
            losses. Anyone who picked one of them, or who missed the week, is out.
          </p>

          {fate !== null ? (
            <p
              className={`mt-4 rounded-xl border p-4 text-sm ${
                fate
                  ? "border-alive/40 bg-alive/10 text-cream"
                  : "border-out/40 bg-out/10 text-cream"
              }`}
            >
              {myPick === NO_PICK ? (
                <>You did not pick week {week}. As posted, you are out.</>
              ) : fate ? (
                <>
                  You picked{" "}
                  <span className="font-bold">
                    {TEAMS[myPick].city} {TEAMS[myPick].name}
                  </span>
                  . As posted, you survive.
                </>
              ) : (
                <>
                  You picked{" "}
                  <span className="font-bold">
                    {TEAMS[myPick].city} {TEAMS[myPick].name}
                  </span>
                  . As posted, you are out.
                </>
              )}
            </p>
          ) : null}

          <p id="veto-tally" className="mt-5 text-sm text-cream-dim">
            <span className="font-bold text-cream">
              {pool.vetoCount} of {needed}
            </span>{" "}
            votes needed to strike this down, from the {pool.aliveCount} members
            still alive. If it is struck down the commissioner posts again and
            everyone votes again.
          </p>

          {status.at === "error" ? (
            <p className="mt-4 rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
              {status.message}
            </p>
          ) : null}

          {closed ? (
            <p className="mt-4 rounded-xl border border-night-3 bg-night-2 p-4 text-sm text-cream-dim">
              The window has closed, so this posting stands. A vote is still
              accepted until the week is committed: the program checks that a
              posting is pending and never looks at the clock. Late is a race
              against whoever runs the week below, not a right.
            </p>
          ) : null}

          {member ? (
            <button
              type="button"
              onClick={veto}
              disabled={!eligible || busy}
              aria-describedby="veto-tally"
              className="mt-4 h-14 w-full rounded-xl border border-out/50 text-sm font-bold tracking-wide text-out transition-colors hover:bg-out/10 disabled:cursor-not-allowed disabled:border-night-3 disabled:text-cream-dim disabled:hover:bg-transparent"
            >
              {status.at === "signing"
                ? "Confirm in your wallet…"
                : status.at === "confirming"
                  ? "Waiting for the network…"
                  : alreadyVoted
                    ? "You have vetoed this posting"
                    : !isAlive(member)
                      ? "Only members still alive can vote"
                      : `Veto week ${week}`}
            </button>
          ) : (
            <p className="mt-4 text-sm text-cream-dim">
              Only members of this pool can vote on a posting.
            </p>
          )}
        </section>

        {/* The vote and the crank are both live in this window, deliberately:
            the posting can still be struck down right up until somebody commits
            it, and either of those is the next thing that happens. */}
        {closed ? (
          <RunWeek poolKey={poolKey} pool={pool} onChanged={onChanged} />
        ) : null}
      </>
    );
  }

  /* The pool is decided: the outcome and, for a winner, the money. */
  if (pool.status === STATUS_SETTLED) {
    return (
      <ClaimPot
        poolKey={poolKey}
        pool={pool}
        member={member}
        onChanged={onChanged}
      />
    );
  }

  // The week is committed and every member has to have it applied to them.
  if (pool.status === STATUS_FINALIZED) {
    return <RunWeek poolKey={poolKey} pool={pool} onChanged={onChanged} />;
  }

  // ── Nothing pending: the commissioner's form, or a note that they are late ──
  const lockSecs = pool.lockTs[pool.currentWeek - 1];
  const postingOpen =
    !!lockSecs && now.getTime() / 1000 >= lockSecs + MIN_POST_DELAY_SECS;
  const locked = !!lockSecs && now.getTime() / 1000 >= lockSecs;

  if (isCommissioner && locked) {
    return <ResultsForm poolKey={poolKey} pool={pool} onPosted={onChanged} />;
  }

  /* Members are told only once the commissioner is actually late. Before that
   * this is a countdown they already have on the pick grid. */
  if (postingOpen) {
    return (
      <section className="mt-8 rounded-xl border border-night-3 bg-night-2/60 p-5">
        <h2 className="display text-2xl uppercase">
          Week {pool.currentWeek} is not posted
        </h2>
        <p className="mt-2 text-sm text-cream-dim">
          The games are over and the commissioner has not posted results yet.
          Nothing settles and no money moves until they do.
        </p>
      </section>
    );
  }

  return null;
}

function TeamRow({
  label,
  teams,
  tone,
}: {
  label: string;
  teams: number[];
  tone: "alive" | "cream";
}) {
  return (
    <div className="mt-4">
      <p className="font-matrix text-[10px] leading-4 text-cream-dim">
        {label}
      </p>
      {teams.length === 0 ? (
        <p className="mt-1 text-sm text-cream-dim">None.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {teams.map((i) => (
            <li
              key={i}
              className={`rounded-lg border px-2.5 py-1 text-xs font-bold tracking-wide ${
                tone === "alive"
                  ? "border-alive/50 bg-alive/10 text-alive"
                  : "border-night-3 bg-night-2 text-cream"
              }`}
            >
              {TEAMS[i].abbr}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
