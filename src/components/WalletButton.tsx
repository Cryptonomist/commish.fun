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

  const tryConnect = useCallback(() => {
    connect().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Could not connect.");
    });
  }, [connect]);

  /* Only for the case where selecting actually moves the wallet. When it does
   * not, `choose` connects directly — see the note there. */
  useEffect(() => {
    if (!wantsConnect.current || !wallet || connected || connecting) return;
    wantsConnect.current = false;
    tryConnect();
  }, [wallet, connected, connecting, tryConnect]);

  const choose = useCallback(
    (name: WalletName) => {
      setError(null);
      setPicking(false);

      /* ALREADY SELECTED IS THE COMMON CASE, not the rare one. `autoConnect`
       * restores the last wallet from localStorage on mount, so by the time
       * anybody clicks, `wallet` is usually already the one they are about to
       * choose. `select()` is then a no-op: the wallet reference does not
       * change, the effect below never re-runs, and the click does nothing at
       * all — silently, with the button still reading "Connect".
       *
       * So connect straight away when the selection is not going to move. The
       * effect is only for the case where it is. */
      if (wallet?.adapter.name === name) {
        tryConnect();
        return;
      }
      wantsConnect.current = true;
      select(name);
    },
    [wallet, select, tryConnect],
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

  /* Upper case, and no ellipsis character. The label face is Press Start 2P
   * and it sits in a row of nav blocks that are all caps; a mixed-case
   * "Connect" beside them reads as a different control from a different site.
   * Three full stops rather than U+2026 because the ellipsis is not something
   * to gamble on in a subsetted bitmap face — an address, which is base58 and
   * genuinely mixed case, is left exactly as it is. */
  const label = connected
    ? shortAddress(publicKey?.toBase58() ?? "", 4)
    : connecting
      ? "CONNECTING..."
      : "CONNECT";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={connecting}
        className="btn btn-nav !bg-action !text-panel !border-action shadow-[3px_3px_0_#3a1405] disabled:cursor-wait disabled:opacity-70"
      >
        {label}
      </button>

      {picking ? (
        <ul className="absolute right-0 z-20 mt-2 w-60 overflow-hidden border-2 border-chalk bg-panel shadow-[4px_4px_0_rgba(0,0,0,0.5)]">
          {available.map((w) => (
            <li key={w.adapter.name}>
              <button
                type="button"
                onClick={() => choose(w.adapter.name)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left font-matrix text-[10px] leading-4 text-cream transition-colors hover:bg-action hover:text-panel"
              >
                {w.adapter.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={w.adapter.icon}
                    alt=""
                    width={20}
                    height={20}
                    /* The wallet's own mark, handed to us by the Wallet
                       Standard as a data URI. Square, not rounded: every
                       other edge on this site is. */
                    className="shrink-0"
                  />
                ) : null}
                {w.adapter.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="absolute right-0 mt-2 w-64 border-2 border-out bg-panel p-2 text-xs text-cream">
          {error}
        </p>
      ) : null}
    </div>
  );
}
