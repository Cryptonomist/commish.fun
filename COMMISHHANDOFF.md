# COMMISH.FUN — complete project handoff (v2)
*Paste this whole document into your coding assistant. It is self-contained: product, game rules, on-chain design, security, wallet integration, design system, screens, copy, and the 7-day plan. It supersedes every earlier version. Decisions marked FINAL are not up for re-litigation.*

---

## 0. Read this first: how to work from this document

- **Division of labor.** The assistant scaffolds the web app, the results-sync server, wallet wiring, UI, and tests. The Anchor program and every instruction that moves tokens are hand-written and reviewed by the founder. Generate program skeletons when asked, and flag every lamport- or token-moving line for human review.
- **Scope discipline.** Everything below is tagged MUST (ships or the product doesn't work), SHOULD (ships if on schedule), or STRETCH (only if ahead). When in doubt, cut STRETCH first, then SHOULD. Seven days is the whole budget.
- **Secrets never appear in chat or in the repo.** Code references env var names only. Values are entered by the founder in the hosting dashboard.

---

## 1. What Commish is

**One-liner:** The Solana version of the office Survivor pool. Buy-ins escrowed on-chain, picks locked before kickoff, eliminations settled from real NFL results, pot to the last wallet standing. Nobody holds the money, because nobody needs to.

**Tagline (FINAL):** "Your Survivor pool, out of that one guy's Venmo."
**Trust line (FINAL):** "The commissioner keeps the job, loses the custody."
**Domain / brand name (FINAL):** commish.fun — written as COMMISH.FUN in display type, `commish.fun` in running text.

**Context:** Entry in NoahAI Nitro 03 (Sept 3–10, 2026; theme "Build the Solana version of your favorite Web2 product"). NFL Week 1 kicks off Thursday Sept 10, 8:20pm ET — submission day is the last day to join a Week 1 Survivor pool. The Web2 product being replaced: the Venmo/Cash App group where one guy holds everyone's buy-ins all season.

**Positioning decisions (FINAL):**
- Private pools only, link-to-join. No public directory. This is for people who already know each other.
- **Commish takes no cut.** 100% of buy-ins go to the winner. A platform fee is a later decision, not a v1 feature.
- **$0 buy-in pools are allowed.** A pool with buyIn = 0 still runs the full game (picks, locks, eliminations, bragging rights). This lets leagues that don't want money involved use it, and is the safest onboarding for first-timers.

---

## 2. Game rules (FINAL — fixed, not configurable)

- Everyone pays the buy-in (USDC; may be 0) to join. Pool closes to new members at Week 1 lock.
- Each week: pick ONE NFL team to WIN. All picks lock at that week's first kickoff (one global weekly lock, Thursday night).
- Your team wins → you advance. Loses OR ties → OUT. No pick by lock → OUT.
- Each team usable once per season (enforced by a per-member 32-bit mask).
- Teams on a bye week cannot be picked (the UI hides/greys them; if a pick somehow lands on a bye team, the results mask has that bit off, so it is treated as a loss — consistent and deterministic).
- Last member standing takes the pot. Edge cases, all in-program:
  - Everyone remaining is eliminated in the same week → pot splits evenly among that week's entrants.
  - Multiple survivors after Week 18 → even split.
  - Pool never settled (abandoned commissioner, dead server) → **deadman refund**: after refundDeadlineTs (season end + 30 days), any member reclaims their pro-rata share. The pot cannot be stranded by anyone.

### Team index (FINAL — the bitmask order)
Index = alphabetical by abbreviation, 0-based:
`ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS`
(0 = ARI … 31 = WAS). Ship a static `teams.json` with abbr, city, nickname, primary + secondary hex colors, and the ESPN team id used to map scoreboard results to this index.

**Trademark rule:** never use NFL or team logos, marks, or the "NFL" name in the brand. City names, abbreviations, and colors are facts and are fine. Team tiles are colored circles with the abbreviation, not logos.

---

## 3. On-chain design (Anchor program, Solana)

### Accounts
- **Pool PDA** — seeds `["pool", commissioner, nonce]`
  - commissioner, usdcMint, buyInAmount, maxMembers, memberCount, aliveCount
  - currentWeek (u8), weekLockTs (i64), disputeWindowSecs (u32, ~86400), refundDeadlineTs (i64)
  - pendingResults: Option<{week: u8, winnersMask: u32}>, resultsPostedTs, vetoCount (u16)
  - settled: bool, winnersCount (u16), potPerWinner (u64)
  - name: [u8; 32] (pool display name), bump
- **Vault** — USDC associated token account owned by the Pool PDA. Only program logic moves funds.
- **Member PDA** — seeds `["member", pool, wallet]`
  - wallet, paid: bool, joinedTs
  - displayName: [u8; 24] (so the UI shows "Dave", not `7xK…`)
  - eliminatedWeek: Option<u8>, usedTeamsMask: u32
  - currentPick: Option<u8>, pickWeek: u8
  - vetoedWeek: Option<u8> (one veto per member per posted result), claimed: bool

### Instructions
1. `create_pool(name, buy_in, max_members, week1_lock_ts, refund_deadline_ts)`
2. `join_pool(display_name)` — transfers buy-in to vault; one member per wallet; rejects after Week 1 lock or when full.
3. `submit_pick(team)` — rejects if `now >= weekLockTs`, team bit set in usedTeamsMask, member eliminated, or team index > 31. Overwrite allowed until lock. **Build this instruction and its rejection tests before any UI exists.**
4. `post_week_results(week, winners_mask)` — commissioner only; requires `now >= weekLockTs` (can't post before games), no pending results, week == currentWeek. Starts the dispute window.
5. `veto_results` — any alive member, once per posted result; when vetoCount > aliveCount / 2, pendingResults is cleared for a re-post.
6. `settle_week` — permissionless, requires `now >= resultsPostedTs + disputeWindowSecs`. Marks OUT every alive member whose pick's bit is off or who has no pick; commits the pick to usedTeamsMask; increments week; sets next lock. aliveCount → 0: that round's entrants become winners. aliveCount == 1 or week > 18: settled, potPerWinner computed once.
7. `claim_pot` — winner pulls their share; `claimed` flag prevents double-claim.
8. `reclaim_dues` — deadman path: `now >= refundDeadlineTs && !settled`; pro-rata by paid members; sets claimed.

### Trust model (state this on the site, in the repo, and in the submission)
Results enter through the commissioner's signature; there is no oracle pretense. What the chain removes is every way that trust historically fails: the commissioner cannot spend the pot, change rules mid-season, slow-pay, quietly post fake results (24h member veto against results anyone can check on any scoreboard), or strand the money (deadman refund). *The commissioner keeps the job, loses the custody.*

### Pick privacy
- MVP (MUST): picks are technically public on-chain; the app hides other members' current picks until lock, then reveals. Say so honestly in the FAQ.
- STRETCH: commit-reveal (store hash(team, salt); server holds salts and reveals after lock).

---

## 4. Security (program, wallet, app, ops)

### Program security checklist (each item gets a test)
- **Canonical USDC only.** `create_pool` hard-checks `usdc_mint == EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` on mainnet (devnet: the devnet USDC mint used in tests). A fake-mint "USDC" is the #1 attack on any escrow; the vault must be the ATA of the pool PDA for that exact mint.
- Signer + owner checks on every instruction; PDAs re-derived from seeds and bump-validated; `has_one = commissioner` where commissioner-only.
- Token accounts validated: vault owner == pool PDA, mint matches, token program is the real SPL Token program.
- Checked arithmetic everywhere (`checked_add/sub/mul/div`); potPerWinner uses integer division, dust stays in the vault (document it).
- Time from `Clock::get()` only; every time-gated path (pick lock, post-after-lock, dispute expiry, deadman) tested at boundary ±1 second.
- No re-initialization: `init` only, never `init_if_needed` on member or pool accounts.
- Idempotency: `settle_week` cannot run twice for the same week; `claim_pot` / `reclaim_dues` gated by `claimed`.
- Veto integrity: one veto per member per posted result (`vetoedWeek`), only alive members count, commissioner's own veto counts like anyone's.
- `deadman` and `claim_pot` are mutually exclusive by `settled`.
- Upgrade authority: keep it on the founder's dev wallet during the hackathon (bugfix ability), disclose that on the site's trust page, and note the plan to move it to a multisig after. Never pretend it's immutable.
- Tests: Anchor test suite covering happy path + every rejection path above + the three payout paths (last standing, co-winner split, deadman). Run on devnet before mainnet.

### Wallet integration (MUST)
- `@solana/wallet-adapter-react` + `@solana/wallet-adapter-react-ui`. Auto-detects Phantom, Solflare, Backpack via Wallet Standard. Standard modal, dark-themed to the palette.
- **No embedded-wallet provider (Privy/Dynamic) in v1** — noted as the phase-2 path for non-crypto users.
- Transaction hygiene: one user action = one transaction; simulate before send; the confirm sheet says in plain words what moves ("Locks 20 USDC in the pool vault. You get it back if the pool is abandoned."), shows the vault address, and links it to the explorer.
- Never request a blanket token approval/delegate. Never ask for a signature that isn't a transaction the user initiated (no drive-by signMessage on load).
- Session state: the app is wallet-only; no accounts, passwords, or email logins. If the server ever needs to know who's asking (STRETCH), use a signed-message challenge (Sign-In-With-Solana pattern), short-lived, never stored beyond the session.

### App & ops security
- Public repo: `.env*` in `.gitignore` from commit one; keys referenced by name; a leaked key gets rotated in Helius, not just deleted from git.
- Browser RPC key: Helius key restricted to `commish.fun`, `www.commish.fun`, `localhost` in the Helius dashboard (domain allowlist is the protection; the key itself is public by nature in a frontend bundle).
- Server secrets (results server, any fee-payer keypair for cranks) live only in the hosting platform's environment/secrets UI. A crank keypair holds a few dollars of SOL, nothing more.
- Strict Content-Security-Policy; no inline eval; dependencies pinned; no third-party analytics that captures wallet addresses. Cloudflare already set: Full (strict) TLS, Always HTTPS, min TLS 1.2, DNSSEC, DMARC reject. Enable HSTS on launch day after the site serves cleanly.
- Rate-limit the results proposal endpoint; ESPN calls are cached server-side (one fetch per minute max), never made from the browser.
- Trust page (`/trust`) on the site: the trust table, the vault-per-pool explanation, upgrade-authority disclosure, "we take no cut," and links to the program on the explorer and the public repo.

---

## 5. Design system — "Primetime"

### The idea
The visual world of a **Thursday-night broadcast graphics package**: night-game black, chalk-white type, leather orange, gold for money. Condensed display type like a scorebug lower-third; restrained, confident, zero cartoon. Football is in the *bones* (chalk lines, tabular scoreboard numbers, the laces mark, ALIVE/OUT status language), not in decoration (no clip-art helmets, no turf textures, no team logos).

**Dark theme only (FINAL).** One theme = half the CSS and every screenshot on-brand.

### Tokens (FINAL)
```
--night:      #120D0A   ground
--night-2:    #1D1310   raised surfaces (cards, sheets)
--line:       rgba(246,239,226,0.10)   chalk hairlines / dividers
--cream:      #F6EFE2   primary text, the wordmark
--cream-60:   rgba(246,239,226,0.60)   secondary text
--cream-40:   rgba(246,239,226,0.40)   labels, captions
--leather:    #FF5C1B   brand, links, primary buttons, focus rings
--leather-hi: #FF7A45   hover
--gold:       #E9C258   MONEY ONLY: pot totals, payouts, buy-in amounts
--alive:      #35C97A   ALIVE state, confirmed tx
--out:        #E5484D   OUT state, destructive, errors (never brand)
--radius-sm: 10px  --radius: 14px  --radius-lg: 20px  --pill: 999px
--space: 4px base; 8 / 12 / 16 / 24 / 32 / 48
```
**The one rule:** orange is the brand, gold is the money. Nothing else is ever gold.

### Type
- Display: **Anton** (Google Fonts) — wordmark, pot totals, week headers, ALIVE/OUT stamps. Always uppercase, letter-spacing 0.015em. Tabular numerals for money.
- UI/body: **Space Grotesk** 400/500/600/700.
- Scale: 12 caption · 14 body-sm · 16 body · 20 h3 · 28 h2 · 40 h1 · 64+ display (pot number).

### The mark
THE LACES — SVG below. Cream on leather (avatar, app icon, favicon, empty states); leather on night (in-app header, loaders). Never drawn as a football; never inside the wordmark. The wordmark is the text COMMISH.FUN in Anton, ".FUN" in leather.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200">
  <g transform="rotate(-14)" fill="#FF5C1B">
    <rect x="-9" y="-84" width="18" height="168" rx="9"/>
    <rect x="-49" y="-63" width="98" height="18" rx="9"/>
    <rect x="-49" y="-27" width="98" height="18" rx="9"/>
    <rect x="-49" y="9" width="98" height="18" rx="9"/>
    <rect x="-49" y="45" width="98" height="18" rx="9"/>
  </g>
</svg>
```
**Signature motion (SHOULD):** the laces glyph is the app's progress/loading indicator — the four ticks light up in sequence. In a pool view, the member's row shows a mini laces glyph with one tick lit per week survived (5+ weeks wraps to a count). That single detail turns the logo into the product.

### Layout principles
- **Mobile-first.** Picks happen on phones on Thursday afternoons. Design at 390px, then let it breathe on desktop (max content width 640px for game screens; 960px for the commissioner panel).
- **One screen, one action.** Every screen has exactly one leather button. Secondary actions are text links.
- **The pot is the hero.** Wherever a pool is shown, the pot (gold, Anton, tabular) is the largest thing on the screen, with "N alive" beside it.
- **Chalk lines, not cards-in-cards.** Sections separated by 1px `--line` hairlines; cards (`--night-2`) only for interactive tiles and sheets.
- **Status is a stamp.** ALIVE (alive green) / OUT (out red) rendered as small Anton pills, uppercase. No icons needed.
- **Countdown is always visible** on any pool screen before lock: "PICKS LOCK THU 8:20 PM ET · 2d 4h 12m", in the viewer's local time with ET in parentheses.
- Motion: 150–200ms ease-out on state changes; one celebratory moment only (the payout screen); respect `prefers-reduced-motion`.
- Accessibility: cream-on-night and leather-on-night both clear 4.5:1; 44px minimum tap targets; focus ring = 2px leather; team tiles are buttons with the full team name as their accessible label.

### Components
`WalletButton` (adapter modal, restyled) · `PotDisplay` (gold display number + "N alive") · `Countdown` · `TeamGrid` / `TeamTile` (32 tiles: colored circle with abbreviation; states: default / selected (leather ring) / used (struck, dimmed) / bye (dimmed, "BYE" caption)) · `MemberRow` (display name, ALIVE/OUT stamp, weeks-survived laces) · `StatusBanner` (results proposed → dispute countdown → settled) · `TxSheet` (plain-English confirm + explorer link + states: signing / sending / confirmed / failed) · `ShareCard` (see §7) · `RulesSheet` (the rules from §2, verbatim).

---

## 6. Screens (MUST unless marked)

1. **`/` Landing** — wordmark, tagline, three mechanics, one button: CREATE A POOL. Below the fold: the trust table, "How the money moves" (buy-in → vault PDA → winner, with a live explorer link once any pool exists), FAQ (5 questions max), link to `/trust` and the repo.
2. **`/new` Create pool** — name, buy-in (USDC, 0 allowed), max members, display name for the commissioner (who auto-joins). Week 1 lock time is set by the app from the schedule, shown, not editable. One button: CREATE. Result: the pool page with a big COPY INVITE LINK.
3. **`/p/:pool` Pool page (the hub)** — works **without a wallet connected**: pool name, pot, alive count, countdown, member list (names + status), rules link, vault address → explorer. With wallet: JOIN (if open) or the current-week pick state. This page is the share target; everything a skeptical buddy wants to verify is on it, wallet or not.
4. **`/p/:pool/pick` Pick** — TeamGrid for the current week; selected team confirm → transaction. After lock: shows your locked pick and, once revealed, everyone's.
5. **`/p/:pool/commish` Commissioner panel** — proposed results from the server (ESPN scores side by side with the winners mask), CONFIRM button (signs `post_week_results`), dispute-window status, member veto count, and SETTLE WEEK (permissionless crank, but surfaced here).
6. **`/p/:pool/history` Season board (SHOULD)** — week-by-week grid: each member's pick per week, colored by result. This is the Monday-morning group-chat screenshot.
7. **`/p/:pool/claim` Payout (MUST, small)** — for winners: CLAIM POT (gold), the one celebratory moment. For deadman: RECLAIM BUY-IN with an explanation.
8. **`/trust`** — static; see §4.

Empty/loading/error states are designed, not defaulted: loading = laces ticks; empty pool = "No picks yet. Lock is in 2d 4h."; tx failure = plain English + "nothing left your wallet" when true.

---

## 7. Features that boost usability, trust, and fun (all ≤ 7 days)

**MUST**
- **Display names on-chain** (member PDA) so the pool reads like a group chat, not a block explorer.
- **Public, wallet-less pool page** with explorer links for the vault and every settlement transaction. Trust by inspection.
- **Countdown + lock time in local timezone**, plus an "Add lock time to calendar" (.ics download) link — the reminder system that needs no email infra.
- **Plain-English transaction sheets** (§4 wallet hygiene).
- **$0 pools** (§1).
- **Rules sheet** reachable from every pool screen; the rules are short enough to read in 20 seconds.

**SHOULD**
- **Season board** (`/history`) and a **ShareCard**: a 1200×630 image of the pool state (pot, alive count, week) rendered server-side for the invite link's Open Graph preview, so the link itself sells the pool in the group chat. Static OG fallback if dynamic rendering slips.
- **Weekly recap banner** after settlement: "Week 3: 4 out, 6 alive. Dave picked the Jets. Dave is out." — generated from on-chain state; it's the banter engine.
- **Laces-as-progress** (§5 signature motion).
- **PWA manifest** with the app icon: installable to the home screen in one tap; the pick screen becomes a Sunday-morning app.
- **Demo/replay flag** on a pool: settles against a real historical week so the stage demo shows an elimination live.

**STRETCH**
- Commit-reveal picks. Sleeper league attach (full-league dues escrow with standings payouts). Telegram bot for lock reminders.

**Explicitly NOT in v1:** public pool directory, platform fees, fiat on-ramp, embedded wallets, chat, push notifications, light theme, multi-sport.

---

## 8. Off-chain

### Data
- **Game winners:** ESPN public scoreboard JSON — `site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` (optionally `?week=N&seasontype=2`). Server maps ESPN team ids → §2 index, computes `winnersMask` (tie or not-final = bit off), caches per minute. Verify the endpoint and the response shape at build time; paste a real sample response into the assistant's context.
- **Schedule / lock times:** the same endpoint yields each week's first kickoff; store the 18 weekly lock timestamps in `schedule.json` at build time so lock logic never depends on a live call.
- **Backup:** nflverse datasets (GitHub, free). **Stretch mode:** Sleeper public API (no auth): `/v1/state/nfl`, `/v1/league/{id}`, `/rosters`, `/users`, `/matchups/{week}`.

### Server (thin, stateless where possible)
Polls ESPN, produces proposed results, renders them on the commissioner panel, and pre-builds the `post_week_results` transaction for the commissioner's wallet to sign. Optionally runs the permissionless `settle_week` crank with a low-balance fee-payer keypair after each dispute window. No user accounts, no database required for MVP (all game state is on-chain; server state is a cache).

### Infrastructure (FINAL)
- RPC: **Helius** (separate key for Commish; domain-restricted in the Helius dashboard). Devnet through day 6, mainnet for the demo pool.
- Hosting: wherever the assistant deploys fastest during the week; DNS is already on Cloudflare (zone hardened), connect via CNAME on day one.
- Env var names: `NEXT_PUBLIC_RPC_URL` (or `VITE_RPC_URL`), `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_USDC_MINT`, `NEXT_PUBLIC_CLUSTER`; server-side `CRANK_KEYPAIR` (base58, optional), `ESPN_CACHE_TTL`.

---

## 9. Copy bank (voice: confident, league-native, plain; no em dashes in social copy)

- Tagline: Your Survivor pool, out of that one guy's Venmo.
- Mechanics: Buy-ins escrowed on-chain · Picks locked at kickoff · Last one standing takes the pot
- Trust: The commissioner keeps the job, loses the custody.
- Lock: No "I definitely picked the Bills" texts on Monday.
- No-cut: 100% of the buy-ins go to the winner. Commish takes nothing.
- Tx sheet (join): Locks {amount} USDC in this pool's vault. Only the winner can take it out. If the pool is ever abandoned, you can reclaim your share.
- Tx sheet (pick): Locks in {TEAM} for Week {n}. You can change it until kickoff.
- OUT copy: {name} took the {TEAM}. The {TEAM} did not cooperate.
- Empty pool: No picks yet. Lock is in {countdown}.
- X bio: Your Survivor pool, out of that one guy's Venmo. Buy-ins escrowed on-chain, picks locked at kickoff, last one standing takes the pot. Built on Solana. 🏈

---

## 10. Seven-day plan (Sept 3–10)

- **Day 1 (Thu 3):** Anchor: pool/member accounts, `create_pool`, `join_pool`, `submit_pick` with all rejection tests, canonical-mint check. Devnet green. App: scaffold, wallet adapter, design tokens, `teams.json`, `schedule.json`, Landing + Create screens.
- **Day 2 (Fri 4):** `post_week_results` → `veto_results` → `settle_week` with boundary tests. App: Pool page (wallet-less), TeamGrid, Pick flow end to end on devnet.
- **Day 3 (Sat 5):** Payout paths: `claim_pot`, co-winner split, `reclaim_dues`; tests. ESPN results server + Commissioner panel + CONFIRM. Demo/replay flag.
- **Day 4 (Sun 6):** Full loop on devnet with 3 wallets: create → join → pick → post → veto → settle → claim. Fix everything that hurts. TxSheet copy, empty/error states, Countdown + .ics.
- **Day 5 (Mon 7):** Season board, ShareCard/OG, PWA manifest, laces progress, `/trust` page, rules sheet. Security checklist pass on the program (every item in §4 has a test).
- **Day 6 (Tue 8):** Mainnet deploy of the program; domain connected; Helius key restricted; HSTS on. Record the backup demo video. Onboard the founder's real league as the first pool.
- **Day 7 (Wed 9):** Polish, submission writeup, launch thread scheduled. Reserve the evening for nothing — buffer.
- **Sept 10 (Thu):** Submit. Kickoff 8:20pm ET. Launch thread from the brand account (banner) and the founder's personal account (the Cash App story).

## 11. Demo script (~90s)
1. "Every year I send $20 to my buddy's Cash App for our league and trust him for five months. Here's the version where nobody has to."
2. Create a pool live; two phones join; the pot fills on screen, vault address on the explorer.
3. Both phones pick; lock hits; picks frozen. "No 'I definitely picked the Bills' texts on Monday."
4. Replay a real historical week → CONFIRM → one phone stamps OUT; the survivor claims the pot in gold.
5. "Results anyone can veto, a pot nobody can strand, picks nobody can backdate, and Commish takes nothing. Week 1 locks Thursday. Real pools can use this today."

## 12. Founder context
Solo founder who also runs HoldFlow (Solana creator-fee distribution: escrow PDAs, holder snapshots, payout engines). The money code review is in experienced hands; the assistant's job is to make everything around it fast, clean, and on-brand. Check the Nitro 03 rules for what counts as building inside the window; first repo commit is inside it.
