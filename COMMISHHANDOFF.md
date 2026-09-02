# COMMISH.FUN — product design & build document (handoff v5)

*Complete, self-contained specification. Paste it whole into the coding assistant. Supersedes every earlier version. FINAL = decided. MUST / SHOULD / STRETCH tags govern cuts: STRETCH goes first, then SHOULD, never a MUST. Section 21 is the build order. Section 19 is the legal framework — every product decision below was checked against it.*

**Contents:** 0 Working rules · 1 What a Survivor pool is · 2 Product & positioning · 3 Revenue model (legally constrained) · 4 Survivor rules · 5 Game modes (with legal posture) · 6 Fantasy layer · 7 Tech stack · 8 Repo layout · 9 On-chain program · 10 Static data · 11 Database & jobs · 12 Wallet & onboarding · 13 Design system · 14 Components · 15 Screens & acceptance · 16 Loyalty loop · 17 X linking & leaderboard · 18 Integration API · 19 Legal framework & compliance controls · 20 Security & ops · 21 Build order · 22 QA · 23 Copy bank · 24 Demo & launch · 25 Founder context

---

## 0. Working rules
1. The assistant builds app, DB, jobs, API, UI, tests, and generates the Anchor program from §9; every token-moving line is reviewed by the founder before deploy. Flag those lines.
2. On-chain state is the source of truth; the DB is a cache; the API is read-only; the program is the write API.
3. Secrets never appear in chat or repo.
4. Simplicity is the design: one primary action per screen.
5. **Compliance controls in §19.6 are MUST**, not polish. They ship with the first paid pool.
6. Build order (§21) is fixed; vertical slices.

---

## 1. What a Survivor pool is
Everyone puts in the same buy-in. Each week every player picks **one NFL team to win its game** (no point spreads). Win → you survive. Lose or tie → you're out. The twist: **each team can be used only once per season**, so you have to plan. Most players are gone within a few weeks; the last one standing takes the pot; if everyone left is eliminated the same week, they split it. Ten seconds a week, drama every Sunday, and today it runs through one person's Venmo — which is the problem Commish solves.

---

## 2. Product & positioning (FINAL)
- **One-liner:** The Solana version of the office Survivor pool. Buy-ins escrowed on-chain, picks locked before kickoff, eliminations settled from real NFL results, pot to the last one standing. Nobody holds the money, because nobody needs to.
- **Tagline:** "Your Survivor pool, out of that one guy's Venmo." **Trust line:** "The commissioner keeps the job, loses the custody."
- **Brand:** COMMISH.FUN (display) / commish.fun (text). Launch at NoahAI Nitro 03 (Sept 3–10, 2026); NFL Week 1 kicks off Thu Sept 10, 8:20pm ET.
- **Who:** commissioners running pools for people they know; members on phones on Thursday afternoons, mostly not crypto users.
- **Private pools only**, link-to-join, no directory; **$0 pools allowed** everywhere; pools can start any week.
- **Language (FINAL):** "pool," "buy-in," "pot," "contest," "pick." Never "bet," "wager," "odds," "book." This is product truth, not cosmetics (§19).
- **No NFL/team logos or marks**; city names, abbreviations, colors only.
- **Commish takes no economic benefit from any real-money pool** in Season 1 (§3, §19). The program has fee fields so the policy can change per state later, never retroactively.

---

## 3. Revenue model (legally constrained — read §19 first)

**The governing fact:** in Texas (the founder's state), private pools are defensible only when *no person receives any economic benefit other than personal winnings* (Penal Code §47.02(b)), and anyone who "for gain, becomes a custodian of anything of value bet" commits gambling promotion (§47.03). The Attorney General's 2016 opinion summarized it as: "it is prohibited gambling in Texas if you bet on the performance of a participant in a sporting event and the house takes a cut." A rake on real-money pools is therefore off the table for Texas users, and any fee tied to real-money contests anywhere needs state-by-state counsel.

**Season 1 (FINAL): zero platform economics on real-money pools.** 100% of buy-ins to winners. This is the legal posture, and it happens to be the best marketing line the product has.

**Revenue paths, in order of legal cleanliness:**
1. **Commish Pro — software subscription for commissioners (SHOULD, post-hackathon).** The established no-rake model (RunYourPool sells software and disclaims wagering; Splash never touches funds on self-managed pools). Features priced: custom pool branding, season archives, multi-pool dashboards, pool templates, priority support, advanced recap/share tools. Applies identically to $0 pools; never gates trust, payout, or fairness features; never scales with pot size. Counsel question to resolve before launch: whether a software fee from an operator whose *program* custodies the pot reads as "for gain … custodian" under §47.03 — the mitigation is that the company controls nothing (§9, §19.4).
2. **Sponsorships and brand partnerships** on the free product (non-sportsbook only), e.g. a Season 1 title sponsor for the public leaderboard. No in-app ads.
3. **Pot fee (`fee_bps`, capped) and creation fee (`creation_fee`)** — built into the program, **default 0, and enable-able only per state where counsel confirms a licensed or exempt basis** (many states regulate paid fantasy/skill contests with licensing; Texas has no statute and an adverse AG opinion). Geo-gated by §19.6 controls. Not a Season 1 lever.
4. **Fantasy-format fees** (§6) have the strongest federal posture (UIGEA carve-out) but the same Texas problem; treated like #3.

Explicitly excluded: sportsbook affiliates, lending the escrowed pot for yield, anything paid by the pot in Texas.

---

## 4. Survivor rules (FINAL, not configurable)
Buy-in (may be 0). Joining closes at the start-week lock. One pick per week, a team to WIN; picks lock at the week's first kickoff. Win → advance; loss/tie → OUT; no pick → OUT. Each team once per season (32-bit mask). Bye teams unpickable. **Push:** cancelled/no-contest game → picks of either team survive and the team is consumed; postponed games are waited for (results post only when every game is final or pushed). Last standing takes the pot; all-out-same-week → that week's entrants split; multiple survivors after Week 18 → split; not settled by `refund_deadline` (season end + 30 days) → deadman refund, pro-rata. Integer division; dust stays in the vault.
**Team index (FINAL):** `ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS` (0..31).

---

## 5. Game modes — build as many as the week allows, in this order

All modes run on one engine: escrow vault, on-chain locked picks, commissioner-posted results behind a member veto window, deterministic settlement, deadman refund. `pool_type` selects the pick shape and the scoring rule.

| # | Mode (`pool_type`) | Rules in one line | Results shape | Legal posture (§19) | Tag |
|---|---|---|---|---|---|
| 0 | **Survivor** | One team to win per week; team once per season; last standing | winners + pushes masks | Pool on team outcomes: relies on state social-pool defenses; no fees | **MUST** |
| 1 | **Loser pool** | One team to LOSE per week; if it wins you're out | same masks | same as Survivor | **MUST** (one branch) |
| 2 | **Pick'em** | Pick every game's winner; a point each; weekly pot to top score, season pot to best total | pick = u32 mask; score = popcount(pick & winners) + pushes | same as Survivor; more skill-weighted | **SHOULD** |
| 3 | **Confidence** | Pick every winner and rank 1..N; correct pick scores its rank | pick mask + rank bytes | same; strongly skill-weighted | SHOULD (after 2) |
| 4 | **Pick-3 Jackpot** | Pick 3 winners; all correct → split the week; none → pot rolls over | 3-bit pick; rollover accounting | same; rollover pot must remain in-vault, no house stake | STRETCH |
| 5 | **Team Draft** | Snake-draft the 32 teams pre-season; your score = your teams' wins; season standings | owned-teams mask per member; weekly popcount(owned & winners) | same; season-long skill | STRETCH |
| 6 | **Squares** | 10×10 grid; digits assigned at lock; payouts per quarter | quarter line scores | Chance-based (no skill): defensible only as a no-benefit private pool; never fee-bearing | Playoffs (Jan) |
| 7 | **Playoff bracket** | Fill the bracket; points per round | playoff results tree | skill-weighted pool | January |
| — | **Spread pick'em / Underdog / Over-under** | Uses betting lines | odds feed | **Excluded**: sports-betting-adjacent; sports betting is illegal in Texas through at least 2027 | Not built |
| — | **Player of the Week** | One athlete, one game | player stats | **Excluded**: outside the UIGEA fantasy carve-out (single athlete, single event) | Not built |
| — | **Charity pools** | Part of the pot to a charity wallet | — | **Excluded for now**: a third party receiving part of the pot may defeat the "no economic benefit" defense | Counsel first |

Pool creation shows a mode picker once mode 1 exists. Hackathon target: **0, 1 as MUST; 2 as SHOULD; 3–5 as STRETCH**, with `pool_type` and the pick/score abstractions built so each addition is a scoring function and a pick control, not a redesign.

---

## 6. Fantasy layer (post-hackathon; architecture reserved now)

**Track A — Sleeper league treasurer (SHOULD, October).** Attach a Sleeper league (public API, no auth: `/v1/league/{id}`, `/rosters`, `/users`, `/matchups/{week}`, `/v1/state/nfl`). Dues escrowed at draft time; final standings synced; payouts fire by the split chosen at creation (1st/2nd/3rd, optional weekly high score). Same post → veto → settle spine; results shape = a **scoresheet root** (below). Biggest fantasy market for the least build.

**Track B — native fantasy-lite modes (November+):**
- **One & Done:** one player per week, any position, standard scoring, never reuse a player, best season total wins. Single search box; Survivor's strategic DNA applied to players.
- **Weekly Showdown:** QB/RB/WR/TE/FLEX each week, no salary cap, no player reuse across the season; weekly + season pots.
Both accumulate stats across many players and many games, which is what the federal fantasy carve-out requires (§19.3). Player-of-the-Week is excluded for that reason.

**Engine generalization (reserve now, build later):** Pool gets `results_root: [u8;32]` per week. For scored modes the server computes every member's points from player stats (nflverse, free, post-game; Sleeper stats as backup), publishes the full scoresheet, and the commissioner posts its Merkle root behind the veto window; `settle_member` takes `(points, proof)` and verifies against the root. Masks for pick games, roots for scored games, one escrow underneath.

---

## 7. Tech stack (FINAL)
Anchor 0.30+/Rust/`anchor-spl` · Next.js 14 App Router/TypeScript/Tailwind/`@tanstack/react-query` · `@solana/wallet-adapter-react` + `-react-ui` (Mobile Wallet Adapter on Android; Phantom/Solflare in-app browser on iOS) · `@coral-xyz/anchor` typed client · Supabase (Postgres, RLS, Auth with X provider) · Helius RPC (domain-restricted key) · route-handler jobs on a scheduler with `CRON_SECRET` · Vercel hosting (geo headers used for §19.6) · Cloudflare DNS · self-hosted Anton + Space Grotesk · Plausible/Umami analytics (never wallet addresses).

## 8. Repository layout
```
programs/commish/src/{lib.rs,state.rs,errors.rs,events.rs,instructions/*.rs}   tests/   idl/commish.json
app/app (routes) · app/components · app/lib/{anchor,pda,tx,teams,schedule,format,ics,scoring}.ts
app/lib/server/{indexer,results,espn,supabase,verify,ratelimit,geo}.ts · app/data/{teams.json,schedule.json,restricted-states.json}
app/public/{fonts,brand,manifest.webmanifest,icons} · supabase/migrations · scripts/build-schedule.ts
brand/ · docs/{PROGRAM.md,API.md,MANUAL-CLAIM.md,LEGAL.md} · README.md · COMMISH-HANDOFF.md
```

---

## 9. On-chain program

### 9.1 State machine
`Open` → weekly `Locked` → `ResultsPosted` (dispute window) → `Finalized` (per-member settlement) → `Advanced` … → `Settled` (claims) | `Abandoned` (deadman refunds). Per-member settlement via permissionless crank; week advances when every alive member is processed.

### 9.2 Accounts
**Config** (`["config"]`): `admin, fee_treasury, default_fee_bps: u16, default_fee_cap: u64, creation_fee: u64, paused: bool`. Defaults copied into pools at creation; changes never touch existing pools. **Season 1: all zero.**

**Pool** (`["pool", commissioner, nonce_le_u64]`, space 1024):
```
commissioner, usdc_mint, vault: Pubkey   nonce: u64   name: [u8;32]   pool_type: u8
buy_in: u64   max_members: u16   member_count: u16   alive_count: u16   alive_at_week_start: u16   processed_this_week: u16
start_week: u8   current_week: u8   lock_ts: [i64;18]   refund_deadline_ts: i64   dispute_window_secs: u32
winners: [u32;18]   pushes: [u32;18]   results_root: [[u8;32];18]   results_posted: [bool;18]
pending_winners: u32   pending_pushes: u32   pending_root: [u8;32]   pending_week: u8   pending_posted_ts: i64   veto_count: u16
finalized_week: u8   status: u8   winners_week: u8   winners_count: u16   pot_per_winner: u64
weekly_pot_bps: u16 (pick'em: share of pot paid weekly)   rollover: u64 (jackpot modes)
fee_bps: u16   fee_cap: u64   fee_treasury: Pubkey   fee_paid: bool   refund_per_member: u64   bump: u8
```
**Member** (`["member", pool, wallet]`, space 256):
```
pool, wallet: Pubkey   display_name: [u8;24]   paid: bool   sponsored_by: Pubkey   joined_ts: i64
used_mask: u32   current_pick: u8 (255 none)   pick_mask: u32 (pick'em/confidence/pick-3)   ranks: [u8;16] (confidence)
owned_mask: u32 (team draft)   pick_week: u8   pick_note: [u8;24]   points: u32 (season total, scored modes)
processed_week: u8   eliminated_week: u8   vetoed_week: u8   claimed: bool   bump: u8
```
**Vault:** pool PDA's ATA for `usdc_mint`; only program CPIs move tokens out.

### 9.3 Instructions (constraints in full)
| # | Instruction | Signer | Constraints | Effect |
|---|---|---|---|---|
| 1 | `init_config` / `update_config` | deployer / admin | once / `has_one admin` | defaults for future pools only |
| 2 | `create_pool(nonce, name, pool_type, buy_in, max_members, start_week, lock_ts[18], refund_deadline_ts, weekly_pot_bps, commissioner_plays, display_name)` | commissioner | `usdc_mint == CANONICAL_USDC`; `2..=500` members; `1..=18` start; `lock_ts` strictly increasing; `lock_ts[start-1] > now`; `refund_deadline > lock_ts[17]+7d`; `!paused`; creation fee only if `buy_in>0 && creation_fee>0` | init pool + vault; copy fee fields ($0 pool → 0); optional commissioner Member |
| 3 | `join_pool(display_name)` | member | `now < lock_ts[start-1]`; not full; Member `init`; transfer buy-in (skip if 0) | counts++ |
| 4 | `sponsor_join(wallet, display_name)` | commissioner pays | as join; `sponsored_by = commissioner` | commissioner covers a friend's seat |
| 5 | `submit_pick(team, note)` (survivor/loser) | member | `team<=31`; `now<lock`; alive; not used; Open | set pick |
| 6 | `submit_pick_mask(mask, ranks?)` (pick'em/confidence/pick-3) | member | `now<lock`; mask ⊆ that week's scheduled teams; pick-3: popcount==3; confidence: ranks is a permutation of 1..games | set pick_mask/ranks |
| 7 | `draft_team(team)` (team draft) | member, in draft order | draft window open; team unowned; turn check via `draft_cursor` on Pool | `owned_mask |= bit` |
| 8 | `post_results(week, winners, pushes, root)` | commissioner | `week==current`; `now >= lock+3h`; not posted; no pending; `winners & pushes == 0` | pending set; veto_count=0 |
| 9 | `veto_results` | member | pending; alive; once per posting | majority (`2*veto > alive`) clears pending |
| 10 | `finalize_week` | anyone | pending; `now >= posted_ts + window` | commit; reset counters |
| 11 | `settle_member(points?, proof?)` | anyone | finalized; unprocessed | apply mode rule (§9.4) |
| 12 | `advance_week` | anyone | all alive processed | end conditions or `current_week++`; pick'em pays weekly share to the week's top scorer(s) (`claim_weekly`) |
| 13 | `claim_pot` / `claim_weekly` | member | Settled / week finalized; winner test; `!claimed` | fee (if any) once to treasury; share to member |
| 14 | `reclaim_dues` | member | not Settled; `now >= refund_deadline`; paid, unclaimed | pro-rata refund |
| 15 | `close_member` / `close_pool` | owner / commissioner | after claims; vault empty | rent hygiene |

### 9.4 Mode rules in `settle_member`
- Survivor: no pick → OUT; `winners & bit` or `pushes & bit` → survive, consume team; else OUT.
- Loser: survive iff picked team is neither winner nor push; consume team.
- Pick'em: `points += popcount(pick_mask & winners) + popcount(pick_mask & pushes)`; track `week_high` on Pool for the weekly share.
- Confidence: for each correct game add its rank.
- Pick-3: all three in winners∪pushes → weekly winner; none → `rollover += weekly share`.
- Team Draft: `points += popcount(owned_mask & winners)`.
- Scored (fantasy, later): verify `(member, points)` leaf against `results_root[w]`; `points += points`.
End conditions (Survivor/Loser): alive==1 → Settled (winners_week=0, count 1); alive==0 → Settled (winners_week=w, count=alive_at_week_start); w==18 → Settled (count=alive). Score modes: Settled after Week 18 with `winners_count` = members tied at the top.

### 9.5 Errors / events / security
Errors as in v4 plus `NotYourTurn, BadPickMask, BadRanks, DraftClosed, BadProof`. Events as in v4 plus `WeeklyPaid, RolloverAccrued, TeamDrafted`.
Security (each tested): canonical USDC per cluster; vault = pool ATA; SPL Token program checked; signer/owner/PDA/bump on every account; `init` only; checked math; `Clock::get()`; boundary tests ±1s; idempotent settle/claim/refund/finalize; veto once per member per posting, strict majority; fee computed once, capped, never on $0 pools; `paused` blocks creation only, never claims/refunds. **Upgrade authority:** founder-held through the hackathon and disclosed; **plan of record: move to a 2-of-3 multisig within 30 days of launch and make the program immutable after an audit** — this is also the money-transmission "control" mitigation (§19.4).

Tests: happy path per mode; every rejection path; push; both split paths; W18 multi-survivor; deadman; fee math + cap + $0; sponsor_join; late-start; fake mint; double claim; veto majority; settle idempotency; pick'em weekly share; rollover accrual.

---

## 10. Static data
`teams.json` (32: index, abbr, city, nickname, colors, espnId). `schedule.json` generated once from ESPN per week: `lockTs` (earliest kickoff), `byeTeams`, `games[{espnEventId, home, away, kickoffTs}]`; committed; the app passes `lock_ts[18]` to `create_pool`. `restricted-states.json` (§19.6).

## 11. Database and jobs
Schema as in v4 (`pools, members, x_links, link_nonces, results_proposals, push_subscriptions`, views `career`, `board`) plus: `pools.pool_type, weekly_pot_bps, rollover`, `members.pick_mask, ranks, owned_mask, points`, and **`attestations(wallet, pool, age_ok bool, state text, ip_region text, ts)`** (§19.6) with no public access. RLS: public SELECT on pools/members/results_proposals/career/board only; writes via service role.
Jobs: `/api/cron/index` (5 min; getProgramAccounts → upsert; vault balances), `/api/cron/results` (15 min Thu–Tue; ESPN scoreboard server-side; winners/pushes; CONFIRM only when all final or pushed), `/api/cron/reminders` (Wed 6pm, Thu 9am, 3h before lock; web push to alive members without a pick), crank via UI SETTLE button (MUST) / `/api/cron/crank` (STRETCH).

## 12. Wallet, onboarding, transactions
Join page works without a wallet and opens a two-step OnboardingSheet: (1) get Phantom (links, "open this link inside Phantom's browser," 20-second video placeholder); (2) get USDC + ~0.005 SOL via Phantom's in-app buy with the exact amounts, or "ask your commissioner to cover you" (sponsor flow). Wallet Adapter restyled; auto-connect; MWA on Android; iOS deep-link into wallet browsers. One action = one transaction; simulate first; TxSheet in plain English with vault address + explorer link; never delegation; never unrequested signatures. No accounts or passwords. **Age/state attestation and geo check happen inside the JOIN and CREATE flows for paid pools (§19.6).**

## 13. Design system — "Primetime" (FINAL)
Night `#120D0A` · night2 `#1D1310` · line `rgba(246,239,226,.10)` · cream `#F6EFE2` · leather `#FF5C1B` · leatherHi `#FF7A45` · gold `#E9C258` (money only) · alive `#35C97A` · out `#E5484D`; radii 10/14/20/pill; 4px base. Anton (display, uppercase, .015em, tabular) + Space Grotesk. Mark = THE LACES (`brand/laces.svg`; cream on leather for avatar/icon; leather on night in-app; never inside the wordmark; never a drawn football). Laces are the loader and the weeks-survived meter. Mobile-first at 390px; one leather button per screen; the pot is the hero; chalk hairlines; ALIVE/OUT stamps; countdown always visible before lock; 150–200ms motion; one celebration; reduced-motion respected; 44px targets; ≥4.5:1 contrast. Dark only.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200"><g transform="rotate(-14)" fill="#FF5C1B"><rect x="-9" y="-84" width="18" height="168" rx="9"/><rect x="-49" y="-63" width="98" height="18" rx="9"/><rect x="-49" y="-27" width="98" height="18" rx="9"/><rect x="-49" y="9" width="98" height="18" rx="9"/><rect x="-49" y="45" width="98" height="18" rx="9"/></g></svg>
```

## 14. Components
As in v4 (`WalletButton, PotDisplay, Countdown, TeamGrid/TeamTile, PickNote, MemberRow, StatusBanner, TxSheet, SettleButton, RulesSheet, ShareCard, LacesLoader, Stamp, OnboardingSheet, PickPopularity, RecapBanner, CareerCard`) plus `ModePicker`, `GamePicker` (pick'em list of the week's games with team pairs), `ConfidenceRanker` (drag to order), `DraftBoard`, `EligibilityGate` (§19.6), `StandingsTable` (score modes).

## 15. Screens and acceptance
As in v4 (`/`, `/new`, `/p/[pool]`, `/p/[pool]/pick`, `/p/[pool]/commish`, `/p/[pool]/history`, `/p/[pool]/claim`, `/me`, `/board`, `/trust`, `/rules`, `/api/v1/*`, OG image) plus: `/new` has a **mode picker**; `/p/[pool]/pick` renders the mode's pick control; `/p/[pool]/standings` for score modes; **`/terms`, `/privacy`, `/responsible-play`** (with self-exclusion), and `/trust` includes the legal posture and the fee policy. Acceptance: every state renders from fixtures without a wallet; EligibilityGate blocks a restricted-state paid join and allows $0 pools; Lighthouse perf ≥ 90 mobile, a11y ≥ 95.

## 16. Loyalty loop
Web-push reminders (PWA, VAPID) + .ics fallback; pick popularity after lock; pick notes; recap banner; career card; season board; share cards; commissioner friction-killers (sponsor a seat, copy link everywhere). One reminder cadence, opt-in, no marketing pushes.

## 17. X linking + leaderboard (SHOULD, day 5)
Supabase Auth X provider → server reads `x_user_id`/`user_name` from the JWT → single-use 5-minute nonce → wallet signs `commish.fun link\nx:{id}\nwallet:{pubkey}\nnonce:{nonce}` → server verifies JWT + nonce + ed25519 → `x_links` (one-to-one). Unlink/opt-in endpoints. Never store X tokens. Fallback: self-declared handle, no badge, off the board. `/board` from the `board` view; rank best_run → pools_won → usdc_won; no wallets; rows link to proof.

## 18. Integration API
Layer 1 (MUST): IDL on-chain + `idl/`, `docs/PROGRAM.md`. Layer 2 (SHOULD): `/api/v1` read-only (`/pools/{a}`, `/members`, `/results`, `/schedule`, `/board`, `/career/{wallet}`), CORS GET, 60/min/IP, edge-cached 30s, `source: "on-chain"`, `asOfSlot`; `docs/API.md`. Layer 3 (STRETCH): `@commishfun/sdk`. Not v1: webhooks, keys, write proxies.

---

## 19. Legal framework and compliance controls

*Research summary prepared for a Texas-resident founder; it is not legal advice. Retain a Texas gaming attorney before launch and before any fee is ever set above zero. Primary sources were consulted via published summaries; cite-check them with counsel.*

### 19.1 Texas gambling law (Penal Code Chapter 47)
- **§47.01 "bet"** = an agreement to win or lose something of value solely or partially by chance. Excluded: "an offer of a prize, award, or compensation to the actual contestants in a bona fide contest for the determination of skill, speed, strength, or endurance." Pool players are not the *actual contestants* of the NFL game, so this exclusion does not rescue pools or fantasy (the AG relied on exactly this point).
- **§47.02 gambling** — making a bet on the result of a game or contest is an offense (Class C misdemeanor for participants). **Defense §47.02(b):** (1) gambling in a *private place*; (2) *no person received any economic benefit other than personal winnings*; (3) except for skill or luck, risks and chances were the same for all participants. "Private place" = a place the public does not have access to (streets, restaurants, bars, hotel common areas, etc. excluded). Whether an invite-only online pool is a "private place" is unsettled; the defense's other two prongs are fully within Commish's control.
- **§47.03 gambling promotion** (Class A misdemeanor) — includes one who "for gain, becomes a custodian of anything of value bet or offered to be bet," or operates or participates in the earnings of a gambling place. **This is the operator-side risk. Any platform gain tied to a Texas real-money pool is the danger zone.**
- **AG Opinion KP-0057 (Jan 2016):** paid daily fantasy is likely illegal gambling; traditional leagues where "the house takes no cut" fall within the §47.02(b) defense; the operative sentence: *"it is prohibited gambling in Texas if you bet on the performance of a participant in a sporting event and the house takes a cut."* FanDuel exited Texas under a 2016 settlement and returned in 2023; DraftKings sued and the matter was never resolved by a court; the industry operates in Texas under a skill-game theory without a statute. **HB 2303 (2019)** would have excluded fantasy contests from "bet"; it passed the House 116–26 and died in the Senate. **No fantasy or sports-betting statute passed in the 2025 session**; sports betting requires a constitutional amendment and is realistically 2027–2029 at the earliest.
- **Practical enforcement:** office pools are technically illegal and virtually never prosecuted when nobody profits from running them. The exposure concentrates on an *operator that profits*.

### 19.2 What this means for each mode (Texas)
- **Survivor, Loser, Pick'em, Confidence, Pick-3, Team Draft, Squares, Bracket:** pools on game outcomes. Defensible for participants under §47.02(b) **only if nobody — including Commish — takes economic benefit** from the pool. Skill-weighting (Confidence, Pick'em) helps the narrative, not the statute. Squares is pure chance and has the weakest posture; treat it as strictly no-benefit.
- **Fantasy modes (One & Done, Showdown, Sleeper treasurer):** same Texas analysis (no statute; adverse AG opinion on paid fantasy with a house cut), but see §19.3 for why they are federally stronger.
- **Spread/odds-based modes:** sports-betting-adjacent; Texas prohibits sports betting; excluded outright.
- **Charity split:** a third party receiving part of the pot may defeat prong (2); excluded pending counsel.

### 19.3 Federal overlay
- **UIGEA (31 U.S.C. §5362):** applies to businesses accepting payments for *unlawful* Internet gambling (unlawful under the applicable state law). Its **fantasy carve-out** requires outcomes that reflect participants' knowledge and skill, are determined predominantly by accumulated statistics of *individuals* across *multiple* real-world events, and are **not** determined by the score or performance of any single real-world team (or combination of teams) nor solely by a single athlete's performance in a single event. → Survivor/Pick'em (team outcomes) are **not** fantasy under UIGEA; One & Done and Showdown **are** (many players, many games); Player-of-the-Week is not.
- **Illegal Gambling Business Act (18 U.S.C. §1955):** requires a violation of state law *plus* five or more persons conducting the business *plus* 30 days or $2,000/day. Operator-directed; the no-benefit posture is the mitigation.
- **Wire Act:** limited to sports "bets or wagers" (First Circuit, 2021) and to those "engaged in the business of betting or wagering." A platform with no stake in outcomes and no rake has the strongest available position; not immunity.
- **Money transmission:** under the Texas Money Services Modernization Act (2023) and revised Supervisory Memorandum 1037 (Jan 2025), **fiat-pegged stablecoins such as USDC are "money"**; receiving them for transmission or holding them for others can require a license, while software that never takes control of funds generally does not. FinCEN's 2019 guidance likewise treats non-custodial software and DApp developers as outside money transmission unless they themselves conduct it. → Commish's program must be **genuinely non-custodial**: no admin withdrawal path, no ability to move pool funds, and an upgrade-authority plan that removes the founder's unilateral control (§9.5). Document this in `docs/LEGAL.md`; get a DOB read from counsel before Season 2.
- **Sanctions/AML:** USDC is freezable by its issuer; Commish should not transact with sanctioned wallets. Add a wallet-screening check (free tier of a screening API) at join for paid pools when feasible (SHOULD, post-hackathon).

### 19.4 The operating posture (FINAL for Season 1)
1. **Zero economic benefit from real-money pools.** No rake, no pot fee, no creation fee, no sponsor money tied to pot size. Program fields exist at zero.
2. **Non-custodial by construction**, with a published path to multisig and immutability.
3. **Private pools only**, link-gated, no directory, no public matchmaking, no promotion of specific pools.
4. **No betting language, no odds, no lines**, anywhere in product or marketing.
5. **$0 pools everywhere**; real-money pools only for eligible users (§19.6).
6. **Transparency:** `/trust` states all of the above in plain English; `docs/LEGAL.md` records the analysis.
7. **Entity:** form an LLC before launch (Texas or Delaware) and operate the domain, accounts, and program authority through it.
8. **Counsel:** Texas gaming attorney review of this section, the terms, and the Commish Pro question before launch; state-by-state review before any fee > 0 anywhere.

### 19.5 Age and state eligibility policy
- Minimum age 18 (industry norm in Texas for fantasy/pool products), 19 in Alabama and Nebraska, 21 in Arizona, Iowa, Massachusetts, and wherever local law requires; the higher of user-state rule and 18 applies.
- **Restricted-state list for real-money pools** (mirrors where established pool/fantasy operators do not offer paid contests; keep as `restricted-states.json`, reviewed by counsel): Washington, Montana, Idaho, Nevada, Hawaii, plus the pool-format exclusions used by incumbents: Connecticut, Delaware, Iowa, Louisiana, Mississippi, Pennsylvania, Tennessee (and non-US jurisdictions by default). Texas is **allowed for participants** (no fees, private pools) under this posture; counsel confirms.

### 19.6 Compliance controls (MUST — they ship with the first paid pool)
1. **EligibilityGate** on CREATE and JOIN for any pool with `buy_in > 0`: age attestation ("I am 18+ / the legal age where I live"), state selection, and a **server-side geo check** using the host's region headers (`x-vercel-ip-country` / `-country-region`) or an IP-geo service; mismatch or restricted state → blocked for paid pools with a clear message and the $0 alternative offered. Record in `attestations` (server-only).
2. **Terms of Service, Privacy Policy, Responsible Play page** with a self-exclusion list (wallet-level; excluded wallets cannot join paid pools). Link all three from the footer and the join sheet.
3. **`/trust` legal block:** no fees, non-custodial, private pools, participant responsibility for local law, age policy.
4. **No promotional pool listings**, no "featured pools," no odds, no "bet" language (lint the copy).
5. **Commissioner acknowledgment** at pool creation: private group, members known to them, no rake taken by anyone, local law is their responsibility.
6. **Record-keeping:** attestations and pool events retained; on-chain history is the audit trail.
7. **Fee switch governance:** `update_config` fee defaults may only be raised after written counsel sign-off per state and after the geo gate maps fee eligibility by state; new pools show the fee before creation and joining; existing pools are never affected.

### 19.7 Residual risks, stated plainly
Online "private place" is untested in Texas; the Commish Pro subscription's interaction with §47.03 needs counsel; the industry's Texas fantasy posture rests on an unresolved dispute; a Texas resident operating a national product should expect the strictest applicable state to govern its behavior. The mitigations above are the strongest available posture short of a state-licensed fantasy operation, which is a Season 2+ decision.

---

## 20. Security and ops
`.env*` gitignored from commit one; browser Helius key domain-restricted; server keys only in the host's secrets UI; strict CSP; pinned deps; ESPN server-side only; rate limits on `/api/link`, `/api/v1`, attestations; Cloudflare Full (strict), Always HTTPS, min TLS 1.2, DNSSEC, DMARC reject, HSTS on launch day; analytics never see wallets. **Resilience promise:** `docs/MANUAL-CLAIM.md` shows claiming/refunding with the CLI against the public IDL if the site is gone. Abuse cases: fake results → veto; ghosting → permissionless crank + deadman; server down → nothing on-chain depends on it; duplicate wallets → one Member per wallet; pick front-running → hidden until lock, commit-reveal STRETCH.

---

## 21. Build order (critical path; each step ships a working slice)

**Slice A — the money is safe (program):** state/errors/events → `init_config`, `create_pool`, `join_pool`, `sponsor_join` (+tests) → `submit_pick`, `submit_pick_mask` (+all rejection tests) → **founder review of every token-moving line** → `post_results`, `veto`, `finalize`, `settle_member` (survivor + loser + pick'em rules), `advance_week` (+boundary tests) → `claim_pot`, `claim_weekly`, `reclaim_dues`, `close_*` (+fee/cap/$0 tests) → devnet deploy, `anchor idl init`, commit IDL.

**Slice B — one pool end to end (app):** scaffold, tokens, fonts, PWA, wallet adapter, `teams.json`, schedule script → `/new` with ModePicker → `/p/[pool]` hub (wallet-less) → JOIN with **EligibilityGate** + TxSheet → `/pick` (TeamGrid for survivor/loser; GamePicker for pick'em) → Supabase schema + indexer + results jobs → `/commish` with CONFIRM/pushes/SETTLE → `/claim` → **three-wallet devnet loop across survivor, loser, pick'em; deadman on a spare pool.**

**Slice C — it feels like a product:** OnboardingSheet, Countdown + .ics, PickPopularity, StatusBanner states, empty/error states, `/rules`, `/trust` (with §19 language), `/terms`, `/privacy`, `/responsible-play` + self-exclusion, `/me` + career card, season board, RecapBanner, OG ShareCard, laces progress, push reminders.

**Slice D — the world can see it:** X linking + `/board`; `/api/v1` + docs (`API.md`, `PROGRAM.md`, `MANUAL-CLAIM.md`, `LEGAL.md`); Confidence (then Pick-3, Team Draft) if time; mainnet deploy runbook (build → test → deploy → idl init → env → app → Cloudflare CNAME → Helius domain restriction → HSTS); founder's league as pool #1; backup demo video; security pass; submission writeup; launch thread.

Calendar: A = days 1–2 · B = days 2–4 · C = day 5 · D = day 6 · day 7 = buffer/polish · Sept 10 = submit + kickoff launch.

## 22. QA (before mainnet)
All §9.5 tests green; fake mint and double claim rejected; a no-wallet friend joins a $0 pool from a phone in < 5 min; EligibilityGate blocks a restricted-state paid join and allows $0; every pool state renders without a wallet; lock enforced ±1s; push survives and consumes; veto majority clears; SETTLE from a non-commissioner wallet; claim pays exactly; fee = 0; deadman works; manual claim works with the site offline; pick'em weekly share pays the top scorer; OG renders on X/iMessage; PWA installs; push arrives; Lighthouse perf ≥ 90 mobile, a11y ≥ 95; copy lint finds no "bet/wager/odds."

## 23. Copy bank (no em dashes in social copy; never "bet")
Tagline · mechanics ("Buy-ins escrowed on-chain · Picks locked at kickoff · Last one standing takes the pot") · trust line · lock line ("No 'I definitely picked the Bills' texts on Monday.") · S1 line ("100% of the buy-ins go to the winner. Commish takes nothing.") · TxSheet join ("Locks {amount} USDC in this pool's vault. Only the winner can take it out. If the pool is ever abandoned, you can reclaim your share.") · TxSheet pick ("Locks in {TEAM} for Week {n}. You can change it until kickoff.") · sponsor ("You're covering {name}'s seat ({amount} USDC). Settle up however you like; the pot stays on-chain.") · OUT ("{name} took the {TEAM}. The {TEAM} did not cooperate.") · push ("{TEAM}'s game was cancelled. Everyone on {TEAM} survives.") · empty ("No picks yet. Lock is in {countdown}.") · reminder ("Picks lock in 3 hours. You haven't picked.") · eligibility ("Real-money pools aren't available where you are. You can still play this pool for free.") · X bio ("Your Survivor pool, out of that one guy's Venmo. Buy-ins escrowed on-chain, picks locked at kickoff, last one standing takes the pot. Built on Solana. 🏈").

## 24. Demo and launch
~90s: the Cash App story → create a pool live (mode picker shown) → two phones join, one sponsored, one through the eligibility gate → picks with notes → lock → demo-flag pool: CONFIRM a real historical week → SETTLE → OUT stamp; survivor claims in gold → "Results anyone can veto, a pot nobody can strand, picks nobody can backdate, and Commish takes nothing. Week 1 locks Thursday." Launch: @Commishfun banner thread at kickoff; founder's personal account posts the story version; README checklist = build-in-public thread.

## 25. Founder context
Solo founder (Texas); also runs HoldFlow (Solana escrow PDAs, holder snapshots, payout engines, Supabase). Money-code review is in experienced hands. Form the LLC and retain counsel in parallel with the build; nothing in §19 blocks the hackathon build, everything in §19.6 ships with it.
