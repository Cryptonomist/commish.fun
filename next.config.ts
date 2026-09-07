import type { NextConfig } from "next";

/* ── SECURITY HEADERS ─────────────────────────────────────────────────────────
 *
 * The site shipped with none of these. An audit confirmed it against the live
 * site: curl of /, /play, /p/<id> and /api/auth/identity returned no CSP and no
 * X-Frame-Options on any of them, so commish.fun was framable by any origin —
 * on a site whose pages call signTransaction.
 *
 * WHAT IS HERE IS THE HALF THAT COSTS NOTHING, and each line was checked
 * against what this app actually does rather than pasted from a checklist:
 *
 *   frame-ancestors / X-Frame-Options — nothing here is meant to be embedded.
 *   Verified: no iframe anywhere in src, no actions.json, no .well-known. The
 *   phone wallet flows are untouched, because Phantom and Solflare open pages
 *   in a top-level WebView rather than an iframe. If an embeddable surface is
 *   ever wanted, this is the line to revisit — deliberately.
 *
 *   nosniff — the API routes return JSON, and none of it should ever execute
 *   because a browser guessed a type.
 *
 *   Referrer-Policy — a pool URL contains the pool id, and it should not travel
 *   to a third party in a Referer header when somebody clicks an outbound link.
 *
 *   Permissions-Policy — this app needs no camera, microphone, geolocation or
 *   payment API, so it says so. USB and HID are deliberately NOT disabled:
 *   hardware wallets speak WebHID and WebUSB, and a Ledger user connecting
 *   through Phantom is exactly the case not to break for a tidier header.
 *
 * WHAT IS DELIBERATELY NOT HERE. A full Content-Security-Policy. The same audit
 * found four verified ways one would break this app: sixteen inline hydration
 * scripts on a production page, the wallet extensions' injected scripts, the
 * RPC WebSocket needing connect-src, and the wallet adapter's data: icons. That
 * needs a staged Report-Only rollout and a real transaction test, not a guess.
 * Note when doing it that frame-ancestors is REPORTED BUT NOT ENFORCED in
 * Report-Only mode — which is exactly why the framing directives are enforced
 * here and now instead of waiting for the rest of the policy.
 *
 * ALSO NOT HERE: Strict-Transport-Security. Vercel injects it per-domain at the
 * edge, and RFC 6797 §8.1 says a user agent honours only the FIRST such header
 * it receives. Emitting a second one risks the weaker of the two winning,
 * silently, on ordering nobody controls. includeSubDomains belongs in the
 * Vercel dashboard, not in this file.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  /* `X-Powered-By: Next.js` tells an attacker which framework, and by
   * implication which CVE list to work through. It buys nothing. */
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },

  /* `ws` ships two optional native accelerators, and the Solana mobile-wallet
   * packages pull `ws` in transitively. Neither is needed in a browser bundle,
   * and neither builds without native toolchain steps that npm skipped here, so
   * webpack is told not to resolve them rather than failing on a missing
   * index.js. `pino-pretty` is the same story from the logging side. */
  webpack: (config) => {
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      "bufferutil",
      "utf-8-validate",
      "pino-pretty",
    ];
    return config;
  },
};

export default nextConfig;
