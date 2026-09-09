# Security review — 2026-09-08

Full read of the on-chain program, every route and library that touches
money, auth or a secret, both Workers, the repository and its history, the
dependency trees (npm ×3, cargo), the keys on this machine, the GitHub
project settings, and the live infrastructure (headers, TLS, DNS, proxy
behaviour, workers.dev exposure). Where a claim could be tested against the
running system it was, and the evidence is quoted.

No secret value appears in this document. Public keys do; they are on chain.

## Verdict

The code is in good shape: the program's money paths are correctly
constrained, the identity flow is designed so that no cookie can spend or
consent to anything, secrets are handled with care in both Workers, and the
live headers, TLS floor and DNS are where they should be.

The material risk is not code. It is **key custody**: one hot key on this
machine is the program's upgrade authority, its config admin and its deploy
payer. Every guarantee lib.rs makes ("there is no instruction that moves money
to an arbitrary destination") is a property of the bytes currently deployed,
and that key can replace the bytes. That is finding 1, and it is the one
thing to do before real-money pools grow.

## Status, 2026-09-09

Done and verified since the review:

- **Dependabot** alerts and security updates are on (both endpoints answer
  204 / `enabled: true`).
- **`main` is protected**: force pushes and deletions blocked, enforced for
  admins too. To force-push deliberately, switch the rule off first in
  Settings → Branches.
- **The program changes from finding 4 are written and tested**, not yet on
  mainnet: the two-step admin handover (`propose_admin`, `accept_admin`,
  `cancel_admin_transfer`, a new `AdminTransfer` PDA), `MAX_FEE_BPS = 1000`
  enforced at init and on every update, and `close_member` for a member a
  settled pool can never owe. 38 LiteSVM tests (10 new), the Rust size test,
  200 web tests, 166 encoding checks and `tsc` all pass. The binary is 510,024
  bytes and fits the 534,048-byte ProgramData account, so no extend is needed.
- `scripts/admin-transfer.ts` runs the handover (`status`, `propose`,
  `cancel`, `accept`, `accept --print` for a multisig), and
  `scripts/upgrade-mainnet.sh` gained `--buffer` and `--verify` so an upgrade
  can be executed by a multisig that cannot run `solana program deploy`.
- `.env.example` no longer points at the retired workers.dev host.

Still the owner's, in the order given in the checklist at the end: move the
upgrade authority, run the upgrade, hand the admin over, hardware 2FA, the
Vercel settings, shred the local oracle key, the Helius alert, a
`security.txt` contact, SPF/DMARC.

## Findings, ranked

### 1. HIGH — the program upgrade authority is a hot key on a developer machine

Evidence:

    solana program show Adb5CFrY4vYiGQnTQ5qsaPPMUAWKyxwVAQtFHWcshjPa -u m
      Authority: HoYb6BCszJUY89WhKt2itTpxtLHMJKuoEwXwQPdbhtVu

The same key is `Config.admin` (set by `init_config`), the deploy payer (3.19
SOL), and the Solana CLI default at `~/.config/solana/id.json`.

What someone with this WSL filesystem gets: the ability to upgrade the program
to one with a drain instruction and empty every vault; set `default_fee_bps`
to 10 000 (100 %) for every pool created afterwards; pause creation; replace
the oracle poster with their own key.

Fix (owner; irreversible, so it is not something to run from a chat):

1. Create a Squads v4 multisig at app.squads.so, threshold **2 of 3**: this
   key, a hardware or offline key, and a backup key kept elsewhere. Note the
   Squad's **vault** address.
2. Move the upgrade authority to the vault:

       ~/.local/share/solana/install/active_release/bin/solana program set-upgrade-authority \
         Adb5CFrY4vYiGQnTQ5qsaPPMUAWKyxwVAQtFHWcshjPa \
         --new-upgrade-authority <SQUADS_VAULT_ADDRESS> \
         --skip-new-upgrade-authority-signer-check \
         -u m -k ~/.config/solana/id.json

   then confirm with `solana program show … -u m` that `Authority:` is the
   vault.
3. Future upgrades become: `solana program write-buffer target/deploy/commish.so -u m`,
   `solana program set-buffer-authority <BUFFER> --new-buffer-authority <VAULT> -u m`,
   then propose the upgrade in Squads (Developers → Programs) and approve from
   two devices. `scripts/upgrade-mainnet.sh` needs updating to that flow at the
   same time; that is a small change and can be made when the decision is
   taken.

If a multisig is more than wanted right now, the smaller step is a **cold**
authority: generate a keypair on an offline machine onto an encrypted USB
(`solana-keygen new -o <usb>/upgrade-authority.json`), pass that file as
`--new-upgrade-authority` so it co-signs the transfer, and keep it off this
machine. Either way the hot key stops being able to rewrite the program.

`Config.admin` cannot be moved today — see finding 4a.

### 2. HIGH — the GitHub account is a production deploy credential; alerts are off

Evidence (`gh api`):

- repository private; one collaborator (admin); no deploy keys; no webhooks;
  no Actions workflows or secrets — all good
- `branches/main/protection` → 404 "Branch not protected"
- `vulnerability-alerts` → 404 (Dependabot alerts **disabled**)
- `automated-security-fixes` → `enabled: false`

Vercel deploys `main` on push, so whoever can push to `main` deploys to
production with the server secrets attached. The account, not the repo, is the
credential.

Fix (owner):

- Security keys (hardware 2FA) on **GitHub, Vercel, Cloudflare, Helius, and the
  X developer portal**. These five accounts are the deploy chain.
- Dependabot alerts and security updates — **done 2026-09-09** with

      gh api -X PUT repos/Cryptonomist/commish.fun/vulnerability-alerts
      gh api -X PUT repos/Cryptonomist/commish.fun/automated-security-fixes

- `main` protected against force pushes and deletions — **done 2026-09-09**.
  With one maintainer, required reviews add nothing; the two blocks do.
- Vercel: Deployment Protection on preview deployments (a preview is a
  working copy of the site with the same server secrets, at a guessable URL);
  mark `RPC_URL`, `CF_API_TOKEN`, `X_CLIENT_SECRET` as Sensitive; set a spend
  cap; confirm the D1 token is scoped to **D1 Edit on this one database**.

### 3. MEDIUM — the oracle poster's private key also lives on disk

Evidence: `target/deploy/oracle-mainnet.json` (mode 600) beside the deploy
keypair. The Cloudflare secret is the only copy the system needs; if it were
ever lost, recovery is `solana-keygen new` + `scripts/set-oracle.ts` +
`wrangler secret put`, a five-minute rotation. The disk copy has no value and
doubles the places the key can be taken from.

Blast radius of the poster key, for the record: it can propose results for
every pool. The only check is a strict-majority veto of alive members within
the dispute window, so in a two-member pool one inattentive member is enough
for a bad post to stand. That is exactly the commissioner's trust level, which
is what the design says it is.

Fix (owner; I do not delete files):

    cd ~/commish.fun && shred -u target/deploy/oracle-mainnet.json target/deploy/commish-upgrade-buffer.json

`commish-upgrade-buffer.json` is the consumed buffer key from the last
upgrade; `oracle-devnet.json` can stay if devnet drills are still wanted.

### 4. MEDIUM — three program items for the next upgrade (written and tested on 2026-09-09; ships with the next upgrade)

a. **`Config.admin` and `Config.fee_treasury` are fixed at `init_config`.**
   There is no `set_admin`, so the admin cannot be handed to the multisig from
   finding 1 without an upgrade. Add a two-step transfer (propose, then the
   new admin accepts) so a typo cannot brick administration.

b. **`update_config` accepts `fee_bps` up to `BPS_DENOM` (100 %).** Fees are
   copied into a pool at creation and shown to the creator, so an existing pool
   is never touched, but a compromised admin key could make every new pool
   confiscatory. A hard cap in code (say `fee_bps <= 1_000`) turns "we would
   never" into "we cannot".

c. **Eliminated members can never close their Member account.** `close_member`
   requires `member.claimed || !member.paid`; `paid` is always true from
   `init_member` and `claimed` is only set by the three claim paths, none of
   which a losing member can call. Their rent (~0.0016 SOL each) is locked
   forever. Not a security issue; a leak worth closing.

d. (info) `Config.creation_fee` is written and never read — already documented
   in `state.rs`.

### 5. MEDIUM — the RPC proxy is usable by anyone who forges an Origin (by design)

Verified live against `rpc.commish.fun`:

- curl with `Origin: https://commish.fun` → forwarded (`getHealth` → ok)
- no Origin → 403; `getBlock` → 403 "does not forward"; `getProgramAccounts` on
  another program → 403; body > 1 MB → 413; batch of 21 → refused; GET → 405
- websocket upgrades pass through **unfiltered** (documented in
  `wrangler.jsonc`; the allowlist never sees socket frames)

The real control is the zone WAF rule (100 requests / 10 s / IP, verified
earlier to return 429s). What is exposed is Helius credits, not funds.

Fix: set a usage alert in the Helius dashboard so exhaustion is noticed before
the site loses its RPC; keep `commish.fun` DNS-only (the rate rule would
throttle the website if it were ever proxied — see the trap described in
`workers/rpc-proxy/wrangler.jsonc`); the frame-filtering relay stays a
documented future item.

### 6. LOW — dependency advisories: none reachable from the deployed system

Root `npm audit --omit=dev`: 25 (10 high, 15 moderate). Every one traced:

| package | path | reachable? |
| --- | --- | --- |
| image-size, metro*, react-native, @react-native/* | build chain of `@solana-mobile/wallet-adapter-mobile` | never in the browser bundle |
| postcss ≤ 8.5.22 | Next's nested copy | build-time only; fix is Next 16 |
| toml | `@coral-xyz/anchor` reading Anchor.toml | Node-only, unused by the site |
| stream-json | `jayson` server side | not used by the web3.js client |
| uuid | `jayson` / `rpc-websockets` | bug needs a caller-supplied buffer; none |

Workers: `wrangler` / `miniflare` / `sharp` high — dev-only CLI packages
(`sharp` is `dev: true` in the lockfile); npm's proposed "fix" is a downgrade
to wrangler 4.15.2, and the latest 4.130.0 is still flagged. Ignore.

Cargo: `cargo audit` reports one warning, `bincode` unmaintained, transitive
from the Solana crates. No advisories.

`@solana/web3.js` is 1.98.4 — not the backdoored 1.95.6 / 1.95.7.

Decision: no lockfile churn during the season for advisories that cannot be
reached; refresh dependencies after Week 1 settles, with Dependabot on so new
ones are seen.

### 7. LOW — email and DNS posture: good, two tightenings available

Verified: DNSSEC signed and validating (DS present, AD=true); CAA present;
TLS 1.0 and 1.1 refused on both `commish.fun` and `rpc.commish.fun`; HSTS two
years with includeSubDomains; MX is Cloudflare Email Routing; SPF
`v=spf1 include:_spf.mx.cloudflare.net ~all`; DMARC `p=quarantine` with
reports to the owner.

Once the DMARC reports show no legitimate sender other than Cloudflare, move
SPF to `-all` and DMARC to `p=reject`. Nobody should be able to send mail as
`@commish.fun` to a member.

### 8. LOW — hygiene

- `.env.example` pointed `NEXT_PUBLIC_RPC_URL` at the retired workers.dev host
  → changed to `https://rpc.commish.fun` (uncommitted in this review).
- `/.well-known/security.txt` is absent. Add one with whatever contact the
  owner wants researchers to use; it is a one-file change once the address is
  chosen.
- `.env.local` holds a direct `RPC_URL` at mode 600 — fine on this machine;
  keep it out of any sync or backup that leaves it.
- Solana CLI default URL is `localhost:8899` — good: mainnet needs an explicit
  `-u m`, so a mistyped command cannot land there.

## What was verified sound

Listed so the review is judged by what it checked, not only by what it found.

**Program** (`programs/commish/src/lib.rs`, full read): every Member is
addressed by PDA seeds plus stored bump with `has_one = wallet`; the vault is
pinned to `pool.vault`, every payout ATA to the signer and the pool's mint;
the mint is pinned at creation to canonical USDC by build feature; every
arithmetic step is `checked_*` or guarded (both divisions sit behind `> 0`
requires); the only `UncheckedAccount` is `fee_treasury` at init, never signed
or read; `init_if_needed` appears once, on `Oracle`, behind the Config admin;
permissionless cranks (`finalize_week`, `settle_member`, `advance_week`,
`lock_dues`, `finalize_sheet`) are pure state machines; the four money-out
paths each name their own recipient; veto is a strict majority with an epoch
so a re-post is a fresh vote; results cannot post before lock + floor; the
oracle door shares one body with the commissioner door. On chain: the Oracle
account is owned by the program, poster `BFKKm4kPiJA13a4W7TSgEQux2L7SGYxNestcDLoWHdyX`,
funded 0.05 SOL; the deployed bytes were sha256-verified after the upgrade.

**Site**: OAuth 2 with PKCE S256, 256-bit CSPRNG state and nonces,
constant-time state compare; cookies `HttpOnly; Secure; SameSite=lax`
(verified on the live `Set-Cookie`); there is no session — every write needs
an ed25519 signature over a server-issued nonce inside a sentence that names
the site, the wallet and the action, and the nonce is burned before the
signature is checked; the open redirect is closed by origin comparison rather
than pattern matching; `server-only` guards every secret-bearing module; D1 is
fully parameterised; avatar URLs come only from X's API response; no
`dangerouslySetInnerHTML`, `eval` or `innerHTML`; every `target="_blank"`
carries `rel="noreferrer"`; every `new PublicKey` on user input is guarded;
SSRF boundaries are a digits-only Sleeper id and a 1–18 week number, with
upstream fetches deduplicated by Next's data cache; `/api/auth/identity` is
`no-store`; unlisted rows are reachable only by capability token; API routes
emit no CORS headers; CSRF is moot (lax cookies plus signatures). Headers on
every path: `CSP frame-ancestors 'none'; base-uri 'self'; form-action 'self';
object-src 'none'`, `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`,
HSTS, `X-Powered-By` removed.

**Workers**: the proxy scrubs the Helius key from every logged error and
forwards none of the caller's headers; the oracle logs only method names,
statuses and pool ids; `RPC_URL` and `ORACLE_FIXTURE` are honoured on devnet
only; both Workers have `workers_dev: false` and their workers.dev hostnames
answer 404 (verified); observability is on.

**Repository**: private; only `.env.example` is tracked; no key-shaped string
in any commit; `.gitignore` covers `.env*`, `.dev.vars`, `target/`, `*.pem`;
every key file on disk is mode 600 under a 750 home; no CI to poison; the
three lockfiles are committed.

## Owner checklist

1. Ship the upgrade that carries the handover, the fee cap and the
   `close_member` fix, while the CLI key is still the upgrade authority:
   `MAINNET_RPC=<helius url> ./scripts/upgrade-mainnet.sh --go` (finding 4).
   Do it between weeks, not while a week's results are pending.
2. Create the multisig and move the upgrade authority to it (finding 1).
3. Hand the admin over: `admin-transfer.ts propose` from the CLI key, then
   `accept` from the successor — `accept --print` for a multisig (finding 4a).
4. Hardware 2FA on GitHub, Vercel, Cloudflare, Helius, X developer (finding 2).
5. Vercel: preview Deployment Protection, sensitive env vars, spend cap;
   confirm the D1 token scope (finding 2).
6. `shred -u` the local oracle key copy and the spent buffer key (finding 3).
7. Helius usage alert (finding 5).
8. Choose a `security.txt` contact (finding 8).
9. After reviewing DMARC reports: SPF `-all`, DMARC `p=reject` (finding 7).
