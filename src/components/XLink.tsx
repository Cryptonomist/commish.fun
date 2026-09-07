"use client";

/* Linking an X account to a wallet, in the fewest steps that still prove both.
 *
 * The whole flow is three states and the component shows exactly one of them,
 * because a panel that renders every possible step at once is how people end
 * up signing the wrong thing:
 *
 *   nothing linked   ->  Connect X
 *   X came back      ->  Sign with your wallet
 *   both proved      ->  the handle, plus the leaderboard decision
 *
 * The leaderboard decision is last, separate, and off. It is the only control
 * here that makes anything public, so it does not share a button with anything
 * else and it says what it does before it is pressed rather than after.
 */

import { useWallet } from "@solana/wallet-adapter-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  bindMessage,
  listMessage,
  unlinkMessage,
  type LinkedIdentity,
  type PendingLink,
} from "@/lib/link";
import { shortAddress } from "@/lib/format";

/** Wallets return 64 raw bytes. The API speaks base64 because JSON has no
 *  bytes, and base64 is the one encoding every wallet library agrees on. */
const toBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};


export default function XLink({ className }: { className?: string }) {
  const { publicKey, signMessage, connected } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const pathname = usePathname();

  const [pending, setPending] = useState<PendingLink | null>(null);
  const [identity, setIdentity] = useState<LinkedIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  /* What the callback route said, if this load is a return trip from X.
   *
   * Read from `window.location` inside an effect rather than with
   * `useSearchParams`, which would force this component's page into a Suspense
   * boundary just to report that somebody pressed cancel. Reading it after
   * mount also means there is no server render of it to mismatch.
   *
   * The parameter is then stripped from the address bar, so a refresh does not
   * replay a stale "that failed" at somebody who has since succeeded. */
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("link");
    if (!status) return;

    const said: Record<string, string> = {
      cancelled: "No problem. Nothing was linked.",
      expired: "That took too long and the request expired. Try again.",
      failed: "X could not complete the sign-in. Try again in a minute.",
    };
    if (said[status]) setError(said[status]);

    const url = new URL(window.location.href);
    url.searchParams.delete("link");
    window.history.replaceState(null, "", url.toString());
  }, []);

  /* What X said, if the browser has just come back from it. Runs once and
   * independently of the wallet: somebody can complete the X half before they
   * have connected a wallet at all, and telling them to connect one is a much
   * better screen than pretending nothing happened. */
  useEffect(() => {
    let live = true;
    fetch("/api/auth/pending")
      .then((r) => r.json())
      .then((j: { pending: PendingLink | null }) => {
        if (live) setPending(j.pending);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const readIdentity = useCallback(async () => {
    if (!wallet) {
      setIdentity(null);
      return;
    }
    try {
      const r = await fetch(
        `/api/auth/identity?wallet=${encodeURIComponent(wallet)}`,
      );
      const j = (await r.json()) as { identity: LinkedIdentity | null };
      setIdentity(j.identity);
    } catch {
      /* A failed read leaves the last known answer alone rather than blanking
       * the panel. Losing a network round trip should not look like being
       * unlinked. */
    }
  }, [wallet]);

  useEffect(() => {
    void readIdentity();
  }, [readIdentity]);

  /* Ask the wallet for a signature over exactly the text the server will
   * rebuild. Every signing path in this component goes through here so there
   * is one place the message can be got wrong. */
  const sign = useCallback(
    async (message: string): Promise<string> => {
      if (!signMessage) {
        throw new Error(
          "This wallet cannot sign messages. Phantom, Solflare and Backpack can.",
        );
      }
      const sig = await signMessage(new TextEncoder().encode(message));
      return toBase64(sig);
    },
    [signMessage],
  );

  const bind = useCallback(async () => {
    if (!pending || !wallet) return;
    setBusy(true);
    setError(null);
    try {
      const signature = await sign(
        bindMessage({
          handle: pending.handle,
          wallet,
          nonce: pending.nonce,
          issuedAt: pending.issuedAt,
        }),
      );
      const res = await fetch("/api/auth/bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, signature }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Linking failed.");
      setPending(null);
      await readIdentity();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Linking failed.");
    } finally {
      setBusy(false);
    }
  }, [pending, wallet, sign, readIdentity]);

  /* Both of the actions on an existing link need a fresh server-issued nonce
   * first, so they share this. The nonce is spent by whichever route it is
   * presented to, so one cannot be started and finished as the other. */
  const challenge = useCallback(async () => {
    const res = await fetch("/api/auth/identity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    const j = (await res.json()) as {
      nonce?: string;
      issuedAt?: string;
      error?: string;
    };
    if (!res.ok || !j.nonce || !j.issuedAt) {
      throw new Error(j.error ?? "Could not start that. Try again.");
    }
    return { nonce: j.nonce, issuedAt: j.issuedAt };
  }, [wallet]);

  const setListing = useCallback(
    async (list: boolean) => {
      if (!wallet) return;
      setBusy(true);
      setError(null);
      try {
        const { nonce, issuedAt } = await challenge();
        const signature = await sign(
          listMessage({ list, wallet, nonce, issuedAt }),
        );
        const res = await fetch("/api/auth/listing", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet, nonce, signature, list }),
        });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(j.error ?? "That did not go through.");
        await readIdentity();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not go through.");
      } finally {
        setBusy(false);
      }
    },
    [wallet, challenge, sign, readIdentity],
  );

  const unlink = useCallback(async () => {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    try {
      const { nonce, issuedAt } = await challenge();
      const signature = await sign(unlinkMessage({ wallet, nonce, issuedAt }));
      const res = await fetch("/api/auth/identity", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, nonce, signature }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "That did not go through.");
      setIdentity(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }, [wallet, challenge, sign]);

  const wrap = `rounded-xl border border-night-3 bg-night-2 p-4 ${className ?? ""}`;

  /* Hold the frame until the first read finishes. Rendering "Connect X" for a
   * beat and then replacing it with a handle reads as though something was
   * undone. */
  if (!loaded) {
    return (
      <div className={wrap}>
        <p className="text-sm text-cream-dim">Checking...</p>
      </div>
    );
  }

  return (
    <div className={wrap}>
      {identity ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {identity.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={identity.avatarUrl}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-full"
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-cream">
                @{identity.handle}
              </p>
              <p className="truncate font-mono text-xs text-cream-dim">
                {shortAddress(identity.wallet)}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-night-3 bg-night px-3 py-3">
            <p className="text-sm font-semibold text-cream">
              {identity.listed
                ? "You are on the public leaderboard."
                : "Public leaderboard: off"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-cream-dim">
              {identity.listed
                ? "Anyone can see that this handle owns this address, and read every transaction that address has ever made."
                : "Listing publishes your handle next to this address. Anyone who sees it can then read every transaction that address has ever made, including ones from before you opted in and ones that have nothing to do with football. Taking yourself off our page does not take it back from anyone who already looked."}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setListing(!identity.listed)}
              className="mt-3 rounded-lg border border-night-3 px-3 py-1.5 text-xs font-semibold text-cream hover:border-cream-dim disabled:opacity-50"
            >
              {identity.listed ? "Take me off" : "Put me on the leaderboard"}
            </button>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void unlink()}
            className="self-start text-xs text-cream-dim underline underline-offset-2 hover:text-cream disabled:opacity-50"
          >
            Unlink @{identity.handle}
          </button>
        </div>
      ) : pending ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {pending.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pending.avatarUrl}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-full"
              />
            ) : null}
            <div>
              <p className="text-sm font-semibold text-cream">
                X says you are @{pending.handle}
              </p>
              <p className="text-xs text-cream-dim">
                One more step: prove the wallet is yours too.
              </p>
            </div>
          </div>

          {connected && wallet ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void bind()}
                className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-night hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Waiting for your wallet..." : "Sign to link"}
              </button>
              <p className="text-xs text-cream-dim">
                Signing costs nothing and moves nothing. It is not a
                transaction.
              </p>
            </>
          ) : (
            <p className="text-sm text-cream-dim">
              Connect a wallet to finish. Your X sign-in is held for ten
              minutes.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-cream">
            Link your X account
          </p>
          <p className="text-xs leading-relaxed text-cream-dim">
            Two signatures, one from X and one from your wallet, prove the two
            belong to the same person. On its own it publishes nothing and no
            pool needs it. It is what the public leaderboard is built from, and
            appearing there is a separate choice you make afterwards.
          </p>
          {/* `usePathname` rather than `window.location`, which is undefined
              during the server render and would hydrate to a different href. */}
          <a
            href={`/api/auth/x/start?from=${encodeURIComponent(pathname)}`}
            className="mt-1 self-start rounded-lg border border-night-3 px-4 py-2 text-sm font-semibold text-cream hover:border-cream-dim"
          >
            Connect X
          </a>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-xs text-out">
          {error}
        </p>
      ) : null}
    </div>
  );
}
