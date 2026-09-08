/* GETTING INTO A WALLET FROM A PHONE BROWSER.
 *
 * On a desktop the wallet is a browser extension and the Wallet Standard finds
 * it. On a phone there is no extension and nothing to find, so Safari and
 * Chrome showed "No Solana wallet found in this browser" to somebody who has
 * Phantom installed and open on the same device. Accurate, useless, and a dead
 * end.
 *
 * The way in is the wallet's own in-app browser. Every one of these apps ships
 * one, and a universal link hands it a URL to open. Once the page is running
 * inside that browser the wallet injects itself, the Wallet Standard finds it
 * exactly as it does on a desktop, and nothing else in this app has to know
 * that any of it happened.
 *
 * WHAT CANNOT BE DONE, and it shapes the whole design: a web page cannot ask a
 * phone whether an app is installed. Both platforms removed that on purpose,
 * because it is a fingerprinting surface. So there is no "detect and dispatch"
 * to be written here — the honest move is to offer the link, which opens the
 * app when it is there, and to put the store beside it for when it is not.
 * Guessing and being wrong strands somebody on a blank page with no way back.
 *
 * THE LINKS ARE NOT INVENTED. Phantom's is the exact string
 * @solana/wallet-adapter-phantom redirects to (adapter.js:115), which is as
 * canonical as it gets. Solflare's is from its own deeplink documentation.
 * Both take the target and the referrer URL-encoded.
 */

export type Platform = "ios" | "android" | "desktop";

/**
 * Which kind of device this is, from a user agent string.
 *
 * Passed in rather than read off navigator so this stays a pure function the
 * tests can drive with real strings.
 */
export function detectPlatform(userAgent: string): Platform {
  const ua = userAgent.toLowerCase();
  /* Android first: an Android tablet's UA can contain neither "mobile" nor
   * anything iOS-like, and Chrome on Android says "Android" in every case. */
  if (ua.includes("android")) return "android";
  /* iPadOS 13+ reports itself as a Mac and is only distinguishable by having a
   * touch screen, which is why the caller may pass that in. iPhone and older
   * iPads still say so plainly. */
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    return "ios";
  }
  return "desktop";
}

/** iPadOS 13+ pretends to be a Mac. A Mac with a touch screen is an iPad. */
export function isIpadPretendingToBeAMac(
  userAgent: string,
  maxTouchPoints: number,
): boolean {
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export type MobileWallet = {
  id: string;
  name: string;
  /** Why somebody would pick this one. Kept short: this list is read while
   *  standing up. */
  note: string;
  /** Builds the universal link that opens `href` in the wallet's own browser,
   *  or null for a wallet that has no such link. */
  browse: ((href: string, origin: string) => string) | null;
  store: { ios: string; android: string };
};

/* Two wallets, not the four the wallet page lists.
 *
 * A store link for an app whose in-app browser cannot be opened by a link is a
 * dead end wearing a button, and only these two publish a documented browse
 * deeplink. The others are still on /wallet for people setting up a desktop,
 * where they work perfectly. Adding one here means finding its universal link
 * first, not guessing at the pattern from the other two. */
export const MOBILE_WALLETS: MobileWallet[] = [
  {
    id: "phantom",
    name: "Phantom",
    note: "The one most people already have.",
    /* Exactly what @solana/wallet-adapter-phantom redirects to. */
    browse: (href, origin) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(href)}?ref=${encodeURIComponent(origin)}`,
    store: {
      ios: "https://apps.apple.com/app/phantom-solana-wallet/id1598432977",
      android: "https://play.google.com/store/apps/details?id=app.phantom",
    },
  },
  {
    id: "solflare",
    name: "Solflare",
    note: "Solana only, and the other one with a documented link.",
    browse: (href, origin) =>
      `https://solflare.com/ul/v1/browse/${encodeURIComponent(href)}?ref=${encodeURIComponent(origin)}`,
    store: {
      ios: "https://apps.apple.com/app/solflare/id1580902717",
      android: "https://play.google.com/store/apps/details?id=com.solflare.mobile",
    },
  },
];

/** The store for this platform, or the iOS one on a desktop, where the list is
 *  only ever shown as a curiosity. */
export function storeFor(w: MobileWallet, platform: Platform): string {
  return platform === "android" ? w.store.android : w.store.ios;
}

/**
 * Whether the page is already running inside a wallet's in-app browser.
 *
 * If it is, an injected wallet is present and none of this applies — showing a
 * "open in Phantom" button to somebody already inside Phantom is the kind of
 * loop that makes a product feel broken.
 */
export function inWalletBrowser(userAgent: string): boolean {
  return /phantom|solflare|backpack|jupiter/i.test(userAgent);
}
