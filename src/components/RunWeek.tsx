"use client";

/* Running the week: finalize, settle everybody, advance.
 *
 * ANYONE MAY FIRE THIS, and that is a feature rather than an oversight. None of
 * the three instructions takes a signer; the transaction needs a fee payer and
 * nothing else. A crank that required the commissioner would let a
 * commissioner who lost interest freeze the pot after the buy-ins were
 * collected, which is the exact failure the escrow exists to remove. The screen
 * says so, because a button that looks like an administrator's button will only
 * ever be pressed by an administrator.
 *
 * IT IS ONE BUTTON BECAUSE IT IS ONE IDEA. Three instructions and, for a large
 * pool, several transactions, but "run the week" is the unit a person actually
 * wants. Every step is idempotent or refused-if-repeated, so a run that dies
 * halfway is resumed by pressing the same button again: the next read shows
 * where it stopped and only the remaining work is sent.
 *
 * The pool is re-read between steps rather than trusted from props, because by
 * the time settling starts the props are a snapshot from before finalization.
 */

import { useCallback, useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { shortAddress } from "@/lib/format";
import {
  ataFor,
  buildAdvanceWeek,
  buildFinalizeWeek,
  buildSettleMember,
  decodeMember,
  decodePool,
  memberAccountFilters,
  pendingSettles,
  readableProgramError,
  PROGRAM_ID,
  SETTLES_PER_TX,
  STATUS_FINALIZED,
  STATUS_RESULTS_POSTED,
  type MemberEntry,
  type PoolView,
} from "@/lib/program";

type Step =
  | { at: "idle" }
  | { at: "working"; note: string }
  | { at: "error"; message: string };

export function RunWeek({
  poolKey,
  pool,
  onChanged,
}: {
  poolKey: PublicKey;
  pool: PoolView;
  onChanged: () => void | Promise<void>;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const [step, setStep] = useState<Step>({ at: "idle" });
  const [remaining, setRemaining] = useState<number | null>(null);

  const readPool = useCallback(async (): Promise<PoolView> => {
    const info = await connection.getAccountInfo(poolKey, "confirmed");
    if (!info) throw new Error("The pool account has gone.");
    return decodePool(info.data);
  }, [connection, poolKey]);

  const readMembers = useCallback(async (): Promise<MemberEntry[]> => {
    const found = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: "confirmed",
      filters: memberAccountFilters(poolKey),
    });
    return found.map((f) => ({
      address: f.pubkey,
      member: decodeMember(f.account.data),
    }));
  }, [connection, poolKey]);

  /* How many settles are actually left. `processedThisWeek` on the pool is the
   * honest headline number, but it counts up rather than down and says nothing
   * about which accounts are outstanding, so the member list is what the button
   * is built from. */
  useEffect(() => {
    let cancelled = false;
    if (pool.status !== STATUS_FINALIZED) {
      setRemaining(null);
      return;
    }
    void readMembers()
      .then((entries) => {
        if (!cancelled) {
          setRemaining(pendingSettles(entries, pool.finalizedWeek).length);
        }
      })
      .catch(() => {
        if (!cancelled) setRemaining(null);
      });
    return () => {
      cancelled = true;
    };
  }, [readMembers, pool.status, pool.finalizedWeek, pool.processedThisWeek]);

  const send = useCallback(
    async (txs: Transaction[]) => {
      if (!publicKey || !signTransaction) {
        throw new Error("This wallet cannot sign transactions.");
      }
      const latest = await connection.getLatestBlockhash();
      for (const tx of txs) {
        tx.feePayer = publicKey;
        tx.recentBlockhash = latest.blockhash;
        tx.lastValidBlockHeight = latest.lastValidBlockHeight;
      }

      /* One approval for the whole crank where the wallet supports it. A
       * hundred-member pool is nine transactions, and nine separate popups is
       * how a crank stops being run. */
      const signed = signAllTransactions
        ? await signAllTransactions(txs)
        : await (async () => {
            const out = [];
            for (const tx of txs) out.push(await signTransaction(tx));
            return out;
          })();

      for (const tx of signed) {
        const signature = await connection.sendRawTransaction(tx.serialize(), {
          preflightCommitment: "confirmed",
        });
        const result = await connection.confirmTransaction(
          { signature, ...latest },
          "confirmed",
        );
        if (result.value.err) {
          throw new Error(
            `Transaction failed: ${JSON.stringify(result.value.err)}`,
          );
        }
      }
    },
    [connection, publicKey, signTransaction, signAllTransactions],
  );

  const run = useCallback(async () => {
    if (!publicKey) return;
    try {
      let p = await readPool();

      /* Checked before anything is signed. The treasury token account is named
       * by `advance_week` on every call, fee or no fee, and Anchor deserializes
       * it before running a single one of the program's own checks. Discovering
       * it is missing after settling ninety members would be a bad way to find
       * out, and the error it throws says nothing about treasuries. */
      const treasuryAta = ataFor(p.feeTreasury, p.usdcMint);
      if (!(await connection.getAccountInfo(treasuryAta, "confirmed"))) {
        throw new Error(
          `The fee treasury has no USDC account, so the week cannot be closed. ` +
            `advance_week names it whether or not a fee is charged. Create the ` +
            `associated token account for ${shortAddress(p.feeTreasury.toBase58(), 6)} ` +
            `and run this again.`,
        );
      }

      if (p.status === STATUS_RESULTS_POSTED) {
        setStep({ at: "working", note: `Committing week ${p.pendingWeek}…` });
        await send([new Transaction().add(buildFinalizeWeek(poolKey))]);
        p = await readPool();
      }

      if (p.status !== STATUS_FINALIZED) {
        throw new Error("There is no finalized week to run.");
      }

      const week = p.finalizedWeek;
      const pending = pendingSettles(await readMembers(), week);

      if (pending.length > 0) {
        const batches: MemberEntry[][] = [];
        for (let i = 0; i < pending.length; i += SETTLES_PER_TX) {
          batches.push(pending.slice(i, i + SETTLES_PER_TX));
        }
        setStep({
          at: "working",
          note:
            `Settling ${pending.length} member${pending.length === 1 ? "" : "s"}` +
            `${batches.length > 1 ? ` across ${batches.length} transactions` : ""}…`,
        });
        await send(
          batches.map((batch) => {
            const tx = new Transaction();
            for (const e of batch) tx.add(buildSettleMember(poolKey, e.address));
            return tx;
          }),
        );
        p = await readPool();
      }

      setStep({ at: "working", note: `Closing week ${week}…` });
      await send([
        new Transaction().add(
          buildAdvanceWeek({
            pool: poolKey,
            vault: p.vault,
            feeTreasuryAta: treasuryAta,
          }),
        ),
      ]);

      setStep({ at: "idle" });
      await onChanged();
    } catch (err) {
      setStep({ at: "error", message: readableProgramError(err) });
      // The run is resumable, so refresh even on failure: the panel should show
      // how far it actually got rather than the state it started from.
      await onChanged();
    }
  }, [publicKey, readPool, readMembers, send, connection, poolKey, onChanged]);

  const finalizing = pool.status === STATUS_RESULTS_POSTED;
  const busy = step.at === "working";
  const done = pool.processedThisWeek;
  const total = pool.aliveAtWeekStart;

  return (
    <section className="mt-8 rounded-xl border border-night-3 bg-night-2/60 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-2xl uppercase">
          Run week {finalizing ? pool.pendingWeek : pool.finalizedWeek}
        </h2>
        {!finalizing && total > 0 ? (
          <p className="text-sm">
            <span className="text-cream-dim">Settled </span>
            <span className="font-bold text-cream">
              {done} of {total}
            </span>
          </p>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-cream-dim">
        {finalizing
          ? "The dispute window has closed. Committing the week applies the posted results to every member, then either opens the next week or decides the pool."
          : remaining === 0
            ? "Every member is settled. Closing the week either opens the next one or decides the pool."
            : "Applying the committed week to each member, then closing it."}
      </p>

      {step.at === "error" ? (
        <p className="mt-4 rounded-xl border border-out/40 bg-out/10 p-4 text-sm text-cream">
          {step.message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={run}
        disabled={!publicKey || busy}
        className="mt-4 h-14 w-full rounded-xl bg-action text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
      >
        {!publicKey
          ? "Connect a wallet to run the week"
          : busy
            ? step.note
            : finalizing
              ? `Run week ${pool.pendingWeek}`
              : remaining && remaining > 0
                ? `Settle ${remaining} and close week ${pool.finalizedWeek}`
                : `Close week ${pool.finalizedWeek}`}
      </button>

      <p className="mt-3 text-xs text-cream-dim">
        Anyone can run this. None of these instructions takes a signer, so a
        commissioner who walks away cannot strand the pot. You pay only the
        network fee.
      </p>
    </section>
  );
}
