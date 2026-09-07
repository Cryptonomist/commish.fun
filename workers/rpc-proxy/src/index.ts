/* A Cloudflare Worker that stands between the browser and Helius.
 *
 * WHY THIS EXISTS. `NEXT_PUBLIC_RPC_URL` is compiled into the JavaScript bundle
 * and is therefore public forever. Whatever authenticates that URL is public
 * too, whether the credential is an `?api-key=` parameter or, as it was here, a
 * secure-URL subdomain. The dashboard's domain rules did not apply to the
 * secure URL when tested: every origin got a 200 and an
 * `access-control-allow-origin: *`, and so did a request with no Origin at all.
 *
 * So the key moves here, into an encrypted worker variable, and the browser
 * gets this worker's URL instead. That URL carries no credential, so publishing
 * it costs nothing.
 *
 * WHAT THIS DOES NOT DO, said plainly because the opposite is widely assumed.
 * CORS is enforced by browsers. It stops another *website* using this endpoint
 * from someone's browser. It does nothing to curl, which ignores CORS entirely
 * and can send any Origin header it likes. That is why this worker checks the
 * Origin itself and refuses rather than merely declining to send back a
 * permissive CORS header, and it is also why that check is a speed bump rather
 * than a wall: a determined person forges the header and gets through.
 *
 * What it actually buys, and this is worth being precise about:
 *   · the credential is out of the bundle, so rotating it does not need a
 *     frontend deploy, and reading it is no longer a matter of opening devtools
 *   · casual cross-site use from a browser is blocked outright
 *   · the method allowlist caps this to being THIS app's RPC rather than a free
 *     general-purpose one
 * Sustained abuse by someone who forges an Origin needs rate limiting, which
 * belongs in front of this worker, not inside it.
 */

export interface Env {
  /** The plain Helius API key. NOT the secure-URL subdomain. Store encrypted. */
  HELIUS_API_KEY: string;
  /** Comma-separated origins allowed to use this proxy. */
  CORS_ALLOW_ORIGIN?: string;
  /** "devnet" or "mainnet". Defaults to devnet, deliberately: a proxy that
   *  silently talks to mainnet because a variable was unset is a worse failure
   *  than one that talks to the wrong test cluster. */
  HELIUS_CLUSTER?: string;
  /** Override the RPC method allowlist. Comma-separated. Empty string turns
   *  the allowlist off entirely, which should be a deliberate act. */
  ALLOWED_METHODS?: string;
}

/* Exactly what the app calls, and nothing else.
 *
 * Derived by grepping the client for `connection.*`, plus the two subscription
 * methods `confirmTransaction` uses under the hood. If a screen starts calling
 * something new, this list is where it fails, and the error names the method
 * so the fix takes a minute rather than an afternoon. */
const DEFAULT_METHODS = [
  "getAccountInfo",
  "getMultipleAccounts",
  "getBalance",
  "getLatestBlockhash",
  "getProgramAccounts",
  "getSignatureStatuses",
  "sendTransaction",
  "simulateTransaction",
  "getMinimumBalanceForRentExemption",
  "getTokenAccountBalance",
  "getHealth",
  // confirmTransaction subscribes rather than polls.
  "signatureSubscribe",
  "signatureUnsubscribe",
];

/** 1 MB. A signed Solana transaction is a few kilobytes; a megabyte of JSON-RPC
 *  is not this app and should not reach Helius on our key. */
const MAX_BODY_BYTES = 1_000_000;

const allowedOrigins = (env: Env): string[] =>
  (env.CORS_ALLOW_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);

/* An exact string comparison, not a suffix test.
 *
 * `endsWith("commish.fun")` is the tempting version and it matches
 * `evilcommish.fun` and `commish.fun.attacker.example`. Origins are a small
 * fixed list; compare them whole. */
const originAllowed = (origin: string | null, env: Env): boolean => {
  const list = allowedOrigins(env);
  if (list.length === 0) return false;
  if (!origin) return false;
  return list.includes(origin.replace(/\/+$/, ""));
};

/** Echo the caller's own origin, never `*`. `Vary: Origin` so a cache never
 *  serves one origin's allowance to another. */
function corsHeaders(origin: string | null, env: Env): Headers {
  const h = new Headers();
  if (originAllowed(origin, env) && origin) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
    h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    h.set("Access-Control-Allow-Headers", "content-type, solana-client");
    h.set("Access-Control-Max-Age", "86400");
  }
  return h;
}

const deny = (status: number, message: string, origin: string | null, env: Env) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: (() => {
      const h = corsHeaders(origin, env);
      h.set("content-type", "application/json");
      return h;
    })(),
  });

/** Which JSON-RPC methods a body is asking for. A batch is an array, and one
 *  disallowed call in a batch of twenty still has to fail the batch. */
function methodsIn(payload: unknown): string[] {
  const one = (v: unknown): string | null =>
    v && typeof v === "object" && typeof (v as { method?: unknown }).method === "string"
      ? (v as { method: string }).method
      : null;

  if (Array.isArray(payload)) {
    return payload.map(one).filter((m): m is string => m !== null);
  }
  const m = one(payload);
  return m ? [m] : [];
}

function upstream(env: Env, protocol: "https" | "wss"): string {
  const cluster = env.HELIUS_CLUSTER === "mainnet" ? "mainnet" : "devnet";
  return `${protocol}://${cluster}.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");

    if (!env.HELIUS_API_KEY) {
      /* Say what is wrong without saying anything useful to a stranger. The
       * operator reads this once, at deploy time. */
      return deny(503, "This proxy is not configured.", origin, env);
    }

    if (allowedOrigins(env).length === 0) {
      /* Refuse rather than fall open. An unset CORS_ALLOW_ORIGIN on a proxy
       * holding a live key is the one default that must not be "allow
       * everybody", and a proxy that works perfectly until someone notices it
       * is open is worse than one that never worked. */
      return deny(
        503,
        "This proxy has no allowed origins configured.",
        origin,
        env,
      );
    }

    if (request.method === "OPTIONS") {
      /* A preflight from an origin we do not allow gets a 204 with no CORS
       * headers, which the browser then refuses. That is the correct shape:
       * the preflight itself is not an error. */
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    /* THE ORIGIN CHECK, which is not the same thing as CORS.
     *
     * Withholding the CORS header only asks a browser to refuse. This refuses.
     * A request with no Origin is refused too: every browser sends one on a
     * cross-origin POST and on a WebSocket handshake, so an absent Origin here
     * means the caller is not a browser. */
    if (!originAllowed(origin, env)) {
      return deny(403, "Not an allowed origin.", origin, env);
    }

    /* WebSockets, because `confirmTransaction` needs them.
     *
     * web3.js confirms a transaction with `signatureSubscribe` rather than by
     * polling. Without this branch every confirmation in the app would hang
     * until the blockhash expired and then report a failure for a transaction
     * that had probably landed, which is the single worst error this product
     * can show somebody. The upgrade is passed straight through; Cloudflare
     * handles the socket pair. */
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return fetch(upstream(env, "wss"), request);
    }

    if (request.method !== "POST") {
      return deny(405, "This proxy takes POST.", origin, env);
    }

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return deny(413, "That request is too large.", origin, env);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return deny(400, "That is not JSON.", origin, env);
    }

    /* The method allowlist. Off only if ALLOWED_METHODS is explicitly empty. */
    const configured = env.ALLOWED_METHODS;
    const allowlist =
      configured === undefined
        ? DEFAULT_METHODS
        : configured
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);

    if (allowlist.length > 0) {
      const asked = methodsIn(payload);
      if (asked.length === 0) {
        return deny(400, "No JSON-RPC method in that request.", origin, env);
      }
      const refused = asked.find((m) => !allowlist.includes(m));
      if (refused) {
        /* Name it. This list will be wrong one day, when a screen starts
         * calling something new, and an error that says which method is the
         * difference between a one-line fix and an afternoon of guessing. */
        return deny(
          403,
          `This proxy does not forward ${refused}. Add it to ALLOWED_METHODS if the app needs it.`,
          origin,
          env,
        );
      }
    }

    /* A clean request upstream. The caller's headers are not forwarded: they
     * are attacker-influenced, and Helius needs exactly two of them. */
    const res = await fetch(upstream(env, "https"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        /* Helius reads this for its own analytics. It identifies the app, not
         * the person, and sending it keeps the dashboard's traffic breakdown
         * meaningful once everything arrives from one worker IP. */
        "solana-client": "commish.fun",
      },
      body,
    });

    const out = new Headers(corsHeaders(origin, env));
    out.set("content-type", "application/json");
    /* Nothing from an RPC is cacheable by a shared cache in a way we would want
     * here: balances and blockhashes change, and a cached blockhash is a
     * failed transaction. */
    out.set("cache-control", "no-store");

    return new Response(res.body, { status: res.status, headers: out });
  },
};
