"use client";

/* WHAT TO DO WHEN THE WALLET IS EMPTY, or looks full and is not.
 *
 * Two currencies are needed and only one is obvious. The buy-in is USDC and
 * every screen says so. The other is SOL, for rent on the accounts a pool
 * creates — and somebody can hold plenty of dollars, connect a funded wallet,
 * and still be refused.
 *
 * That is what this panel exists for, and it is not hypothetical: the first
 * mainnet pool on this site could not be created from a wallet holding 2.06
 * USDC and 0.0131 SOL, short by about seven ten-thousandths. So it reads the
 * connected wallet and names the gap in the currency the gap is actually in,
 * rather than offering generic advice about buying crypto.
 *
 * IT LINKS OUT RATHER THAN EMBEDDING AN ON-RAMP, deliberately. MoonPay,
 * Transak and the rest are drop-in widgets that would inject third-party
 * script into a page where people sign transactions holding escrowed money.
 * This app has no XSS sinks at all today, and that is worth more than the
 * convenience. A link costs nothing and carries none of it.
 *
 * THE ORDER OF THE ROUTES IS THE WHOLE POINT. The wallet's own buy button is
 * first because the money lands in the right wallet on the right network with
 * nothing to mistype. The commonest way somebody loses money getting here is
 * buying USDC on Ethereum and sending it to a Solana address, so the exchange
 * route is last and carries the network warning in bold.
 */

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { ataFor, USDC_MINT } from "@/lib/program";
import { shortfall, solNeeded, type Shortfall } from "@/lib/funding";

type Balances = { sol: number; usdc: number; hasTokenAccount: boolean };

export function GetFunded({
  intent = "create",
  buyIn,
}: {
  intent?: "create" | "join";
  /** The buy-in in USDC, when this is shown against a specific pool. */
  buyIn?: number;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balances, setBalances] = useState<Balances | null>(null);
  const [failed, setFailed] = useState(false);

  const read = useCallback(async () => {
    if (!publicKey) return;
    try {
      const lamports = await connection.getBalance(publicKey);
      const ata = ataFor(publicKey, USDC_MINT);
      /* A wallet that has never held USDC has no token account, which is not
       * an error — it is a zero balance and one more account to pay rent on. */
      let usdc = 0;
      let hasTokenAccount = false;
      const info = await connection.getAccountInfo(ata);
      if (info) {
        hasTokenAccount = true;
        const bal = await connection.getTokenAccountBalance(ata);
        usdc = bal.value.uiAmount ?? 0;
      }
      setBalances({ sol: lamports / 1e9, usdc, hasTokenAccount });
      setFailed(false);
    } catch {
      /* An RPC hiccup must not turn this into a wall of red. The panel still
       * shows the routes; it just cannot say which one you need. */
      setFailed(true);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void read();
  }, [read]);

  const gap: Shortfall | null = balances
    ? shortfall({
        intent,
        haveSol: balances.sol,
        haveUsdc: balances.usdc,
        buyIn,
        hasTokenAccount: balances.hasTokenAccount,
      })
    : null;

  return (
    <section className="panel flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-matrix text-[11px] leading-4 text-chalk">
          PUTTING MONEY IN
        </h2>
        {publicKey ? (
          <button
            type="button"
            onClick={() => void read()}
            className="font-matrix text-[10px] leading-4 text-cream-dim underline hover:text-cream"
          >
            RECHECK
          </button>
        ) : null}
      </div>

      <p className="text-sm leading-relaxed text-cream-dim">
        You need two things, and the second one surprises people. The buy-in is
        in <strong className="text-cream">USDC</strong>, a dollar-pegged token.
        Solana also charges rent for the small accounts a pool creates, paid in{" "}
        <strong className="text-cream">SOL</strong> — about{" "}
        {solNeeded("create")} SOL to create a pool and {solNeeded("join", false)}{" "}
        to join one, which is a few cents. A wallet full of USDC and empty of
        SOL cannot do either.
      </p>

      {/* WHAT THIS PARTICULAR WALLET IS MISSING. Generic advice is what the
          page already had; the useful thing is the number for the wallet in
          front of us. */}
      {!publicKey ? (
        <p className="border-l-2 border-rule pl-3 text-sm leading-relaxed text-cream-dim">
          Connect a wallet and this will tell you exactly what it is short of.
        </p>
      ) : failed ? (
        <p className="border-l-2 border-rule pl-3 text-sm leading-relaxed text-cream-dim">
          Could not read your balances just now. The routes below still apply.
        </p>
      ) : !gap ? (
        <p className="border-l-2 border-rule pl-3 text-sm leading-relaxed text-cream-dim">
          Reading your wallet…
        </p>
      ) : gap.ok ? (
        <p className="border-l-2 border-action pl-3 text-sm leading-relaxed text-cream">
          This wallet is ready: {gap.haveSol.toFixed(4)} SOL and{" "}
          {gap.haveUsdc.toFixed(2)} USDC.
        </p>
      ) : (
        <div className="flex flex-col gap-2 border-l-2 border-out pl-3">
          <p className="text-sm leading-relaxed text-cream">
            This wallet is short.
          </p>
          <dl className="flex flex-col gap-1 text-sm text-cream-dim">
            {gap.addSol > 0 ? (
              <div className="flex flex-wrap gap-2">
                <dt className="w-14 shrink-0 text-cream-dim/70">SOL</dt>
                <dd>
                  has {gap.haveSol.toFixed(4)}, needs {gap.needSol} —{" "}
                  <strong className="text-cream">add {gap.addSol}</strong>
                </dd>
              </div>
            ) : null}
            {gap.addUsdc > 0 ? (
              <div className="flex flex-wrap gap-2">
                <dt className="w-14 shrink-0 text-cream-dim/70">USDC</dt>
                <dd>
                  has {gap.haveUsdc.toFixed(2)}, needs {gap.needUsdc} —{" "}
                  <strong className="text-cream">add {gap.addUsdc}</strong>
                </dd>
              </div>
            ) : null}
          </dl>
          {gap.addSol > 0 && gap.addUsdc === 0 ? (
            <p className="text-sm leading-relaxed text-cream-dim">
              Your USDC is fine. It is the SOL for rent that is missing, which
              is a few cents and the thing nobody expects.
            </p>
          ) : null}
        </div>
      )}

      <ol className="flex flex-col gap-4">
        <Route
          n={1}
          title="Your wallet's own buy button"
          best
        >
          Phantom and Solflare both sell SOL and USDC by card, inside the
          wallet. This is the one to use: the money arrives in the right wallet
          on the right network, and there is no address to paste and nothing to
          mistype. Look for <em>Buy</em> or <em>Deposit</em>.
        </Route>

        <Route n={2} title="Already hold SOL? Swap some">
          Both wallets have a <em>Swap</em> tab. Trade a little SOL for the USDC
          you need. Keep {solNeeded("create")} SOL back for rent — swapping the
          lot leaves you exactly where the buy-in is covered and nothing can be
          signed.
        </Route>

        <Route n={3} title="Or withdraw from an exchange">
          Buy USDC on Coinbase or Kraken and withdraw it to your wallet address.
          Cheapest, slowest, and the only route with a way to lose money:{" "}
          <strong className="text-cream">
            the withdrawal network must be Solana
          </strong>
          . USDC exists on a dozen chains and they are not interchangeable —
          sent on Ethereum or Polygon to a Solana address, it does not arrive
          and cannot be recovered. Withdraw a little SOL too, or you will have
          dollars you cannot spend.
        </Route>
      </ol>
    </section>
  );
}

function Route({
  n,
  title,
  best,
  children,
}: {
  n: number;
  title: string;
  best?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center border-2 font-matrix text-[10px] leading-none ${
          best ? "border-action text-action" : "border-rule text-cream-dim"
        }`}
      >
        {n}
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="font-bold text-cream">
          {title}
          {best ? (
            <span className="ml-2 font-matrix text-[9px] uppercase tracking-wider text-action">
              easiest
            </span>
          ) : null}
        </p>
        <div className="text-sm leading-relaxed text-cream-dim">{children}</div>
      </div>
    </li>
  );
}
