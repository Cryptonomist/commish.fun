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
 * THREE MORE DIRECTIVES ARE ENFORCED ANYWAY, because every one of those four
 * blockers is about where code, sockets and images may come FROM — script-src,
 * connect-src, img-src — and these three constrain none of those. They were
 * checked against this app one at a time rather than assumed:
 *
 *   base-uri 'self' — a single injected <base> tag silently re-points every
 *   relative URL on the page, including the fetches to /api/auth/*. There is no
 *   <base> anywhere in src, so nothing can regress by turning this on, and it
 *   is the cheapest defence there is against the one injection that survives
 *   having no XSS sinks.
 *
 *   form-action 'self' — both forms in this app (pools/new and p/[pool]) are
 *   onSubmit handlers with no action attribute, so neither ever navigates.
 *   Verified before adding, because an external form post is the one thing this
 *   would break.
 *
 *   object-src 'none' — no <object>, <embed> or <applet> in src. Plugin content
 *   is a scripting surface this app has no use for.
 *
 * None of the three needs a nonce, which is what makes them separable from the
 * staged rollout the rest of the policy still needs.
 *
 * STRICT-TRANSPORT-SECURITY IS HERE NOW, and this comment used to say the
 * opposite: that Vercel injects it at the edge, that RFC 6797 §8.1 makes a
 * second header a silent race, and that includeSubDomains "belongs in the
 * Vercel dashboard, not in this file".
 *
 * The RFC is quoted correctly — §8.1 really does say a UA processes only the
 * first STS header — but the conclusion was wrong, because there is no such
 * dashboard setting to move it to. Vercel documents one way to change this
 * header and it is this file: "You can modify the Strict-Transport-Security
 * header by configuring custom response headers in your project."
 * (vercel.com/docs/cdn-security/encryption.) The platform default applies to a
 * response that does not already carry one; setting it here replaces it rather
 * than racing it.
 *
 * What the default gets wrong is the scope, not the age. A custom domain gets
 * `max-age=63072000` and nothing else, so the two years covers commish.fun and
 * not one subdomain of it — while rpc.commish.fun is a planned host for the RPC
 * proxy. So the age is kept and includeSubDomains is added.
 *
 * NO PRELOAD. That is a hardcoded list inside the browsers themselves, removal
 * is slow and at somebody else's discretion, and it commits every future
 * subdomain forever. includeSubDomains is reversible in two years; preload is
 * not reversible on any schedule we control.
 */
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
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
