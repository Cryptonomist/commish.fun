"use client";

/* Sharing a pool, at the two moments somebody wants to.
 *
 * A pool that has not filled is not a pool. The commissioner creates one,
 * lands on a page with an address on it, and then has to work out how to get
 * the link to nine friends. Until now the answer was to select the URL bar,
 * which is a poor answer on a phone and the place most of this sharing happens.
 *
 * The order of the buttons is the order people actually use them. Copy is
 * first because it beats every share sheet for a link going into a group chat
 * somebody is already in. The native sheet is second where it exists, because
 * on a phone it reaches every app at once. The named services come last.
 *
 * The text is built once and reused, so what lands in a DM and what lands on X
 * describe the same pool. Only X gets a shorter version, because it is the
 * only one with a length limit worth respecting.
 */

import { useCallback, useEffect, useState } from "react";

import { formatUsdc } from "@/lib/format";

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
const IS_MAINNET = CLUSTER === "mainnet-beta" || CLUSTER === "mainnet";

export type SharePoolProps = {
  /** The pool's address. The URL is built here so every caller shares the
   *  same one. */
  pool: string;
  name: string;
  buyIn: bigint;
  /** Null when the pool has no cap worth mentioning. */
  spotsLeft?: number | null;
  kind: "Survivor" | "Loser" | "League";
  className?: string;
};

/* What the money is called.
 *
 * On devnet the buy-in is test USDC and worth nothing. Writing "$25 buy-in"
 * into a message somebody forwards to a friend would be a lie told in the one
 * place we cannot annotate, so the amount says what it is. */
function stake(buyIn: bigint): string {
  if (buyIn === BigInt(0)) return "Free to join";
  const amount = formatUsdc(buyIn);
  return IS_MAINNET ? `${amount} buy-in` : `${amount} buy-in in test USDC`;
}

function shareText(p: SharePoolProps): string {
  const spots =
    typeof p.spotsLeft === "number" && p.spotsLeft > 0
      ? ` ${p.spotsLeft} ${p.spotsLeft === 1 ? "spot" : "spots"} left.`
      : "";
  const testnet = IS_MAINNET ? "" : " Test pool on Solana devnet, no real money.";
  return `Join my ${p.kind} pool "${p.name}" on Commish. ${stake(p.buyIn)}, held in escrow that nobody can touch, not even me.${spots}${testnet}`;
}

/** X counts a link as 23 characters whatever its length, so the prose has room
 *  but not unlimited room. This drops the escrow explanation, which is on the
 *  page anyway. */
function shortText(p: SharePoolProps): string {
  const spots =
    typeof p.spotsLeft === "number" && p.spotsLeft > 0
      ? ` ${p.spotsLeft} left.`
      : "";
  const testnet = IS_MAINNET ? "" : " (devnet, test money)";
  return `Join my ${p.kind} pool "${p.name}" on Commish. ${stake(p.buyIn)}.${spots}${testnet}`;
}

type Target = {
  key: string;
  label: string;
  href: (url: string, text: string, short: string) => string;
  icon: React.ReactNode;
};

const I = (d: string) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
);

const TARGETS: Target[] = [
  {
    key: "x",
    label: "X",
    href: (url, _t, short) =>
      `https://x.com/intent/tweet?text=${encodeURIComponent(short)}&url=${encodeURIComponent(url)}`,
    icon: I(
      "M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L5.9 22H2.8l7.5-8.6L2.4 2h6.6l4.5 6.6L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z",
    ),
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    href: (url, text) =>
      `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    icon: I(
      "M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.8 14.2c-.2.7-1.2 1.3-1.9 1.4-.5.1-1.1.1-1.8-.1a13 13 0 0 1-5.7-4.6c-.4-.6-1-1.6-1-2.6s.5-1.6.7-1.8c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.5 1.9 1 .9 1.9 1.2 2.2 1.3.2.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l1.8.9c.2.1.4.2.4.3.1.1.1.5-.1 1Z",
    ),
  },
  {
    key: "telegram",
    label: "Telegram",
    href: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    icon: I(
      "M21.9 4.3 18.6 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1L18.1 7c.4-.4-.1-.6-.6-.2L7 13.4l-4.9-1.5c-1-.3-1.1-1 .2-1.5l19.2-7.4c.9-.3 1.6.2 1.4 1.3Z",
    ),
  },
  {
    key: "sms",
    label: "Messages",
    href: (url, text) => `sms:?&body=${encodeURIComponent(`${text} ${url}`)}`,
    icon: I(
      "M12 3C6.9 3 3 6.6 3 11c0 2.5 1.3 4.7 3.3 6.1V21l3.2-1.8c.8.2 1.6.3 2.5.3 5.1 0 9-3.6 9-8s-3.9-8.5-9-8.5Z",
    ),
  },
  {
    key: "email",
    label: "Email",
    href: (url, text) =>
      `mailto:?subject=${encodeURIComponent("Join my Commish pool")}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
    icon: I(
      "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm9 8L4.4 7h15.2L12 13Z",
    ),
  },
];

export default function SharePool(props: SharePoolProps) {
  const { className } = props;
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  /* Checked after mount rather than during render. `navigator.share` does not
   * exist on the server, and branching on it while rendering would give the
   * server and the browser different markup. */
  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  /* Built in the browser, so a pool shared from a preview deployment carries
   * that host rather than a hardcoded one that would 404 for the recipient. */
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl(`${window.location.origin}/p/${props.pool}`);
  }, [props.pool]);

  const text = shareText(props);
  const short = shortText(props);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard access is refused in some browsers and over plain http.
       * Selecting the text is the fallback, and saying nothing here is better
       * than an error nobody can act on. */
    }
  }, [url]);

  const nativeShare = useCallback(async () => {
    try {
      await navigator.share({ title: props.name, text, url });
    } catch {
      // Cancelling the sheet throws. That is not an error.
    }
  }, [props.name, text, url]);

  if (!url) return null;

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <p className="text-xs font-bold tracking-[0.18em] text-cream-dim">
        INVITE PEOPLE
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-lg bg-action px-4 py-2 text-sm font-bold text-night transition hover:brightness-110"
        >
          {copied ? "Copied" : "Copy link"}
        </button>

        {canNativeShare ? (
          <button
            type="button"
            onClick={() => void nativeShare()}
            className="rounded-lg border border-night-3 px-4 py-2 text-sm font-bold text-cream transition hover:border-cream-dim"
          >
            Share
          </button>
        ) : null}

        {TARGETS.map((t) => (
          <a
            key={t.key}
            href={t.href(url, text, short)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Share on ${t.label}`}
            title={t.label}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-night-3 text-cream-dim transition hover:border-cream-dim hover:text-cream"
          >
            {t.icon}
          </a>
        ))}
      </div>

      <p className="break-all font-mono text-xs text-cream-dim">{url}</p>
    </div>
  );
}
