"use client";

/* The connect button.
 *
 * wallet-adapter's own <WalletMultiButton> is imported dynamically with SSR
 * off. It reads `window` during render, so rendering it on the server produces
 * a hydration mismatch that shows up as the button flashing or refusing to open
 * the modal on the first click — the single most common wallet-adapter bug in a
 * Next.js app router project.
 */

import dynamic from "next/dynamic";

export const WalletButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  {
    ssr: false,
    loading: () => (
      <span className="inline-flex h-11 items-center rounded-xl border border-night-3 px-5 text-sm font-bold tracking-wide text-cream-dim">
        CONNECT
      </span>
    ),
  },
);
