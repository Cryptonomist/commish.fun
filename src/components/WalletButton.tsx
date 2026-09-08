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
import {
  detectPlatform,
  inWalletBrowser,
  isIpadPretendingToBeAMac,
  MOBILE_WALLETS,
  storeFor,
  type Platform,
} from "@/lib/mobile";

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

  /* THE SERVER HAS NO WALLET, AND SAYING SO IS THE ONLY WAY TO MATCH IT.
   *
   * Reported as: the button will not connect, but refreshing the page comes
   * back already connected. That shape is the tell. Refreshing works because
   * `autoConnect` restores the last wallet from localStorage and connects
   * without the button being involved at all; it is only the CLICK path that
   * fails.
   *
   * The cause is this component disagreeing with its own server render. The
   * label below is derived from `connected` and `connecting`, and by the time
   * React hydrates, autoConnect has often already restored a wallet — so the
   * server's "CONNECT" meets a client that wants to render an address. React
   * resolves a mismatch by throwing the subtree away and rebuilding it, and
   * `wantsConnect` is a ref: a rebuild resets it to false. The click sets the
   * intent, the subtree is regenerated, the effect below reads false and
   * returns, and nothing happens — silently, with no error to show, which is
   * why the error panel stays empty.
   *
   * So the first client render is forced to say what the server said, and the
   * real state appears on the render after. One frame of "CONNECT" on a
   * connected wallet is worth a button that works. */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  /* Only wallets actually present in this browser. `Installed` is a real
   * extension; `Loadable` is one that can be loaded on demand. Everything else
   * is a wallet we would be advertising to someone who does not have it. */
  const available = wallets.filter(
    (w) =>
      w.readyState === WalletReadyState.Installed ||
      w.readyState === WalletReadyState.Loadable,
  );

  /* THE PHONE, WHERE THERE IS NOTHING TO DETECT.
   *
   * A wallet on a desktop is a browser extension and the Wallet Standard finds
   * it. On a phone there is no extension, so `available` is empty and this
   * button used to say "No Solana wallet found in this browser" — to somebody
   * with Phantom installed on the same device, open in the next app across.
   * True, useless, and the end of the road.
   *
   * The way in is the wallet's own in-app browser: a universal link hands it
   * this URL, it opens, the wallet injects itself, and every other line in
   * this component works exactly as it does on a desktop.
   *
   * A page cannot ask a phone what is installed — both platforms removed that
   * because it is a fingerprinting surface — so there is no dispatching to be
   * done, only an offer: the link, which opens the app when it is there, and
   * the store beside it for when it is not.
   *
   * Read after mount, never during render: a user agent is not available to
   * the server, and deciding layout from it during hydration is the same
   * mismatch that ate the click on this very button. */
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [insideWallet, setInsideWallet] = useState(false);
  /* The page to come back to. Captured after mount for the same reason as the
   * platform, and it is the CURRENT page rather than the home page: somebody
   * following a pool invitation must land back on that pool, not on a site
   * they then have to navigate from scratch inside a wallet's browser. */
  const [href, setHref] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setHref(window.location.href);
    setOrigin(window.location.origin);
    const ua = navigator.userAgent;
    setPlatform(
      isIpadPretendingToBeAMac(ua, navigator.maxTouchPoints)
        ? "ios"
        : detectPlatform(ua),
    );
    setInsideWallet(inWalletBrowser(ua));
  }, []);

  /* INSTALLED, NOT AVAILABLE, AND THE DIFFERENCE IS THE WHOLE ANDROID STORY.
   *
   * This first tested `available.length === 0` and the panel never appeared on
   * Android. Running it explained why: @solana-mobile/wallet-adapter-mobile is
   * in the tree and REGISTERS ITSELF through the Wallet Standard on Android, so
   * `available` already holds a LocalSolanaMobileWalletAdapterWallet at
   * readyState Loadable. Android has had Mobile Wallet Adapter all along, and
   * MWA is the right path there: it hands off to whichever wallet app is
   * actually installed, which is exactly "call the wallet on their phone".
   *
   * What it cannot do is help somebody with no wallet app at all. It tries,
   * fails — "Local Network Access permission denied" in this browser, an
   * unanswered intent on a real phone — and leaves them where they started.
   *
   * So the test is whether anything is INSTALLED. A Loadable entry is a
   * promise to go and find a wallet, not a wallet; on iOS there is not even
   * that. Either way the panel below is what turns a dead end into a choice,
   * and on Android it offers the MWA hand-off first, because when a wallet IS
   * installed that is the better route. */
  const installed = available.filter(
    (w) => w.readyState === WalletReadyState.Installed,
  );
  const handoff = available.find(
    (w) => w.readyState === WalletReadyState.Loadable,
  );

  const needsMobileHelp =
    hydrated &&
    !connected &&
    platform !== "desktop" &&
    !insideWallet &&
    installed.length === 0;

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
    /* THE PHONE CASE IS TESTED FIRST, and it has to be.
     *
     * This used to start from `available.length`, and on Android that is 1
     * before any wallet exists — the Mobile Wallet Adapter registers itself as
     * Loadable whether or not a wallet app is installed. So the click went
     * straight to it, MWA failed to find anything to hand off to, and the
     * panel this exists to show was never reached. Nothing on screen changed;
     * the only trace was a WalletConnectionError in the console.
     *
     * A Loadable entry is a promise to go and look, not a wallet. When nothing
     * is Installed and this is a phone, the panel is the answer — and it
     * offers the hand-off as its first option, so a real installed wallet
     * still takes the better route. */
    if (needsMobileHelp) {
      setPicking((p) => !p);
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
  }, [connected, disconnect, available, choose, needsMobileHelp]);


  /* Upper case, and no ellipsis character. The label face is Press Start 2P
   * and it sits in a row of nav blocks that are all caps; a mixed-case
   * "Connect" beside them reads as a different control from a different site.
   * Three full stops rather than U+2026 because the ellipsis is not something
   * to gamble on in a subsetted bitmap face — an address, which is base58 and
   * genuinely mixed case, is left exactly as it is. */
  const label = !hydrated
    ? "CONNECT" // whatever the server said, so hydration has nothing to fix
    : connected
      ? shortAddress(publicKey?.toBase58() ?? "", 4)
      : connecting
        ? "CONNECTING..."
        : "CONNECT";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        /* Same reason as the label: the server cannot be mid-connect, so
         * neither can the first client render, or the attribute is one more
         * thing hydration has to reconcile — and a disabled button is one that
         * eats the click outright. */
        disabled={hydrated && connecting}
        className="btn btn-nav !bg-action !text-panel !border-action shadow-[3px_3px_0_#3a1405] disabled:cursor-wait disabled:opacity-70"
      >
        {label}
      </button>

      {/* THE PHONE PANEL. Two rows per wallet, and both are needed because a
        * page cannot know which one applies: OPEN dispatches to the app when
        * it is installed, INSTALL goes to the right store for this platform.
        * Ordinary links, not buttons — a universal link has to be navigated
        * to, and iOS treats a real link as a stronger signal of intent than a
        * scripted location change. */}
      {picking && needsMobileHelp ? (
        <div className="absolute right-0 z-20 mt-2 w-72 border-2 border-chalk bg-panel p-3 shadow-[4px_4px_0_rgba(0,0,0,0.5)]">
          <p className="font-matrix text-[10px] leading-4 text-chalk">
            OPEN IN A WALLET
          </p>
          <p className="mt-2 text-xs leading-relaxed text-cream-dim">
            Phone browsers cannot hold a wallet. Open this page inside a wallet
            app and it will connect there.
          </p>

          {/* ANDROID FIRST, WHEN IT IS OFFERED. Mobile Wallet Adapter hands
            * off to whichever wallet app is installed, whatever it is — a
            * better route than guessing at two by name, and the only one that
            * reaches a wallet this list has never heard of. It is absent on
            * iOS, where MWA does not exist, so the deep links below are the
            * whole answer there. */}
          {handoff ? (
            <button
              type="button"
              onClick={() => choose(handoff.adapter.name)}
              className="btn btn-compact btn-primary mt-3 w-full"
            >
              Use an installed wallet
            </button>
          ) : null}

          <ul className="mt-3 flex flex-col gap-3">
            {MOBILE_WALLETS.map((w) => (
              <li key={w.id} className="flex flex-col gap-1.5">
                <span className="font-matrix text-[10px] leading-4 text-cream">
                  {w.name}
                </span>
                <span className="text-xs leading-relaxed text-cream-dim">
                  {w.note}
                </span>
                <span className="flex gap-2">
                  <a
                    href={w.browse ? w.browse(href, origin) : "#"}
                    className="btn btn-compact btn-primary flex-1 text-center"
                  >
                    Open
                  </a>
                  <a
                    href={storeFor(w, platform)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn btn-compact btn-secondary flex-1 text-center"
                  >
                    Install
                  </a>
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs leading-relaxed text-cream-dim">
            Open does nothing if the app is not installed — there is no way for
            a web page to check. Install first if that happens.
          </p>
        </div>
      ) : null}

      {picking && !needsMobileHelp ? (
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
