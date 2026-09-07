"use client";

/* What you need before you can join, and which of it you are missing.
 *
 * A join link lands in a group chat and gets opened by somebody who has never
 * used a wallet. Before today this screen met them with a disabled button
 * reading "Connect a wallet to join" and nothing else — which is an instruction
 * with no button behind it if they have no wallet at all, and a lie if the
 * reason they cannot join is that they hold no USDC.
 *
 * ORDERED BY WHAT THEY CANNOT FIX BY TYPING. The form used to ask for a display
 * name before it mentioned money, so somebody with an empty wallet was told
 * "Pick a name the others will see", typed one, and only then learned they
 * could not join. Every blocker a person cannot type their way out of outranks
 * every blocker they can. That is the whole ordering rule.
 *
 * IT SHOWS ALL THREE, NOT JUST THE FIRST. A single message answers "why is the
 * button off" and leaves "what else is waiting for me" unanswered, so somebody
 * fixes one thing, comes back, and is told about the next one. Three lines with
 * ticks costs nothing and is the difference between one trip and three.
 *
 * WHAT IT DOES NOT DO IS GATE THE BUTTON ON A CLOCK. `join_pool` compares
 * against the chain's clock and this compares against the device's, which can
 * be minutes out on a phone with the wrong time. So a passed deadline is shown
 * as a warning and the program is left to make the actual decision — refusing
 * a join the chain would have accepted is worse than letting one fail.
 */

import type { ReactNode } from "react";

/** Rent for a Member account and a token account, plus fees, rounded up.
 *  Measured on devnet: the two rent exemptions come to about 0.0032 SOL. */
export const SOL_NEEDED_LAMPORTS = 5_000_000;

export type JoinNeeds = {
  /** Null while still loading. */
  hasWallet: boolean | null;
  connected: boolean;
  connecting: boolean;
  /** Null when the balance has not been read yet, or could not be. */
  solLamports: number | null;
  usdc: bigint | null;
  buyIn: bigint;
  formatUsdc: (v: bigint) => string;
};

type Row = {
  key: string;
  label: string;
  ok: boolean | null;
  detail: ReactNode;
};

export function joinRows(n: JoinNeeds): Row[] {
  const solOk =
    n.solLamports === null ? null : n.solLamports >= SOL_NEEDED_LAMPORTS;
  /* An unknown balance is NOT a pass. Reading it can fail on a rate-limited
   * RPC, and treating that as "funded" hands somebody a green tick and then a
   * failed transaction. Unknown stays unknown and says so. */
  const usdcOk = n.usdc === null ? null : n.usdc >= n.buyIn;
  const free = n.buyIn === BigInt(0);

  return [
    {
      key: "wallet",
      label: "A Solana wallet",
      ok: n.hasWallet === null ? null : n.connected ? true : false,
      detail:
        n.hasWallet === false ? (
          /* The dead end this checklist exists to remove. "You need a wallet"
             is true and useless to somebody who has never had one, which is
             most people in a football pool. On a phone it is worse: they may
             have installed the app and still see this, because the link opened
             in the wrong browser. All of that is behind the link. */
          <>
            No wallet found in this browser.{" "}
            <a className="text-action underline underline-offset-2" href="/wallet">
              How to get one
            </a>
            .
          </>
        ) : n.connecting ? (
          <>Connecting…</>
        ) : n.connected ? (
          <>Connected.</>
        ) : (
          <>Press Connect at the top of the page.</>
        ),
    },
    {
      key: "sol",
      label: "A little SOL",
      ok: solOk,
      detail:
        solOk === null ? (
          <>Not read yet.</>
        ) : solOk ? (
          <>Enough for the network fee.</>
        ) : (
          <>
            About 0.005 SOL covers the accounts this creates for you. You have{" "}
            {(n.solLamports! / 1e9).toFixed(4)}.
          </>
        ),
    },
    {
      key: "usdc",
      label: free ? "No buy-in" : `${n.formatUsdc(n.buyIn)} of USDC`,
      ok: free ? true : usdcOk,
      detail: free ? (
        <>This pool is free to join.</>
      ) : usdcOk === null ? (
        <>Not read yet.</>
      ) : usdcOk ? (
        <>You have {n.formatUsdc(n.usdc!)}.</>
      ) : (
        <>
          You have {n.formatUsdc(n.usdc ?? BigInt(0))}. This is the only money
          that ever leaves your wallet.
        </>
      ),
    },
  ];
}

export function JoinChecklist(props: JoinNeeds) {
  const rows = joinRows(props);
  // Nothing to say once every line passes; the button speaks for itself.
  if (rows.every((r) => r.ok === true)) return null;

  return (
    <ul className="flex flex-col gap-px overflow-hidden rounded-xl border border-night-3 bg-night-3">
      {rows.map((r) => (
        <li key={r.key} className="flex items-start gap-3 bg-night-2 px-4 py-3">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-[10px] font-bold ${
              r.ok === true
                ? "bg-alive/20 text-alive"
                : r.ok === false
                  ? "bg-out/20 text-out"
                  : "bg-night-3 text-cream-dim"
            }`}
          >
            {r.ok === true ? "✓" : r.ok === false ? "!" : "?"}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-cream">{r.label}</span>
            <span className="block text-xs text-cream-dim">{r.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
