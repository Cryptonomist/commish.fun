"use client";

/* Create-a-pool. THIS IS THE FIRST REAL SCREEN TO BUILD.
 *
 * The form below is deliberately inert: it collects exactly the fields
 * `create_pool` takes so the shape is settled before the instruction exists,
 * and it renders the connected-wallet state so the wiring is visible. Replace
 * `onSubmit` with the Anchor call and this becomes the real thing.
 *
 * create_pool(buy_in, pool_type, lock_ts, prize_slots) — see the handoff, §
 * "Program accounts and instructions".
 */

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Laces, Wordmark } from "@/components/Laces";
import { WalletButton } from "@/components/WalletButton";
import { WEEK_1_KICKOFF } from "@/lib/nfl";
import { shortAddress } from "@/lib/format";

export default function NewPool() {
  const { publicKey, connected } = useWallet();
  const [name, setName] = useState("");
  const [buyIn, setBuyIn] = useState("25");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <Link href="/" aria-label="Commish home">
          <Wordmark size={20} />
        </Link>
        <WalletButton />
      </header>

      <main className="py-10">
        <h1 className="display text-4xl uppercase sm:text-5xl">Start a pool</h1>
        <p className="mt-3 leading-relaxed text-cream-dim">
          Set the buy-in and share the join link. The vault is created on-chain
          when you confirm — nobody, you included, can move what is in it except
          through payout logic.
        </p>

        <form
          className="mt-10 flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            // TODO: build and send the create_pool instruction.
            alert("Next step: wire create_pool from the Anchor program.");
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
              POOL NAME
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sunday Regulars"
              className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 text-cream outline-none placeholder:text-cream-dim/50 focus:border-leather"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold tracking-[0.18em] text-cream-dim">
              BUY-IN (USDC)
            </span>
            <input
              value={buyIn}
              onChange={(e) => setBuyIn(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              className="rounded-xl border border-night-3 bg-night-2 px-4 py-3.5 font-bold text-gold outline-none focus:border-leather"
            />
            <span className="text-xs text-cream-dim">
              Every member pays this once. It is the only money that ever enters
              the vault.
            </span>
          </label>

          <div className="rounded-xl border border-night-3 bg-night-2/60 p-4 text-sm">
            <span className="flex items-center gap-2 font-bold text-cream">
              <Laces size={12} className="text-leather" />
              Picks lock at first kickoff
            </span>
            <p className="mt-1.5 text-cream-dim">
              {WEEK_1_KICKOFF.toLocaleString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </p>
          </div>

          <button
            type="submit"
            disabled={!connected}
            className="h-14 rounded-xl bg-leather text-sm font-bold tracking-wide text-night transition-colors hover:bg-leather-hi disabled:cursor-not-allowed disabled:bg-night-3 disabled:text-cream-dim"
          >
            {connected ? "Create pool" : "Connect a wallet to continue"}
          </button>

          {publicKey ? (
            <p className="text-center text-xs text-cream-dim">
              Commissioner: {shortAddress(publicKey.toBase58())}
            </p>
          ) : null}
        </form>
      </main>
    </div>
  );
}
