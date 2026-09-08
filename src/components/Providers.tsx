"use client";

/* Every client-side provider the app needs, in one place, mounted once in the
 * root layout.
 *
 * NO `@solana/wallet-adapter-react-ui`. That package's <WalletModalProvider>
 * and <WalletMultiButton> are built for React 18 and fail silently under React
 * 19 — the button sticks on "Connecting", no modal mounts, nothing throws. The
 * adapter core below is unaffected; only the UI layer is. `WalletButton` talks
 * to `useWallet` directly instead.
 *
 * WALLETS: the array is deliberately EMPTY. Phantom, Solflare, Backpack and the
 * rest register themselves through the Wallet Standard, so wallet-adapter
 * discovers them without us importing megabytes of adapters and without us
 * deciding which wallets a person is allowed to use. Only add an explicit
 * adapter here for a wallet that does NOT implement the standard — and check
 * the console first, because a wallet registered twice is worse than one
 * registered not at all.
 *
 * RPC: NEXT_PUBLIC_RPC_URL IS THE WORKER PROXY, NOT A HELIUS ENDPOINT.
 *
 * This said the opposite: that it was "a Helius endpoint restricted to the
 * commish.fun domain in the Helius dashboard", and that "the domain
 * restriction is what protects it, not secrecy". Both halves were wrong, and
 * the second was the dangerous one — it was tested against the live endpoint
 * and did not hold. Every origin got a 200 and an
 * `access-control-allow-origin: *`, including origins with no connection to
 * this site, and so did a request carrying no Origin header at all. A
 * credential published in a bundle and guarded by a control that does not
 * work is simply a published credential.
 *
 * So the key moved into a Cloudflare Worker as an encrypted secret, and this
 * variable became that worker's URL — rpc.commish.fun, which carries no
 * credential and is therefore safe to ship. What protects the key now is that
 * the browser never receives it.
 *
 * See workers/rpc-proxy for what that proxy does and, more usefully, what it
 * does not: CORS is a browser rule, so it stops other websites and not curl,
 * and anyone who forges an Origin header still gets through.
 *
 * Never put a server-side key in a NEXT_PUBLIC_ variable.
 */

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ConfigGuard } from "./ConfigGuard";

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("mainnet-beta"),
    [],
  );

  // One client for the app's lifetime. Created in a ref-like memo so a re-render
  // never throws away the cache.
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={[]} autoConnect>
          {/* Above everything, because a build pointed at the wrong cluster
              renders the rest of the app perfectly and fails only at signing. */}
          <ConfigGuard />
          {children}
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
