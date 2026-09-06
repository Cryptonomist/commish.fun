# Commish — setup

Everything the app needs to run locally and deploy. Written to be followed once,
in order, in about thirty minutes.

## 1. Run it locally

```bash
npm install
cp .env.example .env.local     # fill in as you go; the site renders without them
npm run dev                    # http://localhost:3000
```

The landing page and `/pools/new` work with no environment variables at all.
Wallet connect works as soon as `NEXT_PUBLIC_RPC_URL` is set.

## 2. Accounts to create

These are the only things that cannot be done from the repo.

### Helius (RPC)

1. helius.dev → create an app → copy the **devnet** URL for now.
2. In the key settings, add a **domain restriction** for `commish.fun`,
   `www.commish.fun` and your Vercel preview domain. The key ships in the
   browser bundle — the domain lock is what protects it, not secrecy.
3. Put it in `.env.local` as `NEXT_PUBLIC_RPC_URL`.

### Supabase (database + auth)

1. supabase.com → new project, region close to you.
2. Settings → API → copy the **Project URL** and the **anon** key into
   `.env.example`'s two `NEXT_PUBLIC_SUPABASE_*` slots in `.env.local`.
3. Copy the **service_role** key somewhere safe. It goes in Vercel only, never
   in the repo, never in a `NEXT_PUBLIC_` variable — it bypasses row level
   security entirely.
4. Enable **X (Twitter)** as an auth provider when you get to the leaderboard.

### Vercel (hosting)

1. vercel.com → Add New → Project → import the GitHub repo.
2. Framework preset: **Next.js**. Everything else default.
3. Environment Variables: paste every line from `.env.example`, with real
   values. Set them for Production, Preview and Development.
4. Deploy. You get a `*.vercel.app` URL immediately.

### Cloudflare (DNS for commish.fun)

Vercel will show you the exact records under Project → Settings → Domains after
you add `commish.fun`. It is normally:

| Type  | Name  | Content                 | Proxy    |
|-------|-------|-------------------------|----------|
| A     | `@`   | `76.76.21.21`           | DNS only |
| CNAME | `www` | `cname.vercel-dns.com`  | DNS only |

**Proxy status must be DNS only (grey cloud).** Orange-cloud proxying in front
of Vercel breaks their certificate issuance and gives you a redirect loop. Use
Vercel's values over these if they differ.

## 3. Anchor program

It is in `programs/commish` and it compiles. See **PROGRAM.md** for what is
implemented and what is not.

`cargo test -p commish` runs right now with nothing but Rust installed — it
covers the mode rules and the account sizes. Building the actual `.so` needs the
Solana toolchain:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest && avm use latest

anchor build
anchor keys sync                       # writes the real program id everywhere
anchor deploy --provider.cluster devnet
```

Build with `--features devnet` for devnet — the USDC mint is different there and
pool creation will (correctly) reject the wrong one.

After the first deploy, put the program id in `NEXT_PUBLIC_PROGRAM_ID` and copy
`target/idl/commish.json` into `src/idl/` so the frontend types come from the
program rather than from hand-written interfaces.

## 4. What is already wired

| Thing | Where | State |
|---|---|---|
| Brand tokens (Pigskin palette) | `src/app/globals.css` `@theme` | done |
| Anton + Space Grotesk, self-hosted | `src/app/fonts/`, `layout.tsx` | done |
| The Laces mark + wordmark | `src/components/Laces.tsx` | done |
| Wallet connect (Wallet Standard) | `src/components/Providers.tsx` | done |
| react-query | `src/components/Providers.tsx` | done |
| Supabase browser client | `src/lib/supabase.ts` | done |
| NFL team index (the on-chain contract) | `src/lib/nfl.ts` | done |
| USDC + countdown formatting | `src/lib/format.ts` | done |
| Landing page | `src/app/page.tsx` | done |
| Create-pool form | `src/app/pools/new/page.tsx` | shape only, no instruction |
| Escrow program (Survivor, Loser, League) | `programs/commish/` | compiles, `cargo test` green, never deployed |
| Mode rules as a tested pure function | `programs/commish/src/rules.rs` | done |
| `anchor build` / `anchor test` | — | not run — needs the Solana toolchain |

## 5. The two rules that are easy to break

**Action is the orange, and it is the brand.** `--color-action` dresses the
Laces, the links and the CTAs. There was briefly a separate tan for the mark so
the lockup would stop reading as a button; it solved that and left the palette
with a second brand colour that was, of all things, brown. The lockup is fixed
by carrying no filled tile instead — orange laces on night are a mark, an orange
square with something cut out of it is a button.

**Gold is the money** — pot amounts, payouts, and nothing else. A gold border on
a button is a bug.

One more, particular to this palette: green is the environment *or* the survival
signal, never both. The surfaces are turf under floodlights, so `--color-alive`
is brighter and more yellow than a normal success green to keep it separable.

## 6. Order of work

1. Install the Solana toolchain, `anchor build`, `anchor keys sync`, deploy to
   devnet. Nothing below is real until the program is on a validator.
2. `anchor test`: the account-level constraints have compiled but never
   executed. Start with `create_pool` + `join_pool` + a fake mint rejection.
3. Wire `/pools/new` to `create_pool`, then the join link and `/p/[pool]`.
4. The pick grid and the lock at first kickoff.
5. The results loop end to end: post → veto → finalize → settle → advance.
6. Payouts: `claim_pot`, the co-winner split, and the deadman refund.
7. The three-wallet devnet run, all the way from create to claim.

Week 1 locks Thursday.
