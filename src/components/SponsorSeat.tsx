"use client";

/* SPONSOR A SEAT: the commissioner pays somebody else's buy-in.
 *
 * WHY THIS IS HERE. A pool's members are the commissioner's friends, on
 * phones, mostly without wallets, and every route into USDC costs them an
 * identity check, a minimum and a second currency for rent. That is where a
 * $25 pool loses people. `sponsor_join` skips all of it: one person who
 * already holds crypto buys the seat, and the seat belongs to the friend from
 * the moment it exists. They need a wallet address and nothing else.
 *
 * WHAT IT MUST SAY OUT LOUD, because the on-chain suite proved it and a
 * sponsor would otherwise assume the opposite: none of this comes back to the
 * sponsor. A sponsored winner is paid into their own wallet, the sponsor can
 * neither claim nor redirect it, and an abandoned pool refunds the seat's
 * owner. The sponsor fronts a fixed amount and never holds the pot, which is
 * the whole point — but it means they are repaid by their friend or not at
 * all, and the page says so before the popup rather than after.
 *
 * THE SOL IS THE PART PEOPLE MISS. The program lets a member with no SOL at
 * all hold a seat, but this site makes a member pay the fee on their own picks,
 * and a winner needs a token account to be paid into. So the panel reads the
 * friend's wallet and, when it is short, offers to send the season's worth in
 * the same transaction. Same instruction, same signature, atomic: if the seat
 * fails, no SOL moves.
 *
 * COMMISSIONER ONLY. The program's `has_one = commissioner` refuses anybody
 * else, so this panel does not render for them rather than offering a button
 * that can only fail.
 */

import { useCallback, useEffect, useState } from "react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { formatUsdc, shortAddress } from "@/lib/format";
import {
  LAMPORTS_PER_SOL,
  lamportsToJoin,
  solToPlay,
  topUpToPlay,
} from "@/lib/funding";
import {
  buildSponsorJoin,
  MAX_DISPLAY_NAME,
  memberPda,
  readableProgramError,
  type PoolView,
} from "@/lib/program";
import { sendAndConfirm } from "@/lib/send";

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
const enc = new TextEncoder();

/** The join form's own field style, so the two forms on this page match. */
const FIELD =
  "rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 text-cream outline-none placeholder:text-cream-dim/50 focus:border-action";

type Friend =
  | { at: "empty" }
  | { at: "invalid"; message: string }
  | { at: "reading" }
  | { at: "member" }
  | { at: "ready"; key: PublicKey; lamports: number };

type Status =
  | { at: "idle" }
  | { at: "signing" }
  | { at: "confirming" }
  | { at: "done"; name: string; signature: string }
  | { at: "error"; message: string };

const sol = (lamports: number) => (lamports / LAMPORTS_PER_SOL).toFixed(4);

export function SponsorSeat({
  poolKey,
  pool,
  onChanged,
  className = "",
}: {
  poolKey: PublicKey;
  pool: PoolView;
  onChanged: () => void | Promise<void>;
  className?: string;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [friend, setFriend] = useState<Friend>({ at: "empty" });
  const [sendSol, setSendSol] = useState(true);
  const [status, setStatus] = useState<Status>({ at: "idle" });

  const isCommissioner = !!publicKey && publicKey.equals(pool.commissioner);

  /* Read the friend's wallet as soon as the address parses. Two questions:
   * are they already in this pool, which would fail after the popup rather
   * than before it, and how much SOL do they hold, which decides whether a
   * top-up is offered at all. */
  const read = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return setFriend({ at: "empty" });

      let key: PublicKey;
      try {
        key = new PublicKey(text);
      } catch {
        return setFriend({
          at: "invalid",
          message: "That is not a Solana wallet address.",
        });
      }
      if (publicKey && key.equals(publicKey)) {
        return setFriend({
          at: "invalid",
          message: "That is your own wallet. Join the pool normally instead.",
        });
      }

      setFriend({ at: "reading" });
      try {
        const [seat, lamports] = await Promise.all([
          connection.getAccountInfo(memberPda(poolKey, key)),
          connection.getBalance(key),
        ]);
        if (seat) return setFriend({ at: "member" });
        setFriend({ at: "ready", key, lamports });
      } catch {
        /* A failed read must not block the sponsor. Treat the wallet as empty,
         * which only ever errs toward sending the SOL they might need. */
        setFriend({ at: "ready", key, lamports: 0 });
      }
    },
    [connection, poolKey, publicKey],
  );

  useEffect(() => {
    const t = setTimeout(() => void read(address), 250);
    return () => clearTimeout(t);
  }, [address, read]);

  if (!isCommissioner) return null;

  const spotsLeft = Math.max(0, pool.maxMembers - pool.memberCount);
  const topUp = friend.at === "ready" ? topUpToPlay(friend.lamports) : 0;
  const willSendSol = sendSol && topUp > 0;
  const nameBytes = enc.encode(name.trim()).length;
  const nameOk = nameBytes > 0 && nameBytes <= MAX_DISPLAY_NAME;
  const busy = status.at === "signing" || status.at === "confirming";
  const canSponsor =
    friend.at === "ready" && nameOk && !busy && spotsLeft > 0 && !!signTransaction;

  async function onSponsor(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKey || !signTransaction || friend.at !== "ready" || !canSponsor) return;

    const displayName = name.trim();
    setStatus({ at: "signing" });
    try {
      const { instruction } = buildSponsorJoin({
        pool: poolKey,
        wallet: friend.key,
        commissioner: publicKey,
        displayName,
      });

      const latest = await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }).add(instruction);

      /* After the seat, in the same transaction, so a refused seat moves no
       * SOL. The amount is the whole gap for a never-funded wallet, which is
       * what clears the rent floor a smaller first transfer would trip. */
      if (willSendSol) {
        tx.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: friend.key,
            lamports: topUp,
          }),
        );
      }

      const signed = await signTransaction(tx);
      const signature = await sendAndConfirm(connection, signed, latest, () =>
        setStatus({ at: "confirming" }),
      );

      setStatus({ at: "done", name: displayName, signature });
      setAddress("");
      setName("");
      setFriend({ at: "empty" });
      await onChanged();
    } catch (err) {
      setStatus({ at: "error", message: readableProgramError(err) });
    }
  }

  return (
    <section className={`panel flex flex-col gap-4 p-5 ${className}`}>
      <h2 className="font-matrix text-[11px] leading-4 text-chalk">
        SPONSOR A SEAT
      </h2>

      <p className="text-sm leading-relaxed text-cream-dim">
        Pay somebody&apos;s buy-in for them. They need a wallet address and
        nothing else: no USDC, no card, no ID check. Ask them to install Phantom
        and send you the address it shows. They do not need to buy anything.
      </p>

      {status.at === "done" ? (
        <p className="border-l-2 border-alive pl-3 text-sm leading-relaxed text-cream">
          <span className="font-bold">{status.name} is in.</span> The seat is
          theirs now.{" "}
          <a
            href={`https://explorer.solana.com/tx/${status.signature}?cluster=${CLUSTER}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {shortAddress(status.signature, 6)}
          </a>
        </p>
      ) : null}

      {spotsLeft === 0 ? (
        <p className="text-sm leading-relaxed text-cream-dim">
          The pool is full, so there is no seat left to sponsor.
        </p>
      ) : (
        <form onSubmit={onSponsor} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-matrix text-[10px] leading-4 text-cream-dim">
              THEIR WALLET ADDRESS
            </span>
            <input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                if (status.at !== "idle") setStatus({ at: "idle" });
              }}
              placeholder="Paste the address from their wallet"
              spellCheck={false}
              autoComplete="off"
              className={`${FIELD} font-mono text-xs`}
            />
          </label>

          {friend.at === "invalid" ? (
            <p className="text-sm text-out">{friend.message}</p>
          ) : friend.at === "reading" ? (
            <p className="text-sm text-cream-dim">Reading their wallet…</p>
          ) : friend.at === "member" ? (
            <p className="text-sm text-cream">
              That wallet is already in this pool.
            </p>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="font-matrix text-[10px] leading-4 text-cream-dim">
              THEIR NAME IN THIS POOL
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dave"
              maxLength={MAX_DISPLAY_NAME}
              className={FIELD}
            />
          </label>

          {friend.at === "ready" ? (
            topUp > 0 ? (
              <label className="flex items-start gap-3 text-sm leading-relaxed text-cream-dim">
                <input
                  type="checkbox"
                  checked={sendSol}
                  onChange={(e) => setSendSol(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  Also send them {solToPlay()} SOL, about half a dollar, so they
                  can sign their picks all season and claim if they win. Their
                  wallet holds {sol(friend.lamports)} SOL today, and without
                  this they could not use the seat.
                </span>
              </label>
            ) : (
              <p className="text-sm leading-relaxed text-cream-dim">
                They already hold enough SOL to play the season.
              </p>
            )
          ) : null}

          {/* WHAT IT COSTS, and who ends up with it. Said before the popup
              because a sponsor would otherwise assume the money comes back. */}
          <dl className="flex flex-col gap-1 border-l-2 border-rule pl-3 text-sm text-cream-dim">
            <div className="flex flex-wrap gap-2">
              <dt className="w-28 shrink-0 text-cream-dim/70">Buy-in</dt>
              <dd>
                {formatUsdc(pool.buyIn)} from your USDC, into the vault
              </dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="w-28 shrink-0 text-cream-dim/70">Seat rent</dt>
              <dd>{sol(lamportsToJoin(true))} SOL, paid by you</dd>
            </div>
            {willSendSol ? (
              <div className="flex flex-wrap gap-2">
                <dt className="w-28 shrink-0 text-cream-dim/70">Their SOL</dt>
                <dd>{sol(topUp)} SOL, sent to them</dd>
              </div>
            ) : null}
          </dl>

          <p className="text-sm leading-relaxed text-cream">
            None of this comes back to you. The seat is theirs: if they win, the
            pot goes to their wallet, and if the pool is abandoned, their share
            is refunded to them. Settle up with them however you like.
          </p>

          {status.at === "error" ? (
            <p className="text-sm leading-relaxed text-out">{status.message}</p>
          ) : null}

          <button type="submit" disabled={!canSponsor} className="btn btn-primary self-start">
            {status.at === "signing"
              ? "Approve in your wallet…"
              : status.at === "confirming"
                ? "Confirming…"
                : name.trim()
                  ? `Sponsor ${name.trim()}'s seat`
                  : "Sponsor this seat"}
          </button>
        </form>
      )}
    </section>
  );
}
