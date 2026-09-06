"use client";

/* Does this build agree with the cluster it is pointed at?
 *
 * Two constants are compiled into the bundle and both have to match the chain:
 * the program id and the USDC mint. When either is wrong the site does not look
 * broken. It loads, it renders, it reads pools perfectly well — and then the
 * first person to sign anything gets `WrongMint` from a program they have never
 * heard of, which reads as a wallet problem. That is exactly how a deployment
 * shipped with mainnet USDC compiled into a devnet build, and nothing on the
 * page said so.
 *
 * THE CHECK IS EMPIRICAL, NOT A LOOKUP TABLE. Asking "is this the devnet mint
 * when the URL says devnet" needs a table of every cluster and every mint, and
 * that table is one more thing to get wrong. Asking the connected cluster what
 * the configured address actually IS needs no table and cannot go stale.
 *
 * EXISTENCE IS NOT THE TEST, WHICH IS WORTH KNOWING BECAUSE IT LOOKS LIKE IT.
 * The obvious version — "mainnet USDC has no account on devnet, so a null fetch
 * proves the mismatch" — is false. That address on devnet is a real account: 0
 * bytes, owned by the system program, because somebody once sent lamports to
 * it. A guard written that way stays silent on precisely the bug it exists for.
 *
 * So the test is whether the address is an SPL MINT: owned by the token program
 * and 82 bytes, which is the size of a Mint. The devnet dollar passes both, the
 * squatted mainnet address fails both, and any address that is a wallet, an
 * empty account or a typo fails too.
 *
 * WHAT IT DOES NOT CATCH: a wrong address that happens to be a valid mint. The
 * authoritative check for that is `pool.usdc_mint` on any existing pool, since
 * the program only ever accepts CANONICAL_USDC at creation — but reading one
 * means a getProgramAccounts on every page load, which on a public RPC is how
 * you earn a 429 for a check that has never yet been the thing that failed.
 *
 * IT FAILS QUIET, DELIBERATELY. An RPC that times out or rate-limits is not a
 * misconfiguration, and a banner that cries wrong-network every time devnet
 * throttles is a banner people learn to ignore. Anything short of a definite
 * negative renders nothing.
 */

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";

import {
  PROGRAM_ID,
  USDC_MINT,
  MAINNET_USDC,
  DEVNET_USDC,
  TOKEN_PROGRAM_ID,
} from "@/lib/program";

/** The size of an SPL Mint account. Fixed by the token program. */
const MINT_ACCOUNT_BYTES = 82;

type Problem = { what: string; fix: string };

export function ConfigGuard() {
  const { connection } = useConnection();
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [mint, program] = await connection.getMultipleAccountsInfo([
          USDC_MINT,
          PROGRAM_ID,
        ]);
        if (cancelled) return;

        if (!program) {
          setProblem({
            what: `No program is deployed at ${PROGRAM_ID.toBase58()} on this cluster.`,
            fix: "Set NEXT_PUBLIC_PROGRAM_ID to the program this deployment should talk to, or point NEXT_PUBLIC_RPC_URL at the cluster it lives on.",
          });
          return;
        }

        /* An SPL Mint is owned by the token program and is exactly 82 bytes.
         * Anything else at this address — an empty system account, a wallet, a
         * token account, a typo — is not a dollar this program can escrow. */
        const isMint =
          mint !== null &&
          mint.owner.equals(TOKEN_PROGRAM_ID) &&
          mint.data.length === MINT_ACCOUNT_BYTES;

        if (!isMint) {
          const configured = USDC_MINT.toBase58();
          const hint =
            configured === MAINNET_USDC
              ? ` That is the MAINNET dollar; devnet's is ${DEVNET_USDC}.`
              : configured === DEVNET_USDC
                ? ` That is the DEVNET dollar; mainnet's is ${MAINNET_USDC}.`
                : "";
          setProblem({
            what:
              `${configured} is not a token mint on this cluster` +
              `${mint === null ? " (no account there at all)" : ` (${mint.data.length} bytes, owned by ${mint.owner.toBase58()})`}.` +
              `${hint} Every buy-in and every payout would fail at signature time with WrongMint.`,
            fix: "Set NEXT_PUBLIC_USDC_MINT and rebuild. The value is inlined at build time, so saving it without a fresh build changes nothing.",
          });
        }
      } catch {
        /* Unreachable RPC, a 429, a network blip. None of these are a
         * misconfiguration and none of them justify a banner. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection]);

  if (!problem) return null;

  return (
    <div
      role="alert"
      className="border-b border-out/40 bg-out/10 px-4 py-3 text-sm text-cream"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-1">
        <p className="font-display tracking-wide text-out uppercase">
          This deployment is misconfigured
        </p>
        <p className="text-cream">{problem.what}</p>
        <p className="text-cream-dim">{problem.fix}</p>
      </div>
    </div>
  );
}
