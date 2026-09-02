# COMMISH.FUN — build specification (handoff v3)
*Paste this whole document into your coding assistant. It is the complete, self-contained spec: what to build, exactly how, in what order. It supersedes every earlier version. Items marked FINAL are decided; do not re-open them. Every feature is tagged MUST / SHOULD / STRETCH — when time is short, cut STRETCH first, then SHOULD. Seven days is the entire budget.*

---

## 0. Working rules

1. **Division of labor.** The assistant scaffolds and builds the web app, database, jobs, API, UI, and tests. The Anchor program and every token-moving instruction are hand-written and reviewed by the founder. Generate program code when asked, and flag every line that moves tokens for human review.
2. **Secrets never appear in chat or in the repo.** Code references env var names; the founder enters values in the hosting dashboard.
3. **On-chain state is the source of truth.** The database is a cache; the API is read-only; the program is the write API.
4. **Build order is fixed** (§16). Do not start a SHOULD before the MUSTs of the same day are green.

---

## 1. Product (FINAL)

**One-liner:** The Solana version of the office Survivor pool. Buy-ins escrowed on-chain, picks locked before kickoff, eliminations settled from real NFL results, pot to the last wallet standing. Nobody holds the money, because nobody needs to.

- Tagline: "Your Survivor pool, out of that one guy's Venmo."
- Trust line: "The commissioner keeps the job, loses the custody."
- Name: commish.fun (display: COMMISH.FUN, ".FUN" in leather orange).
- Context: NoahAI Nitro 03 entry, Sept 3–10, 2026. NFL Week 1 kicks off Thu Sept 10, 8:20pm ET.
- Private pools only, link-to-join, no directory. **Commish takes no cut** (100% of buy-ins to the winner). **$0 buy-in pools allowed** (full game, no money).
- No NFL or team logos/marks anywhere. City names, abbreviations, and colors are facts and are fine.

---

## 2. Game rules (FINAL, not configurable)

- Buy-in (USDC, may be 0) to join. Pool closes to new members at Week 1 lock.
- One pick per week: an NFL team to WIN. Picks lock at that week's first kickoff (one global weekly lock).
- Win → advance. Loss or tie → OUT. No pick by lock → OUT. Bye-week teams cannot be picked (UI blocks; the results mask has their bit off, so it would count as a loss).
- Each team usable once per season (32-bit mask per member).
- Last one standing takes the pot. All remaining eliminated the same week → that week's entrants split evenly. Multiple survivors after Week 18 → even split. Pool never settled by refundDeadlineTs (season end + 30 days) → deadman refund, pro-rata, claimable by each member.

**Team index (FINAL):** alphabetical by abbreviation, 0-based:
`ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS` (ARI=0 … WAS=31).

---

## 3. Tech stack (FINAL)

| Layer | Choice | Why |
|---|---|---|
| On-chain | Anchor 0.30+, Rust, `anchor-spl` for SPL Token | Standard; founder expertise |
| Frontend | Next.js 14 (App Router, TypeScript), Tailwind CSS, `@tanstack/react-query` | API routes, OG images, cron endpoints in one deploy; AI-friendly |
| Wallet | `@solana/wallet-adapter-react` + `-react-ui` (Phantom/Solflare/Backpack via Wallet Standard) | Zero keys, best AI codegen coverage |
| Chain client | `@coral-xyz/anchor` (IDL-typed client), `@solana/web3.js` | Typed instructions from the IDL |
| Database + auth | Supabase (Postgres, RLS, Auth with X/Twitter provider) | Founder already runs it at HoldFlow |
| RPC | Helius (dedicated key, domain-restricted) | Reliable; founder account exists |
| Jobs | Next.js route handlers hit by a scheduler (Vercel Cron or equivalent) with `CRON_SECRET` | No extra infra |
| Hosting | Vercel (or the assistant's fastest deploy); DNS on Cloudflare (already hardened) | Speed |
| Fonts | Anton + Space Grotesk, self-hosted woff2 in `/public/fonts` (OFL) | OG images need local font files |

---

## 4. Repository layout

```
commish.fun/
├── programs/commish/          # Anchor program (Rust)
│   └── src/{lib.rs,state.rs,errors.rs,instructions/*.rs}
├── tests/                     # Anchor TS tests
├── idl/commish.json           # committed IDL after each build
├── app/                       # Next.js
│   ├── app/                   # routes (see §11)
│   ├── components/            # see §10
│   ├── lib/{anchor,pda,tx,teams,schedule,format}.ts
│   ├── lib/server/{indexer,results,espn,supabase,verify}.ts
│   ├── public/{fonts,brand,manifest.webmanifest}
│   └── data/{teams.json,schedule.json}
├── supabase/migrations/       # SQL (§7)
├── sdk/                       # STRETCH TypeScript SDK
├── brand/                     # PNG kit + laces.svg
├── docs/{PROGRAM.md,API.md}
├── COMMISH-HANDOFF.md
└── README.md
```

---

## 5. On-chain program — full specification

### 5.1 State machine (per pool)
`Open` (joins + picks) → each week: `Locked` (picks frozen at lock) → `ResultsPosted` (dispute window) → `Finalizing` (per-member settlement) → `Advanced` (next week Open for picks) … → `Settled` (winners claim) | `Abandoned` (deadman refunds).

Per-member settlement is deliberate: a single instruction cannot touch hundreds of member accounts, so results are applied one member at a time by a permissionless crank, and the week advances when every alive member has been processed.

### 5.2 Accounts

**Pool** — PDA seeds `["pool", commissioner, nonce_le_u64]`, space 640 (padded).
```
commissioner: Pubkey        usdc_mint: Pubkey          vault: Pubkey
nonce: u64                  name: [u8;32]              buy_in: u64 (USDC base units, 6 dp; 0 allowed)
max_members: u16            member_count: u16          alive_count: u16
alive_at_week_start: u16    processed_this_week: u16
current_week: u8 (1..=18)   lock_ts: [i64;18]          refund_deadline_ts: i64
dispute_window_secs: u32    results: [u32;18]          results_posted: [bool;18]
pending_mask: u32           pending_week: u8           pending_posted_ts: i64
veto_count: u16             finalized_week: u8         status: u8 (enum PoolStatus)
winners_week: u8 (0 = survivors after W18)             winners_count: u16
pot_per_winner: u64         bump: u8
```
**Member** — PDA seeds `["member", pool, wallet]`, space 200 (padded).
```
pool: Pubkey   wallet: Pubkey   display_name: [u8;24]   paid: bool   joined_ts: i64
used_mask: u32   current_pick: u8 (255 = none)   pick_week: u8
processed_week: u8 (last week applied)   eliminated_week: u8 (0 = alive)
vetoed_week: u8   claimed: bool   bump: u8
```
**Vault** — the pool PDA's associated token account for `usdc_mint`. Created in `create_pool`. Only program CPIs move tokens out of it.

### 5.3 Instructions, constraints, errors

| # | Instruction | Signer | Constraints (all must hold) | Effect |
|---|---|---|---|---|
| 1 | `create_pool(nonce, name, buy_in, max_members, lock_ts[18], refund_deadline_ts, display_name)` | commissioner | `usdc_mint == CANONICAL_USDC` (per cluster constant); `max_members 2..=500`; `lock_ts` strictly increasing and `lock_ts[0] > now`; `refund_deadline_ts > lock_ts[17] + 7d` | init pool + vault; auto-join commissioner (pays buy-in) |
| 2 | `join_pool(display_name)` | member | `now < lock_ts[0]`; `member_count < max_members`; member PDA `init` (one per wallet); transfer `buy_in` to vault (skip transfer if 0) | member_count++, alive_count++ |
| 3 | `submit_pick(team)` | member | `team <= 31`; `now < lock_ts[current_week-1]`; `eliminated_week == 0`; `used_mask & (1<<team) == 0`; status Open | set `current_pick`, `pick_week = current_week` (overwrite allowed) |
| 4 | `post_results(week, mask)` | commissioner (`has_one`) | `week == current_week`; `now >= lock_ts[week-1] + 3h` (games have started; server proposes only when final); `!results_posted[week-1]`; no pending | `pending_mask/week/posted_ts` set; `veto_count = 0` |
| 5 | `veto_results` | member | pending exists; member alive; `vetoed_week != pending_week` | `veto_count++`; if `veto_count * 2 > alive_count` → clear pending |
| 6 | `finalize_week` | anyone | pending exists; `now >= pending_posted_ts + dispute_window_secs` | `results[w] = mask; results_posted[w] = true; finalized_week = w; processed_this_week = 0; alive_at_week_start = alive_count`; clear pending |
| 7 | `settle_member(member)` | anyone | `finalized_week == current_week`; member alive; `processed_week < current_week` | if `pick_week != week` or `current_pick == 255` or `results[w] & (1<<pick) == 0` → `eliminated_week = w`, `alive_count--`; else `used_mask |= 1<<pick`; `processed_week = w`; `current_pick = 255`; `processed_this_week++` |
| 8 | `advance_week` | anyone | `finalized_week == current_week`; `processed_this_week == alive_at_week_start` | if `alive_count == 1` → Settled, `winners_week = 0`, `winners_count = 1`; if `alive_count == 0` → Settled, `winners_week = w`, `winners_count = alive_at_week_start`; if `w == 18` → Settled, `winners_week = 0`, `winners_count = alive_count`; else `current_week++`. On Settled: `pot_per_winner = vault_balance / winners_count` |
| 9 | `claim_pot` | member | status Settled; `!claimed`; winner test: (`winners_week == 0 && eliminated_week == 0`) or (`eliminated_week == winners_week`) | transfer `pot_per_winner` from vault via PDA signer; `claimed = true` |
| 10 | `reclaim_dues` | member | status != Settled; `now >= refund_deadline_ts`; `paid && !claimed` | transfer `vault_balance_at_first_reclaim / paid_members` (store `refund_per_member` on first call); `claimed = true` |

Errors (enum): `WrongMint, PoolFull, JoinClosed, PicksLocked, TeamAlreadyUsed, InvalidTeam, MemberEliminated, ResultsAlreadyPosted, ResultsPending, NoPendingResults, DisputeWindowOpen, AlreadyVetoed, TooEarly, NotFinalized, AlreadyProcessed, WeekIncomplete, NotSettled, NotAWinner, AlreadyClaimed, RefundNotAvailable, BadSchedule, NameTooLong, MathOverflow`.

Events (emit, for the indexer and explorers): `PoolCreated, MemberJoined, PickSubmitted, ResultsPosted, ResultsVetoed, WeekFinalized, MemberSettled, WeekAdvanced, PoolSettled, PotClaimed, DuesReclaimed`.

### 5.4 Security requirements (each has a test)
- Canonical USDC mint per cluster (mainnet `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`; devnet test mint via env). Vault must be the pool PDA's ATA for that mint; token program must be SPL Token.
- Signer/owner checks; PDA seeds + bump validated on every account; `has_one = commissioner` where applicable; `init` only (never `init_if_needed`).
- Checked arithmetic everywhere; integer division dust stays in the vault (documented).
- All time from `Clock::get()`; boundary tests at ±1s for every time gate.
- Idempotency: `settle_member` once per member per week; `claim_pot`/`reclaim_dues` gated by `claimed`; `finalize_week` once per week.
- Veto integrity: one veto per member per posted result; only alive members; majority = strictly more than half of `alive_count`.
- Upgrade authority stays with the founder during the hackathon, disclosed on `/trust`, with the stated plan to move to a multisig after.

### 5.5 Program tests (Anchor, TypeScript)
Happy path across 3 members and 3 weeks; every rejection path in §5.3; both payout paths (last standing; all-out-same-week split); Week-18 multi-survivor split; deadman refund; veto majority clears pending; boundary timestamps; fake-mint rejection; double-claim rejection.

---

## 6. Static data

- `data/teams.json`: 32 entries `{index, abbr, city, nickname, primary, secondary, espnId}` in the §2 order.
- `data/schedule.json`: `{season: 2026, weeks: [{week, lockTs, byeTeams: [abbr]}]}` for weeks 1–18. Generated once by a script from ESPN's scoreboard (`?week=N&seasontype=2&dates=2026`): `lockTs` = earliest kickoff that week (unix seconds), `byeTeams` = teams with no game. Committed; the app and `create_pool` both read it (the app passes `lock_ts[18]` into `create_pool`).

---

## 7. Database (Supabase) and jobs

### 7.1 Schema (`supabase/migrations/0001_init.sql`)
```sql
create table pools (
  address text primary key, commissioner text not null, name text not null,
  buy_in bigint not null, max_members int, member_count int, alive_count int,
  current_week int, status text, winners_week int, winners_count int,
  pot_per_winner bigint, vault text, vault_balance bigint, refund_deadline_ts bigint,
  lock_ts bigint[] not null, results int[] , results_posted boolean[],
  pending_mask bigint, pending_week int, pending_posted_ts bigint, veto_count int,
  updated_slot bigint, updated_at timestamptz default now()
);
create table members (
  address text primary key, pool text references pools(address), wallet text not null,
  display_name text, paid boolean, joined_ts bigint, used_mask bigint,
  current_pick int, pick_week int, processed_week int, eliminated_week int,
  claimed boolean, updated_at timestamptz default now()
);
create index on members(pool); create index on members(wallet);
create table x_links (
  wallet text primary key, x_user_id text unique not null, x_username text not null,
  avatar_url text, show_on_board boolean default false, linked_at timestamptz default now()
);
create table link_nonces (nonce text primary key, wallet text, expires_at timestamptz);
create table results_proposals (
  week int primary key, season int, mask bigint, games_total int, games_final int,
  payload jsonb, fetched_at timestamptz
);
create view board as
  select x.x_username, x.avatar_url, m.wallet,
    max(case when m.eliminated_week = 0 then p.current_week - 1 else m.eliminated_week - 1 end) as weeks_survived,
    bool_or(m.eliminated_week = 0 and p.status <> 'settled') as alive,
    count(*) filter (where p.status = 'settled' and m.claimed) as pools_won,
    coalesce(sum(case when p.status='settled' and m.claimed then p.pot_per_winner end),0) as usdc_won
  from members m join pools p on p.address = m.pool join x_links x on x.wallet = m.wallet
  where x.show_on_board group by 1,2,3;
```
RLS: `pools`, `members`, `results_proposals`, `board` → public SELECT; all writes via service role only. `x_links` → no public access (the API exposes only the `board` view). `link_nonces` → service role only.

### 7.2 Indexer job — `GET /api/cron/index` (every 5 min; header `Authorization: Bearer ${CRON_SECRET}`)
1. `getProgramAccounts(PROGRAM_ID, memcmp discriminator = Pool)`; decode with the Anchor coder; upsert `pools` (include vault balance via `getTokenAccountBalance`).
2. Same for `Member`; upsert `members`.
3. Record `updated_slot`. At hackathon scale this is seconds; Helius webhooks are the later upgrade.

### 7.3 Results job — `GET /api/cron/results` (every 15 min, Thu–Tue)
1. Determine the current week from `schedule.json` and `now`.
2. Fetch ESPN scoreboard for that week (server-side only; cache 60s).
3. For each event: if `status.type.completed` and a winner exists → set the winner's bit (map `espnId → index`); ties set nothing.
4. Upsert `results_proposals` with `games_total`, `games_final`, `mask`, raw `payload`.
5. The commissioner panel shows the proposal; **CONFIRM is enabled only when `games_final == games_total`** (all games final). Postponed games: commissioner waits; the dispute window and veto cover mistakes.

### 7.4 Cranking (MUST via UI, STRETCH via server)
- MUST: every pool page shows a SETTLE button when a crank is possible (`finalize_week`, then `settle_member` for each alive member in batches of ~15 per transaction, then `advance_week`). Anyone can press it; the presser pays a few cents of fees. No server keypair required in v1.
- STRETCH: `GET /api/cron/crank` with a low-balance `CRANK_KEYPAIR` does the same automatically.

---

## 8. Wallet, transactions, sessions

- Wallet Adapter with the default modal, restyled to the palette. Auto-connect on return visits.
- **Transaction hygiene:** one user action = one transaction; `simulateTransaction` before sending; the `TxSheet` states what moves in plain English and shows the vault address with an explorer link; never request token delegation; never prompt a signature the user did not initiate.
- **No accounts, no passwords.** Wallet is identity. X linking (§13) is the only other login, and it is opt-in.
- Reads: the pool page fetches the pool + member accounts directly from the RPC (truth) and uses the API for lists and the board (cache). React Query with 15s stale time; invalidate after each confirmed transaction.
- Errors map to copy: `PicksLocked` → "Picks are locked for this week."; `TeamAlreadyUsed` → "You already used the {TEAM} in Week {n}."; simulation failure → "This transaction would fail: {reason}. Nothing left your wallet."

---

## 9. Design system — "Primetime" (FINAL)

The visual world of a Thursday-night broadcast graphics package: night-game black, chalk type, leather orange, gold for money. Football is in the bones (chalk-line dividers, tabular scoreboard numbers, the laces mark, ALIVE/OUT stamps), never in decoration (no helmets, no turf textures, no logos). **Dark theme only.**

**Tokens (Tailwind `theme.extend.colors`):**
```
night #120D0A · night2 #1D1310 · line rgba(246,239,226,.10)
cream #F6EFE2 · cream60 rgba(246,239,226,.60) · cream40 rgba(246,239,226,.40)
leather #FF5C1B · leatherHi #FF7A45 · gold #E9C258 · alive #35C97A · out #E5484D
radius: sm 10px · md 14px · lg 20px · pill 999px · spacing base 4px
```
**The one rule:** orange is the brand, gold is the money. Nothing else is ever gold.

**Type:** Anton (display: wordmark, pot totals, week headers, stamps; uppercase, tracking .015em, tabular numerals) + Space Grotesk 400–700 (UI). Scale 12/14/16/20/28/40/64+.

**The mark — THE LACES** (`brand/laces.svg`; cream on leather for avatar/icon/empty states; leather on night in-app; never inside the wordmark; never drawn as a football):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200"><g transform="rotate(-14)" fill="#FF5C1B"><rect x="-9" y="-84" width="18" height="168" rx="9"/><rect x="-49" y="-63" width="98" height="18" rx="9"/><rect x="-49" y="-27" width="98" height="18" rx="9"/><rect x="-49" y="9" width="98" height="18" rx="9"/><rect x="-49" y="45" width="98" height="18" rx="9"/></g></svg>
```
**Signature motion (SHOULD):** the laces are the loading indicator (ticks light in sequence) and each member row shows a mini laces glyph with one tick lit per week survived.

**Layout principles:** mobile-first at 390px (game screens max 640px wide, commissioner panel 960px); one leather button per screen; the pot is the largest element wherever a pool appears; chalk hairlines instead of nested cards; ALIVE/OUT as Anton pill stamps; the lock countdown is always visible before lock (local time, ET in parentheses); 150–200ms ease-out transitions, one celebration (payout), `prefers-reduced-motion` respected; 44px tap targets; 2px leather focus ring; contrast ≥ 4.5:1.

---

## 10. Components

`WalletButton` · `PotDisplay` (gold Anton number + "N alive") · `Countdown` · `TeamGrid`/`TeamTile` (32 colored circles with abbreviation; states default / selected (leather ring) / used (struck, dim) / bye (dim, "BYE")) · `MemberRow` (name, stamp, weeks-survived laces) · `StatusBanner` (Open → Locked → Results proposed (dispute countdown, VETO) → Settling → Settled) · `TxSheet` (plain-English confirm; states signing / sending / confirmed / failed; explorer link) · `SettleButton` (crank, §7.4) · `RulesSheet` (§2 verbatim) · `ShareCard` (§12) · `LacesLoader` · `Stamp` (ALIVE / OUT).

---

## 11. Screens and routes

| Route | Screen | MUST content |
|---|---|---|
| `/` | Landing | Wordmark, tagline, three mechanics, CREATE A POOL. Below: trust table, "How the money moves," 5-question FAQ, links to `/trust`, `/board`, repo |
| `/new` | Create pool | Name, buy-in (0 allowed), max members, your display name; lock schedule shown (from `schedule.json`), not editable; CREATE → pool page with COPY INVITE LINK |
| `/p/[pool]` | Pool hub (**works without a wallet**) | Name, pot, alive count, countdown, StatusBanner, member list, vault → explorer, rules; with wallet: JOIN or current pick state; SETTLE when crankable |
| `/p/[pool]/pick` | Pick | TeamGrid for the current week → TxSheet; after lock: your pick, then everyone's |
| `/p/[pool]/commish` | Commissioner | Proposal vs ESPN scores, CONFIRM (enabled only when all games final), dispute status, veto count, SETTLE |
| `/p/[pool]/history` | Season board (SHOULD) | Week × member grid of picks colored by result |
| `/p/[pool]/claim` | Payout | CLAIM POT (gold, the one celebration) or RECLAIM BUY-IN (deadman) |
| `/board` | Leaderboard (SHOULD) | §13 |
| `/me` | Profile (SHOULD) | Display name per pool, Link X, "show me on the board" |
| `/trust` | Trust page | Trust table, vault explanation, upgrade-authority disclosure, no-cut statement, program + repo links |
| `/api/v1/*` | Public API | §14 |
| `/p/[pool]/opengraph-image` | OG image (SHOULD) | 1200×630 ShareCard via `ImageResponse` with local Anton |

Loading = LacesLoader; empty = "No picks yet. Lock is in {countdown}."; tx failure copy per §8.

---

## 12. Features (tagged)

**MUST:** on-chain display names · wallet-less public pool page with explorer links · countdown in local time + "Add lock to calendar" (.ics) · plain-English TxSheets · $0 pools · rules sheet everywhere · SETTLE button crank · PWA manifest with app icon.
**SHOULD:** season board · OG ShareCard · weekly recap banner ("Week 3: 4 out, 6 alive. Dave took the Jets. The Jets did not cooperate.") · laces progress · `/board` + X linking · demo/replay flag (a pool whose `lock_ts` are in the past and whose results come from a historical week, for the stage demo).
**STRETCH:** commit-reveal picks · server crank · TypeScript SDK · Sleeper league attach.
**Not v1:** public directory, platform fees, fiat on-ramp, embedded wallets, chat, push notifications, light theme, multi-sport, webhooks, API keys.

---

## 13. X account linking + leaderboard (SHOULD, day 5)

**Purpose:** a public season leaderboard by X handle — the brag surface that makes people post about Commish on X. Opt-in.

**Prerequisite (founder, before the window):** X developer app created; callback URL = the Supabase project's auth callback; X provider enabled in Supabase Auth with the app's keys.

**Link flow (two-sided verification):**
1. `/me` → LINK X → `supabase.auth.signInWithOAuth({ provider: 'twitter' })` → returns a session; the server reads `x_user_id` and `user_name` from the Supabase JWT (never from the client).
2. Server issues a nonce (`link_nonces`, 5-minute expiry, single-use).
3. Wallet signs the exact message: `commish.fun link\nx:{x_user_id}\nwallet:{pubkey}\nnonce:{nonce}`.
4. `POST /api/link` with `{ signature, nonce }` + the Supabase JWT. Server verifies the JWT, the nonce, and the ed25519 signature over the exact message (`tweetnacl`), then upserts `x_links` (one X per wallet, one wallet per X; re-link replaces). Never store X tokens; never post on the user's behalf.
5. `DELETE /api/link` unlinks (same proof). `PATCH /api/link` toggles `show_on_board`.
6. Fallback if the X app is not approved in time: self-declared handle on the profile, shown without a verified badge, excluded from `/board`.

**Leaderboard (`/board`):** reads the `board` view. Rank: weeks_survived desc → pools_won → usdc_won → earliest link. Season-scoped. Rows: rank, X avatar + @handle, ALIVE/OUT stamp, laces glyph, pots won (gold). No wallet addresses. Every row links to the member's pool pages (proof). Footer: "A cache of on-chain results. Updated {time}."

**Share card (SHOULD):** "Week 6. Still standing. #12 of 418 on commish.fun" — same OG renderer, one-tap post to X.

---

## 14. Integration surface — "the program is the API"

**Principle:** writes are on-chain transactions signed by the user; the hosted API only reads.

**Layer 1 — Program + IDL (MUST, free):** `anchor idl init` on deploy; commit `idl/commish.json`; `docs/PROGRAM.md` lists program ID, PDA seeds, and each instruction's accounts. Integrators build join/pick/claim transactions for their users directly.

**Layer 2 — Public read API (SHOULD, day 6; on the §7 tables):** base `/api/v1`, JSON, versioned, CORS open for GET, no auth, rate limit 60 req/min per IP, `Cache-Control: public, s-maxage=30, stale-while-revalidate=60` (edge-cached by Cloudflare).
- `GET /pools/{address}` → pool fields (§7.1) + `explorer` links + `source: "on-chain"` + `asOfSlot`.
- `GET /pools/{address}/members` → display name, alive/out, weeks survived, pick (only when `now >= lock`), `x_username` if opted in.
- `GET /pools/{address}/results` → per week: mask decoded to abbreviations, posted/finalized timestamps, veto count.
- `GET /schedule` → `schedule.json`.
- `GET /board?limit=100`.
- Errors: `{ error: { code, message } }`; 404 for unknown pool; 429 on rate limit.
- `docs/API.md` documents all of the above with example responses.

**Layer 3 — SDK (STRETCH):** `@commishfun/sdk`: `createPool, joinPool, submitPick, claimPot, getPool, getMember, pda.*`; MIT; 20-line README example.

**Vision line for the writeup (not built this week):** the program is a general results-settled escrow pool engine — Survivor is the first game; pick'em, squares, and brackets are the same rails with a different results shape.

---

## 15. Configuration, security, deploy runbook

**Env vars:** client `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_CLUSTER`, `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_USDC_MINT`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; server `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `HELIUS_SERVER_RPC_URL`, `CRANK_KEYPAIR` (stretch). `.env*` gitignored from commit one; values only in the hosting dashboard.

**Security posture:** Helius browser key restricted to `commish.fun`, `www`, `localhost`; strict CSP (no inline eval; `connect-src` = RPC, Supabase, self); dependencies pinned; no analytics that capture wallets; ESPN fetched server-side only; rate limits on `/api/link` and `/api/v1`; Cloudflare already: Full (strict), Always HTTPS, min TLS 1.2, DNSSEC, DMARC reject — enable HSTS on launch day after a clean deploy.

**Runbook:**
1. `anchor build && anchor test` (localnet) → `anchor deploy --provider.cluster devnet` → copy program ID into env + `Anchor.toml` → `anchor idl init`.
2. Deploy app (devnet env) → run the 3-wallet loop (§16 day 4) → fix.
3. Mainnet: `anchor deploy --provider.cluster mainnet` (funded deployer wallet) → `anchor idl init` → env to mainnet + canonical USDC → redeploy app → Cloudflare CNAME → verify domain → Helius domain restriction → HSTS on.
4. Create the founder's real league pool. Screenshot everything for the submission.

---

## 16. Seven-day plan (Sept 3–10)

- **Day 1 (Thu 3):** Program: state, `create_pool`, `join_pool`, `submit_pick` + all rejection tests + canonical mint check; devnet green. App: scaffold, tokens, fonts, wallet adapter, `teams.json`, `schedule.json` script, Landing, Create, Pool hub (read-only).
- **Day 2 (Fri 4):** Program: `post_results`, `veto_results`, `finalize_week`, `settle_member`, `advance_week` + boundary tests. App: TeamGrid, Pick flow, TxSheet, JOIN flow, Countdown + .ics.
- **Day 3 (Sat 5):** Program: `claim_pot`, `reclaim_dues`, both split paths, deadman tests. Supabase schema + indexer job; ESPN results job; Commissioner panel with CONFIRM; SETTLE crank button.
- **Day 4 (Sun 6):** Full loop on devnet with 3 wallets: create → join → pick → post → veto → finalize → settle → advance → claim; deadman path on a test pool. Fix everything. Empty/error states, `/trust`, rules sheet, PWA manifest.
- **Day 5 (Mon 7):** X linking + `/me` + `/board`; season board; OG ShareCard; recap banner; laces progress; demo/replay flag.
- **Day 6 (Tue 8):** Public API + `docs/API.md` + `docs/PROGRAM.md`; mainnet deploy (runbook §15); domain live; HSTS; backup demo video; onboard the founder's real league.
- **Day 7 (Wed 9):** Polish, security pass (every §5.4 item has a test), submission writeup, launch thread scheduled. Evening = buffer, nothing scheduled.
- **Sept 10 (Thu):** Submit. Kickoff 8:20pm ET. Launch from @commishfun (banner) and the founder's personal account (the Cash App story).

## 17. Demo script (~90s)
1. "Every year I send $20 to my buddy's Cash App for our league and trust him for five months. Here's the version where nobody has to."
2. Create a pool live; two phones join; the pot fills; vault on the explorer.
3. Both phones pick; lock hits; picks frozen. "No 'I definitely picked the Bills' texts on Monday."
4. Demo-flag pool → CONFIRM a real historical week → SETTLE → one phone stamps OUT; the survivor claims the pot in gold.
5. "Results anyone can veto, a pot nobody can strand, picks nobody can backdate, and Commish takes nothing. Week 1 locks Thursday. Real pools can use this today."

## 18. Copy bank (no em dashes in social copy)
Tagline · Mechanics ("Buy-ins escrowed on-chain · Picks locked at kickoff · Last one standing takes the pot") · Trust line · Lock line ("No 'I definitely picked the Bills' texts on Monday.") · No-cut ("100% of the buy-ins go to the winner. Commish takes nothing.") · TxSheet join ("Locks {amount} USDC in this pool's vault. Only the winner can take it out. If the pool is ever abandoned, you can reclaim your share.") · TxSheet pick ("Locks in {TEAM} for Week {n}. You can change it until kickoff.") · OUT ("{name} took the {TEAM}. The {TEAM} did not cooperate.") · Empty ("No picks yet. Lock is in {countdown}.") · X bio ("Your Survivor pool, out of that one guy's Venmo. Buy-ins escrowed on-chain, picks locked at kickoff, last one standing takes the pot. Built on Solana. 🏈").

## 19. Founder context
Solo founder who also runs HoldFlow (Solana creator-fee distribution: escrow PDAs, holder snapshots, payout engines, Supabase). Money-code review is in experienced hands; the assistant's job is to make everything around it fast, clean, and on-brand. First repo commit inside the hackathon window; spec and API research before it are fine.
