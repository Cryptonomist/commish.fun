# NoahAI Nitro 03 — submission package

Everything the form is likely to ask for, in one place, so the portal is a
paste job. Theme: *build the Solana version of your favorite Web2 product.*
Window: Sept 3–10, 2026.

## Names and links

| field | value |
| --- | --- |
| Project | **Commish** (`COMMISH.FUN`) |
| One-liner | Your Survivor pool, out of that one guy's Venmo. |
| Live app | https://commish.fun |
| Program (mainnet) | `Adb5CFrY4vYiGQnTQ5qsaPPMUAWKyxwVAQtFHWcshjPa` — https://solscan.io/account/Adb5CFrY4vYiGQnTQ5qsaPPMUAWKyxwVAQtFHWcshjPa |
| Repository | https://github.com/Cryptonomist/commish.fun (private today — see "Decisions" below) |
| Category | Full-stack dApp · consumer · sports |
| Chain | Solana mainnet, USDC |

## The Web2 product it replaces

Every office and group-chat NFL Survivor pool, and every fantasy league's dues
jar. Today that product is **one friend's Venmo**: ten to a hundred people send
their buy-in to a person, who holds the pot for eighteen weeks, tracks the
picks in a spreadsheet, decides disputes, and pays out eventually. It moves
thousands of dollars a season, secured by nothing but friendship. The paid
versions (RunYourPool, Splash Sports, Yahoo) still hold the money themselves.

Commish keeps the commissioner and removes the custody.

## Short description (≈280 characters)

Commish runs NFL Survivor pools and league dues on Solana. Buy-ins go into a
vault the commissioner can't touch, picks lock on-chain at kickoff, results
come from two independent scoreboards, and the winner claims the pot with their
own signature. Live on mainnet for Week 1.

## Long description

**The problem.** A Survivor pool is a season-long trust exercise. One person
holds everyone's money, keeps the only record of the picks, decides what
counts, and pays out when they get around to it. Everything that goes wrong in
pools — the slow payout, the "I definitely picked the Bills", the commissioner
who stops answering in November — is a failure of that one person's custody or
memory, not of the game.

**What Commish does.** A pool is an on-chain escrow. Each member's buy-in goes
into a vault that is the pool's own account; no key, the commissioner's
included, can move it anywhere but to a winner, a prize slot, or a pro-rata
refund. Picks are recorded on-chain and lock at the week's first kickoff.
Results are proposed by an oracle that only posts when two independent
scoreboards agree on every game — or by the commissioner by hand — and either
way they sit in a dispute window where members can veto by majority. Settlement
is a permissionless crank. The last member standing claims the pot with their
own signature. If a pool is ever abandoned, a deadman switch lets every paid
member take their share back.

**Two products on one program.** *Survivor* (and its inverse, Loser) run weekly
picks. *League Treasurer* collects a fantasy league's dues into the same kind of
vault and pays a payout sheet the commissioner posts and the members can veto,
with the standings imported from Sleeper. Same escrow, same veto, same refund,
different arm of one settle function.

**Built for people who don't have wallets.** The members of a pool are the
commissioner's friends, on phones, mostly not crypto users. The site has a
wallet explainer, a sponsored-join path so a commissioner can cover somebody's
seat, X-account linking so a leaderboard shows handles instead of addresses
(two separate opt-ins, each a signed sentence), and an arcade so the landing
page is fun to sit on.

**Live, with real money, before Week 1.** The program is on Solana mainnet
with the platform fee capped in code at ten per cent (three per cent, capped at
50 USDC, is what it charges). The upgrade authority and the admin key were moved
to a cold key kept on a USB stick after a written security review of the whole
stack. The first pool locked at the season's first kickoff, Wednesday Sept 9.

## What was built in the window (Sept 3–10)

198 of the repository's 206 commits. The escrow program and its LiteSVM suite;
the Next.js app; the League Treasurer mode; X linking on Cloudflare D1; the
RPC proxy Worker; the mainnet cutover; the results oracle Worker with two
devnet drills; the security review and the fixes it found (admin handover, fee
ceiling, rent recovery), upgraded on mainnet and verified byte for byte.

## Numbers

- 23 program instructions, one Anchor program, ~1,500 lines of Rust
- 38 LiteSVM tests against the production binary · 200 web tests · 166
  instruction-encoding checks between the site, the Worker and the suite
- 2 Cloudflare Workers, 1 D1 database, 0 servers that hold a key that moves
  money
- Mainnet program verified: on-chain sha256 equals the local build after every
  upgrade

## Tech

Solana · Anchor 1.1 · Next.js 15 on Vercel · Cloudflare Workers (RPC proxy,
results oracle on a 10-minute cron) · Cloudflare D1 · `@solana/kit` + LiteSVM
for tests · ESPN and api-sports as independent result feeds · Telegram alerts
· pixel-art canvas arcade.

## How AI was used

*Fill in honestly. The repository was built with Claude Code as the pair —
program, app, Workers, tests, the security review — with the owner directing,
testing on devnet and mainnet, and holding every key. If any part was built
with Noah, name it; if not, say the entry is a Solana build for the theme and
leave it there.*

## Demo video — 90-second shot list

1. **(0:00–0:10)** commish.fun hero. Read the tagline. "Every Survivor pool
   runs through one guy's Venmo. This one runs through a vault."
2. **(0:10–0:25)** Start a pool: buy-in, weeks, dispute window, sign. Show the
   pool page with its vault address and the join link.
3. **(0:25–0:40)** Join from a second wallet (phone). The buy-in lands in the
   vault; the member row appears. Point at the vault balance on Solscan.
4. **(0:40–0:55)** Submit a pick. Show the lock time. "Locks at kickoff.
   Recorded on-chain. Nobody edits it Monday."
5. **(0:55–1:10)** The results oracle: the Telegram message from the Worker,
   the two feeds agreeing, the dispute window on the pool page, the veto
   button.
6. **(1:10–1:25)** Settlement and claim: the survivor claims the pot with
   their own signature; the vault goes to zero on Solscan.
7. **(1:25–1:30)** "Commish. The commissioner keeps the job, loses the
   custody." URL.

Record on the zero-buy-in mainnet pool, or on devnet with fastclock if the
cycle has to happen inside the video.

## Assets

- `brand/og.png` — 1200×630 cover
- `brand/appicon.png` — icon
- `brand/banner-x.png` — banner
- Screenshots to take: hero, pool page with vault, pick grid, league payout
  sheet, leaderboard, the arcade

## Decisions the owner has to make before submitting

1. **Repository visibility.** Most judging asks for a public repo or reviewer
   access. Options, from least exposure: add the judges as read-only
   collaborators; publish a snapshot at a tag; make the repo public. The code
   contains no secrets (verified in the security review), so this is a
   business decision, not a safety one.
2. **How Noah was used** — see the section above.
3. **Team line.** Solo founder, Texas; X handle to list.
4. **Demo video** — record from the shot list, or submit without if the form
   allows.
