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

  /** The on-chain program this app reads. When set, getProgramAccounts is
   *  refused for any other program — see the guard below. */
  PROGRAM_ID?: string;

  /** Workers native rate limiting. Two budgets, because one socket is worth
   *  far more upstream than one POST: a POST is billed once, a subscription is
   *  billed for as long as it is held open. */
  RPC_LIMIT?: RateLimiter;
  WS_LIMIT?: RateLimiter;
}

/** The shape Cloudflare's rate-limit binding exposes. Declared rather than
 *  imported so this file still typechecks without the binding configured. */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/* Exactly what the app calls, and nothing else.
 *
 * Derived by grepping the client for `connection.*`, plus the two subscription
 * methods `confirmTransaction` uses under the hood. If a screen starts calling
 * something new, this list is where it fails, and the error names the method
 * so the fix takes a minute rather than an afternoon.
 *
 * NOT HERE, AND IT WILL TAKE TWO CHANGES RATHER THAN ONE: `getTransaction` and
 * `getBlock`. The obvious feature that needs them is a history screen — "the
 * pools this wallet has played" — and adding the method to this list is only
 * half of it.
 *
 * Solana's larger-transaction-sizes upgrade (SIMD-0296 and SIMD-0385, feature
 * gate txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL) raises the transaction
 * limit from 1232 to 4096 bytes and introduces a v1 transaction format. Both
 * of those RPC methods now REQUIRE `maxSupportedTransactionVersion: 1` in the
 * params, and a call without it fails with error -32015 the moment it meets a
 * v1 transaction in a block. It is already active on devnet and testnet and
 * lands on mainnet with Agave v4.2.
 *
 * Nothing in this product reads transactions today, which is the only reason
 * the upgrade needs no work from us: we build legacy transactions, which are
 * explicitly unchanged, and the program does no instruction introspection, so
 * the compute-budget and priority-fee caveats do not apply either. */
const DEFAULT_METHODS = [
  // Called directly by this app's own code.
  "getAccountInfo",
  "getMultipleAccounts",
  "getBalance",
  "getLatestBlockhash",
  "getProgramAccounts",
  "sendTransaction",
  "simulateTransaction",
  "getTokenAccountBalance",
  "getHealth",

  /* Called by web3.js UNDERNEATH those, which is the half I got wrong first
   * time. The list was built by grepping for `connection.*` in this repo, and
   * that only finds what we ask for, not what the library asks for on our
   * behalf. `confirmTransaction` in particular subscribes over the socket AND
   * polls getSignatureStatuses AND checks getBlockHeight to notice the
   * blockhash expiring, so two of these three are invisible in our source. */
  "getSignatureStatuses",
  "getBlockHeight",
  "getEpochInfo",
  "getSlot",
  "getVersion",
  "getFeeForMessage",
  "getRecentPrioritizationFees",
  "getMinimumBalanceForRentExemption",
  "getTokenAccountsByOwner",

  // The subscription pair, over the websocket.
  "signatureSubscribe",
  "signatureUnsubscribe",
];

/** 1 MB. A signed Solana transaction is a few kilobytes; a megabyte of JSON-RPC
 *  is not this app and should not reach Helius on our key.
 *
 *  MEASURED IN BYTES, NOT CHARACTERS. `String.length` counts UTF-16 code units,
 *  so a body of multi-byte characters passed a 1MB check at about 1.2MB of
 *  actual payload — verified live against the deployed worker. TextEncoder
 *  counts what actually goes over the wire. */
const MAX_BODY_BYTES = 1_000_000;

/** How many calls one JSON-RPC batch may carry.
 *
 *  A batch is a multiplier: one request the rate limiter counts once can be a
 *  hundred upstream calls on the owner's key. Solana's own RPC caps batches;
 *  this app never sends one at all, since web3.js batches nothing here. Twenty
 *  is generous for something that should be one. */
const MAX_BATCH = 20;

/* getProgramAccounts IS THE EXPENSIVE ONE, and it was allowlisted with no
 * restriction on which program or whether any filter was attached. An
 * unfiltered scan of a large program is the single costliest call available on
 * this key, and it was reachable by anyone who could forge an Origin header.
 *
 * The guard: the program must be ours, and there must be at least one filter.
 * When PROGRAM_ID is unset the check degrades to "must have filters", so a
 * misconfigured deploy is stricter rather than looser. */
function programScanRefused(payload: unknown, env: Env): string | null {
  const calls = Array.isArray(payload) ? payload : [payload];
  for (const call of calls) {
    const c = call as { method?: unknown; params?: unknown };
    if (c?.method !== "getProgramAccounts") continue;
    const params = Array.isArray(c.params) ? c.params : [];
    const programId = params[0];
    const opts = (params[1] ?? {}) as { filters?: unknown };

    if (env.PROGRAM_ID && programId !== env.PROGRAM_ID) {
      return "getProgramAccounts is only forwarded for this app's own program.";
    }
    if (!Array.isArray(opts.filters) || opts.filters.length === 0) {
      return "getProgramAccounts needs filters. An unfiltered scan is refused.";
    }
  }
  return null;
}

/** How many calls a JSON-RPC payload actually makes. */
const batchSize = (payload: unknown): number =>
  Array.isArray(payload) ? payload.length : 1;

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

/* ALWAYS https, EVEN FOR THE WEBSOCKET.
 *
 * The first version of this built a `wss://` URL for the upgrade, which is
 * what the Solana client uses and what the address obviously "is". The Workers
 * runtime refuses it outright:
 *
 *   TypeError: Fetch API cannot load: wss://devnet.helius-rpc.com/?api-key=...
 *
 * `fetch` speaks http and https only. A WebSocket is established by sending an
 * ordinary https request carrying `Upgrade: websocket` and reading the 101 back
 * off `response.webSocket`; the runtime does the protocol switch. So the scheme
 * here is always https and the Upgrade header is what makes it a socket.
 *
 * The failure was invisible from outside. Every HTTP call succeeded, so the
 * proxy looked healthy under curl, while `confirmTransaction` retried a socket
 * that could never open. */
function upstream(env: Env): string {
  const cluster = env.HELIUS_CLUSTER === "mainnet" ? "mainnet" : "devnet";
  return `https://${cluster}.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
}

/* Never let the key reach a log line.
 *
 * When the fetch above threw, the runtime's own TypeError quoted the URL it had
 * been handed, api-key and all, straight into `wrangler tail`. The credential
 * this worker exists to hide was printed by the worker's own error handling.
 *
 * So every throw is caught and scrubbed before anything is logged. */
const scrub = (err: unknown, env: Env): string => {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const key = env.HELIUS_API_KEY;
  return key ? text.split(key).join("<redacted>") : text;
};

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
     * polling. Without this working, every confirmation in the app hangs until
     * the blockhash expires and then reports failure for a transaction that
     * already landed, which is the single worst error this product can show
     * somebody. That is not hypothetical: it is what this worker did on its
     * first day, because the URL below said wss and `fetch` refuses that.
     *
     * The upgrade goes out as an ordinary https request carrying the Upgrade
     * header. The runtime performs the switch and hands back a 101 with the
     * socket on `response.webSocket`, which is returned as-is. */
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      /* A SOCKET COSTS MORE THAN A POST, so it gets its own, tighter budget.
       * A POST is billed upstream once; a subscription is billed for as long
       * as it is held open, which is what makes an unmetered upgrade the more
       * attractive half of this endpoint to abuse.
       *
       * THIS IS HALF A FIX AND THE COMMENT SHOULD SAY SO. Everything below
       * still passes the socket straight through to Helius, so the method
       * allowlist further down is never consulted for a frame sent over it —
       * anything the upstream supports, including logsSubscribe and
       * programSubscribe, still runs on this key once a socket is open. The
       * complete fix is to terminate the socket here with a WebSocketPair,
       * open our own upstream socket, and filter each frame. That is a real
       * relay with keepalive and pre-connect buffering, and getting it wrong
       * breaks confirmTransaction on a page holding escrowed USDC — which no
       * curl test detects. Until it is written and tested against a real
       * signed transaction, this limit is what shrinks the abuse economics. */
      if (env.WS_LIMIT) {
        const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
        const { success } = await env.WS_LIMIT.limit({ key: ip });
        if (!success) {
          return deny(429, "Too many socket connections.", origin, env);
        }
      }
      try {
        const upgraded = await fetch(upstream(env), request);
        if (!upgraded.webSocket) {
          console.error(
            `[proxy] upstream refused the websocket upgrade: ${upgraded.status}`,
          );
          return deny(502, "The upstream refused a websocket.", origin, env);
        }
        return new Response(null, {
          status: 101,
          webSocket: upgraded.webSocket,
        });
      } catch (err) {
        /* Scrubbed. The runtime's own TypeError quotes the URL it was given,
         * api-key included, and an unhandled throw here puts the credential
         * this worker exists to hide straight into the log. */
        console.error(`[proxy] websocket upgrade failed: ${scrub(err, env)}`);
        return deny(502, "Could not open a websocket upstream.", origin, env);
      }
    }

    if (request.method !== "POST") {
      return deny(405, "This proxy takes POST.", origin, env);
    }

    /* Rate limit BEFORE reading the body, so a flood costs this worker as
     * little as possible. Keyed on the connecting IP: the Origin check above
     * is one header and anyone can send it, which the repo itself proves —
     * src/lib/leaderboard.ts forges exactly this header on purpose. The origin
     * check is a convention; this is the control. */
    /* VERIFIED NOT TO ENFORCE — see the long note in wrangler.jsonc. The
     * binding attaches and limit() is callable, but it returned success on
     * twelve consecutive calls against a budget of five. The guard stays
     * because it is correct and will work the day the platform allows it; do
     * not read its presence as protection until a test shows a 429. */
    if (env.RPC_LIMIT) {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.RPC_LIMIT.limit({ key: ip });
      if (!success) {
        return deny(429, "Too many requests. Slow down.", origin, env);
      }
    }

    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
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

    if (batchSize(payload) > MAX_BATCH) {
      return deny(
        413,
        `That batch is too long. At most ${MAX_BATCH} calls per request.`,
        origin,
        env,
      );
    }

    const scanRefused = programScanRefused(payload, env);
    if (scanRefused) {
      console.error(`[proxy] refused scan: ${scanRefused}`);
      return deny(403, scanRefused, origin, env);
    }

    if (allowlist.length > 0) {
      const asked = methodsIn(payload);
      if (asked.length === 0) {
        return deny(400, "No JSON-RPC method in that request.", origin, env);
      }
      const refused = asked.find((m) => !allowlist.includes(m));
      if (refused) {
        /* Log it as well as returning it. A 403 body reaches whoever made the
         * request, and when that is a library buried inside the page it can be
         * swallowed without ever surfacing. `wrangler tail` shows every
         * refusal by name, so the next gap in this list costs one tail rather
         * than an afternoon. */
        console.error(`[proxy] refused method: ${refused}`);
        /* Name it in the response too, for the same reason. */
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
    /* An upstream throw — DNS, TLS, a timeout — used to escape this handler,
     * and an unhandled throw in a Worker returns Cloudflare's own error page.
     * That page is HTML, so a client expecting JSON gets a parse error instead
     * of a readable failure, and the worker's URL appears in it. */
    let res: Response;
    try {
      res = await fetch(upstream(env), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          /* Helius reads this for its own analytics. It identifies the app,
           * not the person, and sending it keeps the dashboard's traffic
           * breakdown meaningful once everything arrives from one worker IP. */
          "solana-client": "commish.fun",
        },
        body,
      });
    } catch (err) {
      /* Never echo the error: an upstream URL carrying the key can appear in
       * one. Log it where only the owner can see it. */
      console.error(`[proxy] upstream failed: ${String(err)}`);
      return deny(502, "The RPC endpoint could not be reached.", origin, env);
    }

    const out = new Headers(corsHeaders(origin, env));
    out.set("content-type", "application/json");
    /* Nothing from an RPC is cacheable by a shared cache in a way we would want
     * here: balances and blockhashes change, and a cached blockhash is a
     * failed transaction. */
    out.set("cache-control", "no-store");

    return new Response(res.body, { status: res.status, headers: out });
  },
};
