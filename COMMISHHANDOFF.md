# COMMISH.FUN — product design & build document (handoff v6)

*Complete, self-contained specification. Paste it whole into the coding assistant. Supersedes every earlier version. FINAL = decided. MUST / SHOULD / STRETCH govern cuts: STRETCH first, then SHOULD, never a MUST. Section 21 is the build order. Section 19 is the legal framework — every product decision was checked against it.*

**Contents:** 0 Working rules · 1 The two products · 2 Positioning · 3 Revenue · 4 Survivor rules · 5 League Treasurer rules · 6 Other game modes · 7 Fantasy layer (later) · 8 Tech stack · 9 Repo · 10 On-chain program · 11 Static data · 12 Database & jobs · 13 Wallet & onboarding · 14 Design system · 15 Components · 16 Screens · 17 Loyalty · 18 X linking · 19 Legal & compliance · 20 API, security, ops · 21 Build order · 22 QA · 23 Copy · 24 Demo & launch · 25 Founder context

---

## 0. Working rules
1. The assistant builds app, DB, jobs, API, UI, tests, and generates the Anchor program from §10; every token-moving line is reviewed by the founder before deploy. Flag those lines explicitly.
2. On-chain state is the source of truth; the DB is a cache; the API is read-only; the program is the write API.
3. Secrets never appear in chat or repo.
4. Simplicity is the design: one primary action per screen.
5. Compliance controls (§19.6) are MUST, not polish.
6. Build order (§21) is fixed; vertical slices; each step leaves a working product.

---

## 1. The two products (FINAL)

Commish is **one escrow engine with two front doors**. Both solve the same problem — the guy holding everyone's money — and both run on identical on-chain machinery.

**A. Survivor pool** *(the launch demo)*
Everyone buys in. Each week you pick one NFL team to win (no spreads). Win → survive; lose or tie → out. Each team usable only once per season, so you have to plan. Most players are gone in a few weeks; last one standing takes the pot. Ten seconds a week, drama every Sunday.

**B. League Treasurer** *(the product people sign up for)*
A real fantasy league — Sleeper, ESPN, Yahoo, NFL.com, a spreadsheet, doesn't matter — puts its **dues** in an on-chain vault instead of the commissioner's Venmo. Every team connects their own wallet. The prize split is fixed and visible before anyone pays. At season's end the commissioner posts who finished where, the league gets a window to dispute it, then winners claim straight from the vault. **Commish never touches the money and neither does the commissioner.**

Why both: Survivor is the *story* (it demos in 90 seconds and it's novel), League Treasurer is the *market* (millions of leagues, average pot far larger, and it's the pain people already complain about every January). Build the engine once; ship both doors.

---

## 2. Positioning (FINAL)
- **One-liner:** Your league's money, out of that one guy's Venmo. Dues and buy-ins escrowed on-chain, payouts fixed before anyone pays, nobody in the middle.
- **Survivor tagline:** "Your Survivor pool, out of that one guy's Venmo."
- **League tagline:** "Your league dues, out of that one guy's Venmo."
- **Trust line:** "The commissioner keeps the job, loses the custody."
- **Brand:** COMMISH.FUN (display) / commish.fun (text). Launch at NoahAI Nitro 03 (Sept 3–10, 2026); **NFL Week 1 opens Wed Sept 9, 8:20pm ET (NE @ SEA)** — the same week most leagues draft and collect dues. This said "Thu Sept 10, 8:20pm" until it was checked against ESPN; that is the *second* game (SF v LAR, Thu Sept 10, 8:35pm). It matters more than a diary slip: week 1 picks lock at the FIRST kickoff, so the real deadline is Wednesday evening, a day earlier than the plan below assumes. `src/data/nfl-schedule-2026.json` had it right all along — `lockTs` 1788999600 matches ESPN to the second.
- **Who:** commissioners running things for people they know; members on phones, mostly not crypto users.
- **Private only**, link-to-join, no directory. **$0 pools allowed** everywhere. Pools can start any week; leagues can be created any time before their dues deadline.
- **Language (FINAL):** "pool," "league," "dues," "buy-in," "pot," "prize," "pick." Never "bet," "wager," "odds," "book." This is legal posture, not style (§19).
- **No NFL/team logos or marks.** City names and abbreviations only. Those are
  the safe part: naming a team factually is nominative fair use, and *C.B.C.
  Distribution v. MLB Advanced Media* (8th Cir. 2007) held a fantasy operator's
  First Amendment right to use names and statistics beats the publicity claim
  against it. Logos are not the same question and are not close: they are
  registered marks, they fail the "only as much of the mark as necessary" prong
  because the name already identifies the team, and as famous marks they carry
  a dilution claim that succeeds with no consumer confusion at all. NFL
  Properties licenses at roughly $100k/yr in minimum royalties and not to small
  operators, so there is no cheap door either.
  **COLOURS ARE NOT A SAFE HARBOUR, which this line used to say they were.**
  A single colour can be a trademark (*Qualitex*, 1995), and the NFL enforces
  team colour combinations as trade dress with no logo present — it sent a
  cease-and-desist over an ad using the Raiders' black and silver that carried
  no Raiders logo and no Raiders name. `ClubBar` in `TeamButton.tsx` paints all
  32 clubs' real colours. The risk is low, because each bar sits beside that
  team's own name and reads as identification rather than as an imitation of
  the club's get-up — but it is a judgement call, not a rule, and if it ever
  needs removing the fix is two fields in `lib/nfl.ts`: teams only need to be
  *distinguishable*, not accurate.
- **Commish takes no economic benefit from any real-money pool** in Season 1 (§3, §19).

---

## 3. Revenue model (legally constrained — read §19 first)

**Governing fact:** Texas Penal Code §47.02(b) protects private contests only when *no person receives any economic benefit other than personal winnings*; §47.03 makes it an offense to "for gain, become a custodian of anything of value bet." The 2016 AG opinion: *"it is prohibited gambling in Texas if you bet on the performance of a participant in a sporting event and the house takes a cut."* So: **no rake, ever, on any pot.**

**Season 1 (FINAL): zero platform economics on real-money pools.** 100% to winners.

**Paths, cleanest first:**
1. **Commish Pro — software subscription for commissioners** (SHOULD, post-demand). The RunYourPool model: sell software, never touch the money. Custom league branding, season archives, multi-league dashboards, templates, priority support, advanced share/recap tools. Identical for $0 pools; never gates trust, payout, or fairness features; never scales with pot size.
2. **Sponsorships** on the free product (non-sportsbook only). No in-app ads.
3. **Pot/creation fees** — fields exist in the program at **0**, enable-able per state only after counsel confirms a basis. Not a Season 1 lever, and never in Texas under the current posture.
4. **A community token — funded by its own trading volume, never by pool money** (§3.1).

Excluded: sportsbook affiliates, lending the escrowed pot for yield, any fee paid out of a pot.

### 3.1 Token boundary (FINAL, load-bearing)
A community token (e.g. $LACES) may exist **only** as an arm's-length community layer whose economics come from *its own trading* — pump.fun creator fees routed through HoldFlow to holders/buybacks. **No pool, league, dues, prize, or payout may ever fund a buyback, burn, treasury, or token in any way.** Reasons: (a) a cut from a pot is the exact "house takes a cut" the AG named, and directing it to a burn still benefits the operator and holders; (b) a token whose value is driven by the platform's transaction revenue stops resembling a memecoin and starts resembling a revenue-backed instrument, which is a different legal category. The token is never shown in the pool product's core flow. Any future build session that proposes wiring pool fees to a token should treat this paragraph as a hard stop.

---

## 4. Survivor rules (`pool_type = 0`) — FINAL, not configurable
Buy-in (may be 0). Joining closes at the start-week lock. One pick per week, a team to WIN; picks lock at that week's first kickoff. Win → advance; loss/tie → OUT; no pick → OUT. Each team once per season (32-bit mask). Bye teams unpickable. **Push:** cancelled/no-contest game → picks of either team survive and the team is consumed; postponed games are waited for. Last standing takes the pot; all-out-same-week → that week's entrants split; multiple survivors after Week 18 → split; not settled by `refund_deadline` → deadman refund pro-rata. Integer division; dust stays in the vault.
**Loser pool (`pool_type = 1`)** is the same with an inverted test.
**Team index (FINAL):** `ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS` (0..31).

---

## 5. League Treasurer rules (`pool_type = 8`) — MUST for the hackathon

**The core decision (FINAL): standings are declared by the commissioner, not synced from an API.** This makes Commish work with *every* league platform on earth instead of one, removes a build dependency, and keeps the veto meaningful — all ten members can see the same standings page wherever their league actually lives. Sleeper sync is a later convenience that only pre-fills the sheet (§7).

**Setup.** The commissioner creates a league vault with: league name, dues amount (USDC, may be 0), number of teams, a **dues deadline** (usually draft day), and a **prize split** — up to 8 slots, each with a label and a percentage in basis points, which must total exactly 100%. Examples: `1st 60% / 2nd 30% / 3rd 10%`; `1st 70% / Most Points 20% / Last Place 10%`; `1st 50% / 2nd 25% / Week 5 High 5% / Week 10 High 5% / Playoff Champ 15%`. The split is locked at creation and shown to every member before they pay a cent.

**Joining.** Members join by invite link, connect their own wallet, enter their **team name**, and pay dues. Members always connect their own wallets — the commissioner never types in wallet addresses (a typo sends money nowhere). The commissioner *can* cover someone's dues with `sponsor_join` and settle up offline. Joining closes at the dues deadline; `total_dues` is fixed at that moment and every prize is computed from it, so interim payouts never distort later ones.

**During the season** nothing happens on-chain. The league plays on whatever platform it already uses. The league page shows the pot, every team, the prize split, and the vault address — public by link, so any member can verify the money is untouched at any time.

**Payouts.** The commissioner posts a **payout sheet**: assign one or more prize slots to member wallets. A 24-hour dispute window opens; any member can veto, and a majority of members clears the sheet for a re-post. After the window, the assignments finalize and each winner claims their slot's share. Sheets can be posted **more than once** — that's how weekly or mid-season prizes work: pay out the "Week 5 High" slot in October, the championship slots in January. The pool is Settled when every slot is claimed.

**Failure modes.** Commissioner posts wrong standings → member veto. Commissioner ghosts entirely → after `refund_deadline` (season end + 30 days) every member reclaims their pro-rata share of whatever is left, via `reclaim_dues`. Commissioner tries to pay himself everything → the league sees the sheet during the window and vetoes. Nobody, including Commish, can move funds outside these paths.

**Why this is the cheapest mode to build:** no weekly picks, no team masks, no eliminations, no results feed, no weekly cranks. It is the escrow spine plus one instruction. It also demos instantly (create → join → post sheet → claim) without waiting on any real game.

---

## 6. Game modes — all of them are in scope (same engine, `pool_type` selects pick shape + scoring)

**The mode kit (FINAL architecture).** Every mode is three small, isolated pieces plugged into one unchanging spine (escrow → locked picks → posted results → veto window → deterministic settlement → claims):
1. **a pick control** (React component: TeamGrid, GamePicker, ConfidenceRanker, DraftBoard, or none),
2. **a scoring rule** (one `match` arm inside `settle_member`, ~10–30 lines of Rust),
3. **a results view** (how standings render).
Nothing else changes — not the vault, not the veto, not the deadman refund, not the claim path. Build the kit in Slice A and each additional mode costs hours, not days. **Do not special-case modes anywhere outside these three seams**; if a mode seems to need a change to the escrow spine, that is a design error, stop and reconsider.

| # | Mode | One line | Results shape | Priority |
|---|---|---|---|---|
| 0 | **Survivor** | One team to win per week; team once per season; last standing | winners + pushes masks | **P0** |
| 8 | **League Treasurer** | League dues escrowed; prize slots paid by declared standings | payout sheet | **P0** |
| 1 | **Loser pool** | One team to LOSE; if it wins you're out | same masks, inverted | **P0** (one branch) |
| 2 | **Pick'em** | Pick every game's winner; a point each; weekly + season pots | pick mask; popcount | **P1** |
| 3 | **Confidence** | Pick every winner, rank them 1..N; a correct pick scores its rank | mask + ranks | **P1** |
| 5 | **Team Draft** | Snake-draft the 32 teams; score = your teams' wins | owned mask | **P2** |
| 4 | **Pick-3 Jackpot** | Pick 3 winners; all right → split the week; none → rolls over | 3-bit pick + rollover | **P2** |
| 7 | **Playoff bracket** | Fill the bracket, points per round | bracket tree | **P3** (Jan is fine) |
| 6 | **Squares** | 10×10 grid, digits assigned at lock, quarter payouts | quarter line scores | **P3** (Super Bowl is the moment) |
| — | Spread / underdog / over-under | uses betting lines | odds feed | **Excluded** (§19) |
| — | Player of the Week | one athlete, one game | player stats | **Excluded** (§19.3) |
| — | Charity split | part of the pot to a third party | — | **Excluded** pending counsel |

**Priority meaning:** P0 ships or the launch does not happen. P1 ships unless the P0 loop is not clean by end of day 4. P2 ships if Slice C finishes early. P3 is post-launch by design — Squares and brackets are *playoff* products whose natural launch is January, and shipping them in September buys nothing. Cut from the bottom, never from the middle, and never at the cost of the P0 loop being flawless: **one perfect pool beats six shaky ones**, and every mode shares the same money code, so a bug in the spine is a bug in all of them.

Squares carries an extra caveat beyond timing: it is pure chance with no skill component, which makes it the weakest mode legally (§19.2) and the one most in need of counsel before it ever carries a fee anywhere.

---

## 7. Fantasy layer (post-hackathon; architecture reserved now)
- **Sleeper sync (SHOULD, October):** attach a league id (public API, no auth: `/v1/league/{id}`, `/rosters`, `/users`, `/matchups/{week}`, `/v1/state/nfl`) to **pre-fill the payout sheet** with final standings and to show live standings on the league page. The commissioner still confirms; the veto still applies. Pure convenience on top of §5.
- **Native fantasy-lite modes (November+):** **One & Done** (one player per week, never reused, best season total) and **Weekly Showdown** (QB/RB/WR/TE/FLEX, no reuse). Both satisfy the federal fantasy carve-out (many players, many games). Player-of-the-Week does not and is excluded.
- **Engine generalization (reserve `results_root: [[u8;32];18]` now, build later):** for stat-scored modes the server computes every member's points, publishes the scoresheet, and the commissioner posts its Merkle root behind the same veto window; `settle_member` takes `(points, proof)`. Masks for pick games, sheets for leagues, roots for scored games — one escrow underneath all three.

---

## 8. Tech stack (FINAL)
Anchor 0.30+/Rust/`anchor-spl` · Next.js 14 App Router/TypeScript/Tailwind/`@tanstack/react-query` · `@solana/wallet-adapter-react` + `-react-ui` (Mobile Wallet Adapter on Android; Phantom/Solflare in-app browser on iOS) · `@coral-xyz/anchor` typed client · Supabase (Postgres, RLS, Auth with X provider) · Helius RPC (domain-restricted key) · route-handler jobs on a scheduler with `CRON_SECRET` · Vercel hosting (geo headers for §19.6) · Cloudflare DNS · self-hosted Anton + Space Grotesk · Plausible/Umami analytics (never wallet addresses).

## 9. Repository layout
```
programs/commish/src/{lib.rs,state.rs,errors.rs,events.rs,instructions/*.rs}   tests/   idl/commish.json
app/app (routes) · app/components · app/lib/{anchor,pda,tx,teams,schedule,format,ics,scoring}.ts
app/lib/server/{indexer,results,espn,supabase,verify,ratelimit,geo}.ts
app/data/{teams.json,schedule.json,restricted-states.json} · app/public/{fonts,brand,manifest.webmanifest,icons}
supabase/migrations · scripts/build-schedule.ts · brand/
docs/{PROGRAM.md,API.md,MANUAL-CLAIM.md,LEGAL.md} · README.md · COMMISH-HANDOFF.md
```

---

## 10. On-chain program

### 10.1 State machines
**Pick modes (0–7):** `Open` → weekly `Locked` → `ResultsPosted` (dispute) → `Finalized` (per-member settlement) → `Advanced` … → `Settled` | `Abandoned`.
**League mode (8):** `Open` (joining, until dues deadline) → `Locked` (season running) → `SheetPosted` (dispute) → `SheetFinalized` (slots claimable) → back to `Locked` if slots remain → `Settled` when all slots claimed | `Abandoned` (deadman).

### 10.2 Accounts
**Config** (`["config"]`): `admin, fee_treasury, default_fee_bps: u16, default_fee_cap: u64, creation_fee: u64, paused: bool`. Copied into pools at creation; changes never affect existing pools. **Season 1: all zero.**

**Pool** (`["pool", commissioner, nonce_le_u64]`, space 1280):
```
commissioner, usdc_mint, vault: Pubkey   nonce: u64   name: [u8;32]   pool_type: u8
buy_in: u64   max_members: u16   member_count: u16   paid_members: u16   total_dues: u64
alive_count: u16   alive_at_week_start: u16   processed_this_week: u16
start_week: u8   current_week: u8   lock_ts: [i64;18]   dues_deadline_ts: i64
refund_deadline_ts: i64   dispute_window_secs: u32
winners: [u32;18]   pushes: [u32;18]   results_root: [[u8;32];18]   results_posted: [bool;18]
pending_winners: u32   pending_pushes: u32   pending_root: [u8;32]   pending_week: u8
pending_posted_ts: i64   veto_count: u16   finalized_week: u8
prize_slots: [PrizeSlot;8]   slot_count: u8   claimed_bps: u16    // league mode
status: u8   winners_week: u8   winners_count: u16   pot_per_winner: u64
weekly_pot_bps: u16   rollover: u64
fee_bps: u16   fee_cap: u64   fee_treasury: Pubkey   fee_paid: bool   refund_per_member: u64   bump: u8

PrizeSlot { label: [u8;16], bps: u16, assignee: Pubkey, state: u8 }
// state: 0 unassigned · 1 pending (in dispute window) · 2 finalized · 3 claimed
```
**Member** (`["member", pool, wallet]`, space 256):
```
pool, wallet: Pubkey   display_name: [u8;24]   // team name in league mode
paid: bool   sponsored_by: Pubkey   joined_ts: i64
used_mask: u32   current_pick: u8 (255 none)   pick_mask: u32   ranks: [u8;16]   owned_mask: u32
pick_week: u8   pick_note: [u8;24]   points: u32
processed_week: u8   eliminated_week: u8   vetoed_week: u8   claimed: bool   bump: u8
```
**Vault:** the pool PDA's ATA for `usdc_mint`. Only program CPIs move tokens out. **There is no admin withdrawal path — by construction, not by policy.**

### 10.3 Instructions

*Shared*
| # | Instruction | Signer | Key constraints | Effect |
|---|---|---|---|---|
| 1 | `init_config` / `update_config` | deployer / admin | once / `has_one admin` | defaults for future pools only |
| 2 | `create_pool(nonce, name, pool_type, buy_in, max_members, start_week, lock_ts[18], dues_deadline_ts, refund_deadline_ts, prize_slots, weekly_pot_bps, commissioner_plays, display_name)` | commissioner | `usdc_mint == CANONICAL_USDC`; `2..=500` members; `!paused`; pick modes: `lock_ts` strictly increasing, `lock_ts[start-1] > now`; league mode: `slot_count 1..=8`, `Σ bps == 10000`, `dues_deadline_ts > now`; `refund_deadline_ts` after the season | init pool + vault; copy fee fields ($0 → 0); optional commissioner Member |
| 3 | `join_pool(display_name)` | member | pick modes: `now < lock_ts[start-1]`; league: `now < dues_deadline_ts`; not full; Member `init`; transfer buy-in (skip if 0) | counts++, `total_dues += buy_in` |
| 4 | `sponsor_join(wallet, display_name)` | commissioner pays | as join; `sponsored_by = commissioner` | covers a member's seat |
| 5 | `reclaim_dues` | member | not Settled; `now >= refund_deadline_ts`; paid, unclaimed | first call fixes `refund_per_member = vault / paid_members`; transfer |
| 6 | `close_member` / `close_pool` | owner / commissioner | after claims; vault empty | rent hygiene |

*Pick modes (0–7)*
| # | Instruction | Signer | Key constraints | Effect |
|---|---|---|---|---|
| 7 | `submit_pick(team, note)` | member | `team<=31`; `now<lock`; alive; not used; Open | set pick |
| 8 | `submit_pick_mask(mask, ranks?)` | member | `now<lock`; mask ⊆ that week's teams; pick-3: popcount==3 | set mask/ranks |
| 9 | `draft_team(team)` | member in turn | draft open; team unowned | `owned_mask \|= bit` |
| 10 | `post_results(week, winners, pushes, root)` | commissioner | `week==current`; `now >= lock+3h`; not posted; no pending; `winners & pushes == 0` | pending set; veto=0 |
| 11 | `veto_results` | member | pending; alive; once per posting | `2*veto > alive` clears pending |
| 12 | `finalize_week` | anyone | `now >= posted_ts + window` | commit; reset counters |
| 13 | `settle_member(points?, proof?)` | anyone | finalized; unprocessed | apply mode rule (§10.4) |
| 14 | `advance_week` | anyone | all alive processed | end conditions or `current_week++`; pick'em pays the weekly share |
| 15 | `claim_pot` / `claim_weekly` | member | Settled / week finalized; winner test; `!claimed` | fee (if any) once; share to member |

*League mode (8)*
| # | Instruction | Signer | Key constraints | Effect |
|---|---|---|---|---|
| 16 | `lock_dues` | anyone | `now >= dues_deadline_ts`; status Open | fixes `total_dues` and `paid_members`; status → Locked |
| 17 | `post_payout_sheet(assignments: Vec<(slot_idx, member_pubkey)>)` | commissioner | status Locked; no slot currently pending; each `slot_idx < slot_count`; each slot `state == 0`; each assignee is an existing paid Member of this pool | slots → pending, `pending_posted_ts = now`, `veto_count = 0`; status → SheetPosted |
| 18 | `veto_results` (shared) | member | sheet pending; paid member; once per posting | `2*veto > paid_members` → pending slots revert to `state 0`, status → Locked (commissioner re-posts) |
| 19 | `finalize_sheet` | anyone | `now >= pending_posted_ts + dispute_window_secs` | pending slots → `state 2`; status → SheetFinalized |
| 20 | `claim_prize(slot_idx)` | slot assignee | slot `state == 2`; signer == assignee | transfer `total_dues * bps / 10000`; slot → `state 3`; `claimed_bps += bps`; if `claimed_bps == 10000` → Settled |

**Why prizes are computed from `total_dues`, not the live vault balance:** interim payouts (a Week 5 high-score slot) would otherwise shrink the base and quietly change every later prize. Fixing the base at the dues deadline makes every slot's dollar amount knowable — and displayable — from the moment the league locks.

### 10.4 Mode rules in `settle_member` (pick modes)
Survivor: no pick → OUT; `winners & bit` or `pushes & bit` → survive + consume team; else OUT. Loser: survive iff picked team is neither winner nor push. Pick'em: `points += popcount(pick & winners) + popcount(pick & pushes)`. Confidence: add each correct game's rank. Pick-3: all three in winners∪pushes → weekly winner; none → `rollover += weekly share`. Team Draft: `points += popcount(owned & winners)`. Scored (later): verify `(member, points)` against `results_root[w]`.
End conditions (survivor/loser): alive==1 → Settled (winners_week 0, count 1); alive==0 → Settled (winners_week w, count = alive_at_week_start); w==18 → Settled (count = alive). Score modes: Settled after Week 18, `winners_count` = members tied at the top.

### 10.5 Errors, events, security
Errors: `Paused, WrongMint, BadSchedule, BadStartWeek, BadPrizeSplit, SlotsNotSummingTo100, NameTooLong, NoteTooLong, PoolFull, JoinClosed, DuesDeadlinePassed, DuesNotLocked, PicksLocked, TeamAlreadyUsed, InvalidTeam, MemberEliminated, NotAMember, SlotAlreadyAssigned, SlotNotFinalized, NotSlotAssignee, SheetPending, NoPendingSheet, ResultsAlreadyPosted, ResultsPending, NoPendingResults, OverlappingMasks, DisputeWindowOpen, AlreadyVetoed, TooEarly, NotFinalized, AlreadyProcessed, WeekIncomplete, NotSettled, NotAWinner, AlreadyClaimed, RefundNotAvailable, VaultNotEmpty, NotYourTurn, BadPickMask, BadRanks, DraftClosed, BadProof, MathOverflow`.
Events: `PoolCreated, MemberJoined, PickSubmitted, ResultsPosted, ResultsVetoed, WeekFinalized, MemberSettled, WeekAdvanced, PoolSettled, DuesLocked, PayoutSheetPosted, SheetVetoed, SheetFinalized, PrizeClaimed, WeeklyPaid, RolloverAccrued, TeamDrafted, FeePaid, PotClaimed, DuesReclaimed`.

Security (each tested): canonical USDC per cluster (mainnet `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`); vault = pool ATA; SPL Token program checked; signer/owner/PDA/bump on every account; `init` only; checked math; `Clock::get()` only, boundary tests ±1s; idempotent settle/claim/refund/finalize; veto once per member per posting, strict majority; **slot assignees must be existing paid members** (prevents paying a typo'd address); prize sum enforced at creation; fee computed once, capped, never on $0 pools; `paused` blocks creation only, never claims or refunds. **Upgrade authority:** founder-held during the hackathon and disclosed on `/trust`; plan of record is a 2-of-3 multisig within 30 days of launch and immutability after audit (this is also the money-transmission "control" mitigation, §19.3).

Tests: happy path per mode; every rejection path; push; both split paths; W18 multi-survivor; deadman refund; fee math + cap + $0; `sponsor_join`; late-start pool; fake mint; double claim; veto majority; settle idempotency; pick'em weekly share; rollover. **League mode:** prize split rejected unless it sums to 100%; join after dues deadline rejected; `lock_dues` fixes the base; sheet to a non-member rejected; partial sheet then a second sheet; veto reverts pending slots and allows a re-post; claim by a non-assignee rejected; double claim rejected; all-slots-claimed → Settled; deadman refund on an abandoned league with one slot already claimed (remaining balance splits pro-rata).

---

## 11. Static data
`teams.json` (32: index, abbr, city, nickname, colors, espnId). `schedule.json` generated once from ESPN per week (`lockTs` = earliest kickoff, `byeTeams`, `games[]`); committed; the app passes `lock_ts[18]` to `create_pool`. `restricted-states.json` (§19.5).

## 12. Database and jobs
Tables: `pools` (+ `pool_type, prize_slots jsonb, slot_count, claimed_bps, total_dues, dues_deadline_ts, weekly_pot_bps, rollover`), `members` (+ `pick_mask, ranks, owned_mask, points`), `x_links`, `link_nonces`, `results_proposals`, `push_subscriptions`, `attestations` (§19.6, server-only); views `career`, `board`. RLS: public SELECT on pools/members/results_proposals/career/board only; all writes via service role.
Jobs: `/api/cron/index` (5 min: `getProgramAccounts` → decode → upsert; vault balances). `/api/cron/results` (15 min Thu–Tue: ESPN scoreboard server-side; winners/pushes; CONFIRM only when all games final or pushed). `/api/cron/reminders` (Wed 6pm, Thu 9am, 3h before lock: push to alive members without a pick; **league mode: a reminder to the commissioner when a sheet is finalized and prizes are unclaimed**). Cranks: UI SETTLE button (MUST); `/api/cron/crank` (STRETCH).

## 13. Wallet, onboarding, transactions
Join pages work without a wallet and open a two-step OnboardingSheet: (1) get Phantom (links; "open this link inside Phantom's browser"; 20-second video placeholder); (2) get USDC + ~0.005 SOL via Phantom's in-app buy with exact amounts, **or** "ask your commissioner to cover you" (sponsor flow). Wallet Adapter restyled; auto-connect; MWA on Android; iOS deep-link into wallet browsers. One action = one transaction; simulate first; TxSheet in plain English with the vault address + explorer link; never delegation; never unrequested signatures. No accounts or passwords. Eligibility gate on create/join for paid pools (§19.6).

## 14. Design system — "Primetime" (FINAL)
Night `#120D0A` · night2 `#1D1310` · line `rgba(246,239,226,.10)` · cream `#F6EFE2` (60/40 alphas) · leather `#FF5C1B` · leatherHi `#FF7A45` · **gold `#E9C258` (money only: pots, dues, prize amounts)** · alive `#35C97A` · out `#E5484D`; radii 10/14/20/pill; 4px base. Anton (display, uppercase, .015em, tabular numerals) + Space Grotesk 400–700; scale 12/14/16/20/28/40/64+. Mark = THE LACES (below): cream on leather for avatar/icon/empty states, leather on night in-app; never inside the wordmark; never drawn as a football. Laces are the loader and the weeks-survived meter. Mobile-first at 390px (game screens ≤640px, commissioner ≤960px); one leather button per screen; the pot is the hero; chalk hairlines not nested cards; ALIVE/OUT and prize-slot states as Anton pill stamps; countdown always visible before a lock or dues deadline; 150–200ms motion; one celebration (claim); reduced-motion respected; 44px targets; ≥4.5:1 contrast. **Dark only.**
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200"><g transform="rotate(-14)" fill="#FF5C1B"><rect x="-9" y="-84" width="18" height="168" rx="9"/><rect x="-49" y="-63" width="98" height="18" rx="9"/><rect x="-49" y="-27" width="98" height="18" rx="9"/><rect x="-49" y="9" width="98" height="18" rx="9"/><rect x="-49" y="45" width="98" height="18" rx="9"/></g></svg>
```

## 15. Components
`WalletButton · PotDisplay · Countdown · TeamGrid/TeamTile · GamePicker · ConfidenceRanker · DraftBoard · PickNote · MemberRow · StatusBanner · TxSheet · SettleButton · RulesSheet · ShareCard · LacesLoader · Stamp · OnboardingSheet · PickPopularity · RecapBanner · CareerCard · ModePicker · EligibilityGate · StandingsTable`
**League additions:** `PrizeSplitEditor` (add/remove slots, label + %, live total that must hit 100%, warns until it does) · `PrizeSlotRow` (label, %, dollar amount from `total_dues`, assignee, state stamp: OPEN / PENDING / FINAL / PAID) · `PayoutSheetBuilder` (commissioner assigns members to slots, shows exact dollars, one CONFIRM) · `DisputeBanner` (countdown + VETO button + veto tally) · `TeamRoster` (team name, wallet short form, paid stamp).

## 16. Screens
| Route | Content | Done when |
|---|---|---|
| `/` Landing | Wordmark, one-liner, **two doors: START A POOL and RUN YOUR LEAGUE**, three mechanics, trust table, "How the money moves," FAQ (incl. "what is a Survivor pool"), links to `/trust`, `/board`, repo | Two clear entry points above the fold; Lighthouse a11y ≥95 |
| `/new` Create | ModePicker (Survivor · Loser · League Treasurer · others as built) → mode-specific form. **League:** name, dues, teams, dues deadline, PrizeSplitEditor, "I'm playing too," team name | Creating either type takes one signature; invite link copies |
| `/p/[pool]` Hub | **No wallet needed.** Pot/dues total (gold), members or teams with stamps, countdown, StatusBanner, vault → explorer, rules. **League:** the prize split with dollar amounts, sheet status, dispute banner when live. With wallet: JOIN / PICK / SETTLE / CLAIM as applicable | Every state renders from fixtures without a wallet |
| `/p/[pool]/pick` | Mode's pick control → TxSheet; after lock, everyone's picks | Used/bye teams unselectable; lock enforced |
| `/p/[pool]/commish` | Pick modes: proposal vs ESPN, push toggles, CONFIRM, SETTLE. **League: PayoutSheetBuilder**, post/re-post, veto tally, sponsor a seat | A commissioner can run a week (or a payout) without leaving the page |
| `/p/[pool]/claim` | CLAIM POT / **CLAIM PRIZE (per slot)** / RECLAIM DUES | One signature; gold celebration |
| `/p/[pool]/history` (SHOULD) | Pick modes: week × member grid. League: sheet history with tx links | Screenshot-ready on mobile |
| `/me` (SHOULD) | My pools and leagues, career card, display names, Link X, board opt-in, reminders | Works with only a wallet |
| `/board` (SHOULD) | §18 | Renders from the `board` view |
| `/trust` · `/rules` · `/terms` · `/privacy` · `/responsible-play` | §19 language, self-exclusion | Founder-reviewed |
| `/api/v1/*` · OG image | §20 | Documented; previews render |

States: loading = LacesLoader; empty = "No picks yet. Lock is in {countdown}." / "Dues close in {countdown}."; failures per §23.

## 17. Loyalty loop
Web-push reminders (PWA/VAPID) + .ics fallback; pick popularity after lock; pick notes; recap banner; career card; season board; share cards; commissioner friction-killers (sponsor a seat, copy link everywhere, **one-tap payout sheet from last season's split**). **League-specific:** a "dues collected" progress bar the commissioner can screenshot into the league chat — the single best organic growth surface the product has, because it lands in a group of ten people who all have leagues of their own. One reminder cadence, opt-in, no marketing pushes.

## 18. X linking + leaderboard (SHOULD)
Supabase Auth X provider → server reads `x_user_id`/`user_name` from the JWT → single-use 5-minute nonce → wallet signs `commish.fun link\nx:{id}\nwallet:{pubkey}\nnonce:{nonce}` → server verifies JWT + nonce + ed25519 → `x_links` (one-to-one). Unlink/opt-in endpoints. Never store X tokens; never post for the user. Fallback: self-declared handle, no badge, off the board. `/board` from the `board` view; rank best_run → pools_won → usdc_won; no wallet addresses; rows link to proof.

---

## 19. Legal framework and compliance controls
*Research summary for a Texas-resident founder; not legal advice. Retain a Texas gaming attorney before any fee is set above zero, and before launching Commish Pro.*

### 19.1 Texas (Penal Code ch. 47)
- **§47.01 "bet"** excludes prizes to *actual contestants* in a bona fide contest of skill — pool players are not the NFL's contestants, so that exclusion does not apply.
- **§47.02** makes betting on a contest's result an offense (Class C for participants), with the **§47.02(b) defense**: (1) a *private place*; (2) *no person receives economic benefit other than personal winnings*; (3) equal chances but for skill or luck. Prongs (2) and (3) are fully in Commish's control; "private place" online is untested.
- **§47.03 gambling promotion** (Class A) covers one who "for gain, becomes a custodian of anything of value bet." **This is the operator risk; any platform gain tied to a Texas real-money pot is the danger zone.**
- **AG Opinion KP-0057 (2016):** paid daily fantasy likely illegal; **traditional season-long fantasy leagues where the house takes no cut fall within the §47.02(b) defense**. FanDuel exited Texas in a 2016 settlement and returned in 2023; DraftKings sued and no court resolved it; HB 2303 (2019) passed the House 116–26 and died in the Senate; nothing passed in 2025; sports betting needs a constitutional amendment (2027+ at the earliest).
- **Practical enforcement:** office pools are technically illegal and effectively never prosecuted when nobody profits from running them.

### 19.2 Mode-by-mode posture
- **League Treasurer is the strongest position in the product** — it is exactly the "traditional fantasy league" the AG described, with no house cut, among people who know each other.
- **Survivor / Loser / Pick'em / Confidence / Pick-3 / Team Draft / Squares / Bracket:** pools on game outcomes, defensible for participants under §47.02(b) **only while nobody, including Commish, takes economic benefit**. Squares (pure chance) is the weakest; keep it strictly no-benefit.
- **Excluded:** spread/odds modes (sports-betting-adjacent, illegal in Texas), Player-of-the-Week (outside the federal fantasy carve-out), charity splits (a third party taking part of the pot may defeat prong 2).

### 19.3 Federal overlay
**UIGEA (31 U.S.C. §5362)** applies to businesses accepting payments for gambling *unlawful under state law*; its fantasy carve-out requires outcomes from accumulated statistics of multiple individuals across multiple real events, not the score of any single team and not one athlete in one game → season-long fantasy leagues and One & Done qualify; Survivor and Pick'em do not (they are pools, not fantasy). **IGBA (18 U.S.C. §1955)** needs a state-law violation plus five people and 30 days/$2,000 — operator-directed; the no-benefit posture is the mitigation. **Wire Act** is limited to sports betting by those "engaged in the business of betting or wagering" (First Circuit, 2021). **Money transmission:** Texas's Money Services Modernization Act and revised Supervisory Memo 1037 (Jan 2025) treat fiat-pegged stablecoins like USDC as money; holding others' funds can require a license, while software that never takes control generally does not — matching FinCEN's 2019 guidance on non-custodial software and DApp developers. **Therefore the non-custodial construction in §10.2/§10.5 is a legal requirement, not an aesthetic**: no admin withdrawal path, and a credible plan to remove unilateral upgrade authority.

### 19.4 Operating posture (FINAL for Season 1)
Zero economic benefit from real-money pools · non-custodial by construction with a published path to multisig and immutability · private link-only pools, no directory or matchmaking · no betting language, odds, or lines anywhere · $0 pools available everywhere · full transparency on `/trust` and in `docs/LEGAL.md` · **no pool money ever touches a token (§3.1)**.

### 19.5 Age and state eligibility
18+ (19 in AL/NE; 21 in AZ/IA/MA and wherever local law requires — the higher of the local rule and 18). **Restricted-state list for real-money pools** (`restricted-states.json`, counsel-reviewed, mirroring where incumbents withhold paid contests): WA, MT, ID, NV, HI, plus format exclusions used by pool operators: CT, DE, IA, LA, MS, PA, TN; non-US excluded by default. Texas participants are allowed under this posture (no fees, private contests).

### 19.6 Compliance controls (MUST — ship with the first paid pool)
1. **EligibilityGate** on CREATE and JOIN when `buy_in > 0`: age attestation, state selection, **server-side geo check** (`x-vercel-ip-country` / `-country-region` or IP-geo); mismatch or restricted state → paid pools blocked with a clear message and the $0 alternative offered. Logged to `attestations` (server-only).
2. **Terms, Privacy, Responsible Play** pages with wallet-level self-exclusion (excluded wallets cannot join paid pools); linked from the footer and every join sheet.
3. **`/trust` legal block:** no fees, non-custodial, private pools, participant responsibility, age policy.
4. **No promotional listings**, no featured pools, no odds; a copy lint fails the build on "bet/wager/odds/book."
5. **Commissioner acknowledgment** at creation: private group, members known personally, no rake by anyone, local law is their responsibility.
6. **Record-keeping:** attestations retained; on-chain history is the audit trail.
7. **Fee-switch governance:** fee defaults may rise only after written counsel sign-off per state and after the geo gate maps fee eligibility; new pools display fees before creation and joining; existing pools never change.
8. **Demand triggers for the legal/entity work** (the founder's stated sequencing — deferred until demand is proven, then done immediately): form the LLC and retain counsel the same week any one of these first occurs — 100 pools created · 1,000 members · $25,000 cumulative escrowed · the first request to pay for a feature · any press or partnership inquiry.

### 19.7 Residual risks
"Private place" online is untested in Texas. Commish Pro's interaction with §47.03 needs counsel. The industry's Texas fantasy posture rests on an unresolved dispute. A Texas resident operating a national product should behave as if the strictest applicable state governs. Until the LLC exists, the founder is operating personally — low risk at zero profit with private pools, not zero risk.

---

## 20. Integration API, security, operations
**API:** Layer 1 (MUST) — IDL on-chain + `idl/`, `docs/PROGRAM.md`. Layer 2 (SHOULD) — `/api/v1` read-only: `/pools/{a}`, `/members`, `/results`, **`/prizes`**, `/schedule`, `/board`, `/career/{wallet}`; CORS GET; 60/min/IP; edge-cached 30s; `source: "on-chain"` + `asOfSlot`; `docs/API.md`. Layer 3 (STRETCH) — `@commishfun/sdk`. Not v1: webhooks, API keys, write proxies.
**Security/ops:** `.env*` gitignored from commit one; browser Helius key domain-restricted; server secrets only in the host's dashboard; strict CSP; pinned deps; ESPN server-side only; rate limits on `/api/link`, `/api/v1`, attestations; Cloudflare Full (strict), Always HTTPS, min TLS 1.2, DNSSEC, DMARC reject, HSTS on launch day; analytics never see wallets.
**Resilience promise:** `docs/MANUAL-CLAIM.md` shows how to claim a pot, claim a prize slot, or reclaim dues with the CLI against the public IDL if commish.fun disappears entirely. Write it on day 6; it is the strongest trust artifact the product has.
**Abuse cases:** fake results or a self-dealing payout sheet → member veto; commissioner ghosts → permissionless cranks + deadman refund; server down → nothing on-chain depends on it; duplicate wallets → one Member per wallet; pick front-running → hidden in UI until lock (commit-reveal STRETCH); typo'd payouts → impossible, assignees must be existing members.

---

## 21. Build order (critical path; each step ships a working slice)

**Slice A — the money is safe (program).** state/errors/events → `init_config`, `create_pool` (both shapes, prize-split validation), `join_pool`, `sponsor_join` (+tests) → `submit_pick`/`submit_pick_mask` (+all rejection tests) → **founder reviews every token-moving line** → `post_results`, `veto_results`, `finalize_week`, `settle_member` **built as the mode kit from day one: a `match pool_type` dispatch with P0 arms filled and P1/P2 arms stubbed to `err!(ModeNotEnabled)`** → `advance_week` (+boundary tests) → **league path: `lock_dues`, `post_payout_sheet`, `finalize_sheet`, `claim_prize` (+all league tests)** → `claim_pot`, `reclaim_dues`, `close_*` → devnet deploy, `anchor idl init`, commit IDL.

**Slice B — both doors end to end (app).** Scaffold, tokens, fonts, PWA, wallet adapter, `teams.json`, schedule script → `/new` with ModePicker + **PrizeSplitEditor** → `/p/[pool]` hub (wallet-less; both shapes) → JOIN with EligibilityGate + TxSheet → `/pick` **rendering `PICK_CONTROLS[pool_type]` from a registry, not a conditional chain** → Supabase + indexer + results jobs → `/commish` (CONFIRM/pushes/SETTLE **and PayoutSheetBuilder**) → `/claim` (pot **and prize slots**) → **three-wallet devnet loop for Survivor *and* for a 10-team league (create → join ×3 → lock dues → partial sheet → veto → re-post → finalize → claim → final sheet → Settled), plus deadman on a spare pool.**

**Slice B2 — fill the mode kit (P1).** Pick'em: `GamePicker` + popcount scoring + weekly-share payout + StandingsTable. Confidence: `ConfidenceRanker` + rank scoring (reuses Pick'em's standings and weekly share). Each is one Rust arm, one component, one results view — and each gets the same rejection tests as Survivor before it counts as done. **Gate:** only start B2 once the Slice B loop is green for both P0 doors.

**Slice C — it feels like a product.** OnboardingSheet, Countdown/.ics, PickPopularity, StatusBanner + DisputeBanner states, empty/error states, `/rules`, `/trust`, `/terms`, `/privacy`, `/responsible-play` + self-exclusion, `/me` + career card, season board, RecapBanner, OG ShareCard, laces progress, push reminders, the dues-progress screenshot card.

**Slice C2 — P2 modes, only if C finished early.** Team Draft (`DraftBoard`, snake order, `draft_team`, popcount-of-owned scoring) then Pick-3 Jackpot (3-bit pick, rollover accrual). Same done-bar: rejection tests, a devnet run, a results view.

**Slice D — the world can see it.** X linking + `/board`; `/api/v1` + `docs/{API,PROGRAM,MANUAL-CLAIM,LEGAL}.md`; mainnet runbook (build → test → deploy → idl init → env → app → Cloudflare CNAME → Helius domain restriction → HSTS); **the founder's real league onboarded as league #1 and his own Survivor pool as pool #1**; backup demo video; security pass; submission writeup; launch thread.

Calendar: A = days 1–2 · B = days 2–4 · B2 = day 4 evening–5 · C = day 5 · C2 = day 6 morning if clear · D = day 6 · day 7 = buffer/polish · Sept 10 = submit + launch at kickoff. **P3 modes (bracket, Squares) are deliberately post-launch**; they are playoff products and January is their moment.

## 22. QA (before mainnet)
All §10.5 tests green; fake mint and double claim rejected · a no-wallet friend joins a $0 pool from a phone in under five minutes using only the OnboardingSheet · EligibilityGate blocks a restricted-state paid join and allows $0 · every pool and league state renders without a wallet · lock enforced ±1s · push survives and consumes the team · veto majority clears a bad posting *and* a bad payout sheet · SETTLE works from a non-commissioner wallet · claim pays exactly; fees are 0 · **league: prize split must total 100% to create; dollar amounts on the league page match `total_dues × bps`; a sheet naming a non-member is rejected; a second sheet pays the remaining slots; Settled fires only when `claimed_bps == 10000`** · **every shipped mode has: its own rejection tests, one full devnet run from create to claim, a correct results view, and a `ModeNotEnabled` error for every mode not shipped (no half-built mode is reachable in the UI)** · deadman refund works on an abandoned pool and an abandoned league · manual claim works with the site offline · OG renders on X/iMessage · PWA installs · push arrives · Lighthouse perf ≥90 mobile, a11y ≥95 · copy lint finds no "bet/wager/odds."

## 23. Copy bank (no em dashes in social copy; never "bet")
Taglines (§2) · mechanics ("Dues escrowed on-chain · Prizes fixed before anyone pays · Winners claim straight from the vault") · trust line · lock line ("No 'I definitely picked the Bills' texts on Monday.") · no-cut ("100% of the dues go to the league. Commish takes nothing.")
TxSheet join (pool): "Locks {amount} USDC in this pool's vault. Only the winner can take it out. If the pool is ever abandoned, you can reclaim your share."
TxSheet join (league): "Locks {amount} USDC of league dues in the vault. Payouts follow the split you can see above. If the league is ever abandoned, you can reclaim your share."
TxSheet pick: "Locks in {TEAM} for Week {n}. You can change it until kickoff."
Sponsor: "You're covering {name}'s seat ({amount} USDC). Settle up however you like; the pot stays on-chain."
Payout sheet: "You're assigning {slot} ({pct}%, {amount} USDC) to {team}. Your league gets 24 hours to dispute it before anyone can claim."
Dispute banner: "{commissioner} posted the payouts. Anything wrong? Your league has {countdown} to flag it."
OUT: "{name} took the {TEAM}. The {TEAM} did not cooperate." · Push: "{TEAM}'s game was cancelled. Everyone on {TEAM} survives."
Empty: "No picks yet. Lock is in {countdown}." / "Dues close in {countdown}. {n} of {m} teams are in."
Reminder: "Picks lock in 3 hours. You haven't picked."
Eligibility: "Real-money pools aren't available where you are. You can still play this pool for free."
X bio: "Your league's money, out of that one guy's Venmo. Dues escrowed on-chain, prizes fixed up front, winners claim from the vault. Built on Solana. 🏈"

## 24. Demo and launch
**~90 seconds:** "Every year I send $20 to my buddy's Cash App and trust him for five months. Here's the version where nobody has to." → create a **league** live: name, $20 dues, 1st/2nd/3rd split, invite link → two phones join with team names, one sponsored → the vault fills, shown on the explorer → post the payout sheet, dispute window ticking → veto shown as possible, then finalize → a phone claims first place in gold. → Then, fast: the Survivor pool, picks locked at kickoff, a real historical week confirmed, an OUT stamp. → "Prizes nobody can change, money nobody can move, results anyone can dispute. Commish takes nothing. Week 1 locks Thursday, and every league in America is collecting dues right now."
**Launch:** @Commishfun posts the banner thread at kickoff; the founder's personal account posts the Cash App story; the README build checklist becomes the build-in-public thread.

## 25. Founder context
Solo founder (Texas); also runs HoldFlow (Solana creator-fee distribution: escrow PDAs, holder snapshots, payout engines, Supabase). Money-code review is in experienced hands. Entity and counsel are deliberately deferred until a §19.6.8 demand trigger fires; every control that makes that deferral safe ships in the build. First repo commit inside the hackathon window.
