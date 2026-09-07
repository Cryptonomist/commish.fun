# commish-rpc

A Cloudflare Worker between the browser and Helius, so the RPC credential is
not in the JavaScript bundle.

## Why

`NEXT_PUBLIC_RPC_URL` is compiled into the bundle and is public forever, along
with whatever authenticates it. The endpoint this replaced was a Helius *secure
URL*, where the credential is the subdomain rather than an `?api-key=`
parameter. Helius offers that form for code that cannot hide a key, and the
dashboard's domain rules did not apply to it when tested:

```
Origin: https://commish.fun            200   access-control-allow-origin: *
Origin: https://www.commish.fun        200   access-control-allow-origin: *
Origin: https://someone-else.example   200   access-control-allow-origin: *
no Origin header at all                200
```

So the key lives here as an encrypted secret, and the browser gets this
worker's URL, which carries no credential.

## What this does not do

CORS is enforced by browsers. It stops another *website* using this endpoint
from somebody's browser. It does nothing to `curl`, which ignores CORS and can
send any `Origin` it likes. This worker therefore checks the origin itself and
returns 403, rather than only withholding a header, but that is a speed bump
and not a wall.

What it does buy:

- the credential is out of the bundle, so rotating it needs no frontend deploy,
  and reading it is no longer a matter of opening devtools
- casual cross-site use from a browser is blocked outright
- the method allowlist keeps this as *this app's* RPC rather than a free
  general-purpose one

Sustained abuse by somebody who forges an `Origin` needs rate limiting, which
belongs in front of this worker rather than inside it.

## Deploy

From this directory:

```bash
npx wrangler login
npx wrangler secret put HELIUS_API_KEY
npx wrangler deploy
```

`HELIUS_API_KEY` is the **plain API key** from the Helius dashboard, not the
`merrilee-...-fast-devnet` secure-URL subdomain. The worker builds
`https://devnet.helius-rpc.com/?api-key=...` itself. Never put the key in
`wrangler.toml`: that file is committed, and a key in git history is the same
problem one layer down.

`wrangler deploy` prints the worker's URL. Point the app at it:

```
NEXT_PUBLIC_RPC_URL = https://commish-rpc.therealcryptonomist.workers.dev
```

and give the server its own direct key, which never reaches a browser:

```
RPC_URL = https://devnet.helius-rpc.com/?api-key=...
```

Redeploy the site; `NEXT_PUBLIC_` values are baked in at build time, so a
variable change alone does nothing.

## Check it worked

```bash
W=https://commish-rpc.therealcryptonomist.workers.dev
B='{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# allowed origin -> 200 ok
curl -s -X POST $W -H 'content-type: application/json' \
  -H 'origin: https://commish.fun' -d "$B"

# anyone else -> 403
curl -s -X POST $W -H 'content-type: application/json' \
  -H 'origin: https://someone-else.example' -d "$B"

# no origin, i.e. not a browser -> 403
curl -s -X POST $W -H 'content-type: application/json' -d "$B"

# a method the app does not call -> 403 naming it
curl -s -X POST $W -H 'content-type: application/json' \
  -H 'origin: https://commish.fun' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBlockProduction"}'
```

Then load a pool page and send a transaction. `confirmTransaction` uses a
WebSocket `signatureSubscribe`, so if the upgrade path is broken the symptom is
a confirmation that hangs for about a minute and then reports failure for a
transaction that landed. That is the one thing worth testing by hand.

## When a screen starts calling a new RPC method

The allowlist in `src/index.ts` is the app's actual call set. A new one fails
with a 403 that names the method. Add it there and redeploy, or set
`ALLOWED_METHODS` in `wrangler.toml` to override the list.
