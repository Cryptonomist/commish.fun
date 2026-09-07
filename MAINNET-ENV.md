# The mainnet environment change

Every variable that has to move, where it lives, and what breaks if it does
not. Written from the code rather than from memory: the list is what
`src/`, `scripts/` and `workers/rpc-proxy/src/` actually read.

`scripts/mainnet-cutover.sh` prints the Vercel block at the end of its run, and
deliberately does not set it. A wrong value there points real wallets at the
wrong chain, and that should be a person deciding rather than a script
assuming.

---

## 1. Vercel — Production

**Every `NEXT_PUBLIC_` value is compiled into the bundle at build time.**
Changing one without redeploying changes nothing at all, and the site keeps
serving the old value with no error anywhere. Redeploy after saving.

| Variable | Now | Mainnet | If it is wrong |
|---|---|---|---|
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `devnet` | `mainnet-beta` | Explorer links point at the wrong chain; the wallet page keeps showing its "this runs on test money" panel, which gates on this exact value |
| `NEXT_PUBLIC_USDC_MINT` | devnet USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | `ConfigGuard` shows a wrong-network banner and pool creation fails at `WrongMint` |
| `NEXT_PUBLIC_PROGRAM_ID` | `Adb5CFrY…shjPa` | **unchanged** | — the same keypair deploys to both clusters, so this address is the same on mainnet |
| `NEXT_PUBLIC_RPC_URL` | see below | `https://commish-rpc.therealcryptonomist.workers.dev` | **See the warning below.** Unset falls back to Solana Labs' public devnet endpoint |
| `NEXT_PUBLIC_FAST_CLOCK` | — | **empty** | Shortened client-side timing that disagrees with the program |
| `NEXT_PUBLIC_SITE_URL` | `https://commish.fun` | unchanged | X OAuth redirect and OG/canonical URLs break if it does not match the real origin |
| `RPC_URL` *(server only, not `NEXT_PUBLIC_`)* | devnet | a **mainnet** Helius URL | Server-side leaderboard reads hit the wrong chain |

### The one to check first

`NEXT_PUBLIC_RPC_URL` is the single highest-stakes value here, and it is the one
item from the legal audit that is still unverified. The privacy policy now makes
specific claims that depend on it:

> Requests go first to a proxy we run on Cloudflare, which rebuilds each one and
> forwards the blockchain call by itself … Helius sees our proxy's network
> address rather than yours.

`src/components/Providers.tsx:35` falls back to `clusterApiUrl("devnet")` when
the variable is unset. So if production does not have it set to the worker,
**five paragraphs of the privacy policy are false in the visitor's favour** —
the browser is talking straight to a public RPC and the proxy is not in the path
at all. `.env.local` on the dev machine points at `api.devnet.solana.com`, which
is why this cannot be settled from the repository.

Check it before anything else. It is a read, not a change.

---

## 2. The RPC proxy worker

Two changes, both handled by `scripts/mainnet-cutover.sh` step 6.

```diff
  // workers/rpc-proxy/wrangler.jsonc
   "vars": {
-    "HELIUS_CLUSTER": "devnet",
+    "HELIUS_CLUSTER": "mainnet",
     "CORS_ALLOW_ORIGIN": "https://commish.fun,https://www.commish.fun"
   }
```

```diff
- npx wrangler deploy
+ npx wrangler deploy --var PROGRAM_ID:Adb5CFrY4vYiGQnTQ5qsaPPMUAWKyxwVAQtFHWcshjPa
```

`PROGRAM_ID` is the allowlist for `getProgramAccounts`. Left unset, the guard at
`workers/rpc-proxy/src/index.ts:135-140` degrades to "the scan must carry
filters" — so anyone who finds the proxy can enumerate **any** program on Solana
through our key, provided they attach a filter. On devnet that is somebody being
rude with a free tier. On mainnet it is a paid key indexing the chain for a
stranger, billed to us. `wrangler.jsonc` leaves it commented out on purpose,
because the id belongs with the deploy rather than in the file.

`CORS_ALLOW_ORIGIN` already names the production domains and needs no change.
There is no wildcard and no default: the worker refuses every request while it
is empty, which is the correct thing for a proxy holding a live key.

### The secret

```bash
cd workers/rpc-proxy && npx wrangler secret put HELIUS_API_KEY
```

It must be a key valid for **mainnet**. A devnet key against a mainnet cluster
fails at the upstream, which surfaces as every read failing at once.

---

## 3. Key rotation, and why it is not optional

The current Helius key has been reachable in the client bundle. Rotate it as
part of this cutover, additively — create the new key, deploy the worker with
it, confirm traffic flows, and only then revoke the old one. Revoking first
takes the site down until the deploy lands.

---

## 4. After the deploy, before telling anyone the pool is open

1. Load a pool page and confirm the wallet reports **mainnet**.
2. Send one real transaction and watch it confirm. `confirmTransaction` uses a
   websocket, and a broken proxy upgrade shows up as a confirmation that hangs
   for a minute and then reports failure — for a transaction that landed. This
   is the failure most worth buying with one real dollar.
3. Create a pool with a `$0` buy-in and settle it end to end. It exercises
   `advance_week`, which names the fee treasury's token account on every call
   even at a zero fee. `scripts/init-config.ts:98` creates that account, but
   confirm it rather than assume: if it is missing, pools take buy-ins and then
   cannot settle.

---

## 5. Not an environment variable, but it ships with them

`src/app/robots.ts` asks search engines to stay away, and `layout.tsx` carries a
matching `noindex`. Both exist because the pages describe buy-ins and pots in
the present tense while the money was fake. `mainnet-cutover.sh` step 5 removes
them.

Worth a deliberate decision rather than letting a script make it: a launched
product nobody can find is a bug that announces itself with complete silence.
Nothing fails, no build breaks, the site simply never appears.
