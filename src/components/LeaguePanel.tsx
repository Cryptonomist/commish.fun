"use client";

/* A league, which plays nothing.
 *
 * The other half of this program. A pick pool runs eighteen weeks of picks and
 * eliminations; a league collects dues, waits for a deadline, and then the
 * commissioner says who won. That decision happens somewhere else entirely —
 * on ESPN, on Sleeper, in a group chat, on a field — and Commish only holds the
 * money and records the answer. It is the tagline made literal: your league
 * dues, out of that one guy's Venmo.
 *
 * WHICH MEANS THE ESCROW IS THE ENTIRE PRODUCT HERE. There is no pick grid to
 * enjoy and no weekly drama to watch. What a member gets for using this is that
 * the pot sits in an account the commissioner cannot touch, that the payout is
 * published before it happens, and that a majority can throw it out. So this
 * panel puts those three things on screen and very little else.
 *
 * DRIVEN BY `pool.status`, like ResultsPanel. A league walks
 * Open → Locked → SheetPosted → SheetFinalized, sharing the status field with
 * pick pools and using two values of its own. `veto_results` accepts either
 * kind of posting, which is why the veto button here is the same instruction
 * the results panel uses.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { SleeperFill } from "@/components/SleeperFill";
import { countdown, formatUsdc, shortAddress } from "@/lib/format";
import {
  buildClaimPrize,
  buildFinalizeSheet,
  buildLockDues,
  buildPostPayoutSheet,
  buildVetoResults,
  decodeMember,
  hasVetoedPosting,
  memberAccountFilters,
  readableProgramError,
  slotAmount,
  vetoThreshold,
  PROGRAM_ID,
  SLOT_CLAIMED,
  SLOT_FINALIZED,
  SLOT_PENDING,
  STATUS_LOCKED,
  STATUS_OPEN,
  STATUS_SHEET_FINALIZED,
  STATUS_SHEET_POSTED,
  type MemberView,
  type PoolView,
  type PrizeSlotView,
} from "@/lib/program";

type Status =
  | { at: "idle" }
  | { at: "signing" }
  | { at: "confirming" }
  | { at: "error"; message: string };

type Roster = { address: PublicKey; wallet: PublicKey; name: string }[];

export function LeaguePanel({
  poolKey,
  pool,
  member,
  vaultAmount,
  onChanged,
}: {
  poolKey: PublicKey;
  pool: PoolView;
  member: MemberView | null;
  vaultAmount: bigint | null;
  onChanged: () => void | Promise<void>;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [status, setStatus] = useState<Status>({ at: "idle" });
  const [now, setNow] = useState(() => new Date());
  const [roster, setRoster] = useState<Roster>([]);
  /* slot index -> wallet base58. The commissioner's working copy, not the
   * chain's: nothing is committed until the sheet is posted. */
  const [draft, setDraft] = useState<Record<number, string>>({});

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isCommissioner = !!publicKey && publicKey.equals(pool.commissioner);
  const busy = status.at === "signing" || status.at === "confirming";
  const nowSecs = Math.floor(now.getTime() / 1000);

  /* Every paid member, by name, so the commissioner assigns people rather than
   * addresses. The program will not take a name for an answer — it re-derives
   * each Member PDA and checks it — but a human should never be asked to
   * recognise a payee from a base58 string. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await connection.getProgramAccounts(PROGRAM_ID, {
          filters: memberAccountFilters(poolKey),
        });
        if (cancelled) return;
        setRoster(
          found
            .map((g) => {
              const m = decodeMember(g.account.data);
              return { address: g.pubkey, wallet: m.wallet, name: m.displayName };
            })
            .filter((r) => r.name.length > 0 || true)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      } catch {
        /* A roster we cannot read is a form the commissioner cannot fill in,
         * and the panel says so below rather than rendering empty dropdowns. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, poolKey, pool.paidMembers, pool.status]);

  const send = useCallback(
    async (ixs: TransactionInstruction[]) => {
      if (!publicKey || !signTransaction) return;
      setStatus({ at: "signing" });
      try {
        const latest = await connection.getLatestBlockhash();
        const tx = new Transaction({
          feePayer: publicKey,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        });
        for (const ix of ixs) tx.add(ix);

        const signed = await signTransaction(tx);
        const signature = await connection.sendRawTransaction(
          signed.serialize(),
          { preflightCommitment: "confirmed" },
        );
        setStatus({ at: "confirming" });

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
        await onChanged();
      } catch (err) {
        setStatus({ at: "error", message: readableProgramError(err) });
      }
    },
    [publicKey, signTransaction, connection, onChanged],
  );

  const sheetClosesAt = pool.pendingPostedTs + pool.disputeWindowSecs;
  const windowOpen = pool.status === STATUS_SHEET_POSTED && nowSecs < sheetClosesAt;
  const needed = vetoThreshold(pool.paidMembers);
  const alreadyVoted = member ? hasVetoedPosting(member, pool) : false;

  const nameFor = useMemo(() => {
    const by = new Map(roster.map((r) => [r.wallet.toBase58(), r.name]));
    return (w: PublicKey) => by.get(w.toBase58()) ?? shortAddress(w.toBase58(), 4);
  }, [roster]);

  /* NO DUPLICATE WINNERS — UNLESS THAT MAKES PAYING OUT IMPOSSIBLE.
   *
   * Requiring every slot to go to a different member is the right check for an
   * ordinary league: the same person in first and second is a mistake worth
   * catching before it is posted on chain and has to survive a dispute window.
   *
   * But the slot count is fixed at creation and the turnout is not, and this
   * check was unconditional, so a league with fewer payers than prize slots
   * could never post a sheet at all. The button read "Fill all 3 slots"
   * forever, with nothing to explain why filling them did not help. The
   * default split is 60/30/10, so any league that sets it up and then has two
   * people pay in walks into that — dues locked, pot settled, payout
   * unreachable, and the money waiting on the refund deadline a month later.
   *
   * The program never had this rule: post_payout_sheet checks each assignee is
   * a paid member and that the slot is unassigned, and is perfectly happy to
   * put one member in three slots. So the interface was the whole constraint.
   *
   * A partial sheet is not the way out either. finalize_sheet only finalizes
   * slots in SLOT_PENDING, so an unassigned slot never becomes claimable and
   * its share sits in the vault until reclaim_dues opens. Filling every slot,
   * repeating people when there are not enough of them, pays the pot out in
   * full today. */
  const assigned = Object.values(draft).filter(Boolean);
  const enoughForDistinct = roster.length >= pool.slotCount;
  const draftComplete =
    assigned.length === pool.slotCount &&
    (!enoughForDistinct || new Set(assigned).size === assigned.length);

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-base uppercase">The pot</h2>
        <p className="text-sm text-cream-dim">
          {pool.paidMembers} paid ·{" "}
          {vaultAmount === null ? "…" : formatUsdc(vaultAmount)} in the vault
        </p>
      </div>

      {/* The split is fixed at creation and cannot be edited afterwards. That is
          the point worth showing before anybody pays in: the shares were agreed
          before the season, not after somebody won. */}
      <ul className="flex flex-col gap-px overflow-hidden rounded-xl border border-night-3 bg-night-3">
        {pool.prizeSlots.map((slot) => (
          <SlotRow
            key={slot.index}
            slot={slot}
            vaultAmount={vaultAmount}
            nameFor={nameFor}
            you={publicKey}
          />
        ))}
      </ul>

      {status.at === "error" ? (
        <p className="rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
          {status.message}
        </p>
      ) : null}

      {/* ── Dues are still open ─────────────────────────────────────────── */}
      {pool.status === STATUS_OPEN ? (
        nowSecs < pool.duesDeadlineTs ? (
          <p className="rounded-xl border border-night-3 bg-night-2/60 p-4 text-sm text-cream-dim">
            Dues close in{" "}
            <span className="font-bold text-action">
              {countdown(new Date(pool.duesDeadlineTs * 1000), now)}
            </span>
            . Nobody can join after that, and the commissioner cannot post a
            payout until it passes.
          </p>
        ) : (
          <div className="rounded-xl border border-night-3 bg-night-2/60 p-4">
            <p className="text-sm text-cream-dim">
              Dues have closed. Locking the books is the next step, and{" "}
              <span className="text-cream">anyone can do it</span>. It takes no
              signature from the commissioner, so a league cannot be frozen by
              somebody who stopped replying.
            </p>
            <button
              type="button"
              onClick={() => send([buildLockDues(poolKey)])}
              disabled={busy || !publicKey}
              className="mt-3 h-12 w-full rounded-xl bg-action text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
            >
              {busy ? "Working…" : "Close the books"}
            </button>
          </div>
        )
      ) : null}

      {/* ── Locked: the commissioner writes the sheet ───────────────────── */}
      {pool.status === STATUS_LOCKED ? (
        isCommissioner ? (
          <div className="rounded-xl border border-night-3 bg-night-2/60 p-4">
            <h3 className="display text-xs uppercase">Who gets paid</h3>
            <p className="mt-1 text-sm text-cream-dim">
              Members get {Math.round(pool.disputeWindowSecs / 3600)} hours to
              throw this out once you post it. You can post it again if they do.
            </p>

            {/* The season was played somewhere else. Reading the final table
                from there beats retyping it, and the wrong name on a prize is
                the one mistake this product cannot shrug off. */}
            <SleeperFill
              members={roster.map((r) => ({
                wallet: r.wallet.toBase58(),
                name: r.name,
              }))}
              slotCount={pool.slotCount}
              onFill={(filled) => setDraft(filled)}
            />

            <div className="mt-4 flex flex-col gap-3">
              {pool.prizeSlots.map((slot) => (
                <label key={slot.index} className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold tracking-[0.14em] text-cream-dim">
                    {slot.label.toUpperCase()} ·{" "}
                    {(slot.bps / 100).toFixed(slot.bps % 100 === 0 ? 0 : 2)}%
                    {vaultAmount !== null ? (
                      <span className="text-gold">
                        {" "}
                        {formatUsdc(slotAmount(slot.bps, vaultAmount))}
                      </span>
                    ) : null}
                  </span>
                  <select
                    value={draft[slot.index] ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [slot.index]: e.target.value }))
                    }
                    className="rounded-xl border border-night-3 bg-night-2 px-4 py-3 text-cream outline-none focus:border-action"
                  >
                    <option value="">Nobody yet</option>
                    {/* THE ADDRESS IS ALWAYS SHOWN, not only when a name is
                        missing. Display names are typed by members and nothing
                        stops two of them being "Mike" — and picking the wrong
                        Mike is a real payment to a real stranger, undone only
                        by members noticing and vetoing inside the window. The
                        name is what a commissioner recognises; the address is
                        what makes two of them different. */}
                    {roster.map((r) => (
                      <option key={r.wallet.toBase58()} value={r.wallet.toBase58()}>
                        {r.name
                          ? `${r.name} · ${shortAddress(r.wallet.toBase58(), 4)}`
                          : shortAddress(r.wallet.toBase58(), 4)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {roster.length === 0 ? (
              <p className="mt-3 text-sm text-out">
                Could not read the member list, so there is nobody to assign.
                Reload before posting.
              </p>
            ) : null}

            {/* The same two states the completeness rule above turns on, said
              * out loud. Without the second line, a commissioner with fewer
              * payers than slots sees a rule quietly stop applying and has no
              * way to tell whether that is intended. */}
            {enoughForDistinct &&
            assigned.length > 0 &&
            new Set(assigned).size !== assigned.length ? (
              <p className="mt-3 text-sm text-out">
                Somebody is in two slots. Each prize goes to one person.
              </p>
            ) : !enoughForDistinct ? (
              <p className="mt-3 text-sm text-cream-dim">
                {pool.slotCount} prizes and {roster.length}{" "}
                {roster.length === 1 ? "person" : "people"} who paid, so the
                same member can take more than one. Every slot still has to be
                filled — a slot left empty is never claimable, and its share
                waits in the vault until the refund deadline.
              </p>
            ) : null}

            {/* WHAT YOU ARE ABOUT TO SIGN, IN FULL, BEFORE YOU SIGN IT.
              *
              * Up to here a commissioner has been choosing from dropdowns one
              * at a time, and never sees the whole sheet at once — which is
              * exactly when a slot picked two minutes ago goes unchecked. The
              * amounts are on the labels above, but scattered; the total is
              * nowhere.
              *
              * This is the thing that makes it hard to get wrong: every slot,
              * every recipient with the address that separates two people of
              * the same name, every amount, and a total that has to equal the
              * vault. Posting is not undoable on its own — it takes members
              * noticing and voting it down inside the window — so the review
              * belongs before the signature, not in the dispute that follows. */}
            {draftComplete && vaultAmount !== null ? (
              <div className="mt-4 rounded-xl border border-night-3 bg-night/60 p-3">
                <p className="text-xs font-bold tracking-[0.14em] text-cream-dim">
                  ABOUT TO POST
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {pool.prizeSlots.map((slot) => {
                    const who = roster.find(
                      (r) => r.wallet.toBase58() === draft[slot.index],
                    );
                    return (
                      <li
                        key={slot.index}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                      >
                        <span className="text-cream">
                          {slot.label}
                          {" · "}
                          <span className="text-cream-dim">
                            {who?.name ? `${who.name} ` : ""}
                            {shortAddress(draft[slot.index] ?? "", 4)}
                          </span>
                        </span>
                        <span className="font-bold text-gold tabular-nums">
                          {formatUsdc(slotAmount(slot.bps, vaultAmount))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 border-t border-night-3 pt-2 text-xs text-cream-dim">
                  {formatUsdc(vaultAmount)} in the vault, paid in full. Members
                  get {Math.round(pool.disputeWindowSecs / 3600)} hours to vote
                  this down; nothing moves until that passes.
                </p>
              </div>
            ) : null}

            <button
              type="button"
              disabled={busy || !draftComplete}
              onClick={() =>
                send([
                  buildPostPayoutSheet({
                    pool: poolKey,
                    commissioner: publicKey!,
                    assignments: pool.prizeSlots.map((s) => ({
                      slotIdx: s.index,
                      member: new PublicKey(draft[s.index]),
                    })),
                  }),
                ])
              }
              className="mt-4 h-12 w-full rounded-xl bg-action text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
            >
              {busy
                ? "Working…"
                : draftComplete
                  ? "Post the payout"
                  : `Fill all ${pool.slotCount} slots`}
            </button>
          </div>
        ) : (
          <p className="rounded-xl border border-night-3 bg-night-2/60 p-4 text-sm text-cream-dim">
            Dues are locked and the pot is settled at{" "}
            {vaultAmount === null ? "…" : formatUsdc(vaultAmount)}. Waiting for
            the commissioner to post who gets paid. You will get{" "}
            {Math.round(pool.disputeWindowSecs / 3600)} hours to throw it out.
          </p>
        )
      ) : null}

      {/* ── Posted: the dispute window ──────────────────────────────────── */}
      {pool.status === STATUS_SHEET_POSTED ? (
        <div className="rounded-xl border border-night-3 bg-night-2/60 p-4">
          <p className="text-sm text-cream-dim">
            {windowOpen ? (
              <>
                This payout can be thrown out for{" "}
                <span className="font-bold text-action">
                  {countdown(new Date(sheetClosesAt * 1000), now)}
                </span>
                .
              </>
            ) : (
              "The window has closed. Nobody struck it down."
            )}{" "}
            <span className="text-cream">
              {pool.vetoCount} of {needed}
            </span>{" "}
            {needed === 1 ? "vote" : "votes"} needed, from {pool.paidMembers}{" "}
            paid members.
          </p>

          {/* The program never checks the clock on a vote, only the count. So
              the button stays live after the window closes — right up until
              somebody finalizes — rather than lying about what is possible. */}
          {member && !alreadyVoted ? (
            <button
              type="button"
              onClick={() => send([buildVetoResults({ pool: poolKey, wallet: publicKey! })])}
              disabled={busy}
              className="mt-3 h-12 w-full rounded-xl border border-out/60 text-sm font-bold tracking-wide text-out transition-colors hover:bg-out/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Working…" : "Throw this payout out"}
            </button>
          ) : alreadyVoted ? (
            <p className="mt-3 text-sm text-cream-dim">
              You voted to throw this out. It needs {needed} to clear.
            </p>
          ) : null}

          {!windowOpen ? (
            <button
              type="button"
              onClick={() => send([buildFinalizeSheet(poolKey)])}
              disabled={busy || !publicKey}
              className="mt-3 h-12 w-full rounded-xl bg-action text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
            >
              {busy ? "Working…" : "Make it final"}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Final: take what you are owed ───────────────────────────────── */}
      {pool.status === STATUS_SHEET_FINALIZED && publicKey ? (
        <ClaimYourSlot
          pool={pool}
          poolKey={poolKey}
          wallet={publicKey}
          vaultAmount={vaultAmount}
          busy={busy}
          send={send}
        />
      ) : null}
    </section>
  );
}

/** One prize, and who it belongs to at the moment. */
function SlotRow({
  slot,
  vaultAmount,
  nameFor,
  you,
}: {
  slot: PrizeSlotView;
  vaultAmount: bigint | null;
  nameFor: (w: PublicKey) => string;
  you: PublicKey | null;
}) {
  const claimed = slot.state === SLOT_CLAIMED;
  const assignedToYou =
    !!you && slot.state !== 0 && slot.assignee.equals(you);

  return (
    <li className="flex items-center justify-between gap-3 bg-night-2 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-cream">{slot.label}</p>
        <p className="text-xs text-cream-dim">
          {(slot.bps / 100).toFixed(slot.bps % 100 === 0 ? 0 : 2)}% of the pot
          {slot.state === SLOT_PENDING ? " · proposed" : ""}
          {slot.state === SLOT_FINALIZED ? " · final" : ""}
          {claimed ? " · taken" : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-bold ${claimed ? "text-cream-dim" : "text-gold"}`}>
          {vaultAmount === null ? "…" : formatUsdc(slotAmount(slot.bps, vaultAmount))}
        </p>
        <p className="text-xs text-cream-dim">
          {slot.state === 0 ? (
            "unassigned"
          ) : assignedToYou ? (
            <span className="text-alive">you</span>
          ) : (
            nameFor(slot.assignee)
          )}
        </p>
      </div>
    </li>
  );
}

/* A member may hold more than one slot — first place and highest week, say —
 * so this offers every finalized slot that names them rather than assuming
 * one. Each is a separate instruction; the program refuses a second claim on
 * the same slot by its state, which is what makes the button safe to press
 * twice. */
function ClaimYourSlot({
  pool,
  poolKey,
  wallet,
  vaultAmount,
  busy,
  send,
}: {
  pool: PoolView;
  poolKey: PublicKey;
  wallet: PublicKey;
  vaultAmount: bigint | null;
  busy: boolean;
  send: (ixs: TransactionInstruction[]) => Promise<void>;
}) {
  const mine = pool.prizeSlots.filter(
    (s) => s.state === SLOT_FINALIZED && s.assignee.equals(wallet),
  );
  const taken = pool.prizeSlots.filter(
    (s) => s.state === SLOT_CLAIMED && s.assignee.equals(wallet),
  );

  if (mine.length === 0) {
    return (
      <p className="rounded-xl border border-night-3 bg-night-2/60 p-4 text-sm text-cream-dim">
        {taken.length > 0
          ? "You have taken everything this league owes you."
          : "The payout is final. Nothing on it is yours."}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-alive/40 bg-alive/5 p-4">
      <h3 className="display text-xs uppercase">Yours to take</h3>
      {mine.map((slot) => (
        <button
          key={slot.index}
          type="button"
          disabled={busy}
          onClick={() =>
            send([
              buildClaimPrize({
                pool: poolKey,
                wallet,
                vault: pool.vault,
                usdcMint: pool.usdcMint,
                slotIdx: slot.index,
              }).instruction,
            ])
          }
          className="mt-3 h-14 w-full rounded-xl bg-action text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
        >
          {busy
            ? "Working…"
            : `Claim ${slot.label}${
                vaultAmount === null
                  ? ""
                  : ` for ${formatUsdc(slotAmount(slot.bps, vaultAmount))}`
              }`}
        </button>
      ))}
      <p className="mt-3 text-xs text-cream-dim">
        Straight from the vault to your wallet. Nobody signs it but you.
      </p>
    </div>
  );
}
