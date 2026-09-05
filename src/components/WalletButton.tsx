"use client";

/* The connect button, written against `useWallet` directly.
 *
 * WHY NOT `@solana/wallet-adapter-react-ui`. Its <WalletMultiButton> and
 * <WalletModalProvider> are built for React 18 and misbehave under React 19:
 * the button renders stuck on "Connecting", the modal never mounts, and no
 * error is thrown anywhere — there is nothing to catch and nothing in the
 * console. The adapter core (`@solana/wallet-adapter-react`) is fine; it is
 * only the UI package that breaks.
 *
 * So this component does the three things that package was doing for us:
 * list the wallets the browser actually has, `select()` one, and `connect()`.
 *
 * THE SELECT/CONNECT DANCE. `select(name)` does not connect — it sets which
 * adapter is active, and the change lands on a later render. Calling connect()
 * in the same tick connects the *previous* wallet, or nothing at all. Hence the
 * intent ref: the click records that we want to connect, and the effect fires
 * once the selection has actually taken.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import type { WalletName } from "@solana/wallet-adapter-base";

import { shortAddress } from "@/lib/format";

export function WalletButton() {
  const {
    wallets,
    wallet,
    select,
    connect,
    disconnect,
    connecting,
    connected,
    publicKey,
  } = useWallet();

  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wantsConnect = useRef(false);

  /* Only wallets actually present in this browser. `Installed` is a real
   * extension; `Loadable` is one that can be loaded on demand. Everything else
   * is a wallet we would be advertising to someone who does not have it. */
  const available = wallets.filter(
    (w) =>
      w.readyState === WalletReadyState.Installed ||
      w.readyState === WalletReadyState.Loadable,
  );

  useEffect(() => {
    if (!wantsConnect.current || !wallet || connected || connecting) return;
    wantsConnect.current = false;
    connect().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Could not connect.");
    });
  }, [wallet, connected, connecting, connect]);

  const choose = useCallback(
    (name: WalletName) => {
      setError(null);
      wantsConnect.current = true;
      setPicking(false);
      select(name);
    },
    [select],
  );

  const onClick = useCallback(() => {
    setError(null);
    if (connected) {
      disconnect().catch(() => {});
      return;
    }
    if (available.length === 0) {
      setError("No Solana wallet found in this browser.");
      return;
    }
    // One wallet is the common case; do not make someone pick from a list of one.
    if (available.length === 1) {
      choose(available[0].adapter.name);
      return;
    }
    setPicking((p) => !p);
  }, [connected, disconnect, available, choose]);

  const label = connected
    ? shortAddress(publicKey?.toBase58() ?? "", 4)
    : connecting
      ? "Connecting…"
      : "Connect";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={connecting}
        className="inline-flex h-11 items-center rounded-xl bg-action px-5 text-sm font-bold tracking-wide text-night transition-colors hover:bg-action-hi disabled:cursor-wait disabled:opacity-70"
      >
        {label}
      </button>

      {picking ? (
        <ul className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-night-3 bg-night-2 shadow-xl">
          {available.map((w) => (
            <li key={w.adapter.name}>
              <button
                type="button"
                onClick={() => choose(w.adapter.name)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-cream hover:bg-night-3"
              >
                {w.adapter.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={w.adapter.icon}
                    alt=""
                    width={20}
                    height={20}
                    className="rounded"
                  />
                ) : null}
                {w.adapter.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="absolute right-0 mt-2 w-64 rounded-lg border border-out/40 bg-out/10 p-2 text-xs text-cream">
          {error}
        </p>
      ) : null}
    </div>
  );
}
