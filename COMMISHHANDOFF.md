# COMMISH — complete project handoff
*Paste this whole document into your coding assistant. It contains everything decided to date: product, game rules, on-chain architecture, data sources, brand system (with SVG source), copy bank, and the build plan. Nothing else is needed.*

---

## 1. What Commish is

**One-liner:** The Solana version of the office Survivor pool. Buy-ins escrowed on-chain, picks locked before kickoff, eliminations settled from real NFL results, pot to the last wallet standing. Nobody holds the money, because nobody needs to.

**Context:** Entry for the NoahAI Nitro 03 hackathon (Sept 3–10, 2026; theme "Build the Solana version of your favorite Web2 product"). NFL Week 1 kicks off Sept 10 — submission day is the last day to join a Survivor pool, so real pools can adopt this the day it ships. The Web2 product being replaced: the Venmo group where one guy holds everyone's buy-ins all season.

**Domain:** commish.fun. **Positioning line:** "Your Survivor pool, out of that one guy's Venmo."

---

## 2. Game rules (FIXED — do not make configurable)

- Everyone pays the buy-in (USDC) to join. Pool closes at Week 1 lock.
- Each week: pick ONE NFL team to WIN. All picks lock at the week's first kickoff (Thursday night — one global weekly lock).
- Your team wins → advance. Loses OR ties → eliminated. No pick by lock → eliminated.
- Each team usable once per season (32 teams, 18 weeks; enforced by per-member bitmask).
- Last member standing takes the pot. Edge cases, all deterministic in-program:
  - All remaining members eliminated in the same week → pot splits evenly among that week's entrants.
  - Multiple survivors after Week 18 → even split.
  - Season never settled (dead server, vanished commissioner) → **deadman refund**: after refundDeadlineTs (~season end + 30 days), any member reclaims their pro-rata share. The pot cannot be stranded by anyone.

---

## 3. On-chain design (small Anchor program — Solana)

**Division of labor: the AI assistant scaffolds the web app, sync server, and wallet wiring. The Anchor program and every lamport-moving path are hand-written and reviewed by the founder. Generate program skeletons if asked, but flag every money-moving line for human review.**

### Accounts
- **Pool PDA** — seeds `["pool", commissioner, nonce]`
  - commissioner, usdcMint, buyInAmount, maxMembers, memberCount, aliveCount
  - currentWeek, weekLockTs, disputeWindowSecs (~24h), refundDeadlineTs
  - pendingResults: Option<{week, winnersMask: u32}>, resultsPostedTs, settled
- **Vault** — USDC ATA owned by the Pool PDA. All buy-ins live here; only program logic moves funds.
- **Member PDA** — seeds `["member", pool, wallet]`
  - wallet, paid, eliminatedWeek: Option<u8>
  - usedTeamsMask: u32 (no-reuse enforcement)
  - currentPick: Option<u8> (team index 0–31), pickWeek

### Instructions
1. `create_pool(params)` / `join_pool()` — buy-in transfers to vault; one member per wallet.
2. `submit_pick(team)` — rejects if past weekLockTs, team bit already in usedTeamsMask, or member eliminated. Overwrite allowed until lock. **This instruction is the game's integrity — build its three rejection paths first, with tests, before any UI.**
3. `post_week_results(week, winnersMask)` — commissioner signs; starts the dispute window. winnersMask has a bit set for each team that WON (ties/losses = bit off).
4. `veto_results` — any alive member during the window; >50% of alive members clears pendingResults for a re-post.
5. `settle_week` — permissionless crank after the window: eliminates every alive member whose pick's bit is off (or who has no pick), advances currentWeek, sets next weekLockTs. aliveCount → 0: that round's entrants become co-winners. aliveCount == 1: settled.
6. `claim_pot` — winner (or co-winners, even split) withdraw.
7. `reclaim_dues` — the deadman refund described in the rules.

### Trust model (state this honestly in any submission/writeup)
Game results enter via the commissioner's signature — there is no oracle pretense. What the chain removes is every way commissioner trust historically fails: he cannot spend the pot (vault moves only via payout logic), change rules mid-season (fixed at creation), slow-pay (permissionless crank), post fake winners quietly (24h member veto against results anyone can verify on any scoreboard), or strand the money (deadman refund). *The commissioner keeps the job, loses the custody.*

### Pick privacy
- MVP: picks are technically public on-chain; the app hides other members' picks until lock. Say so honestly.
- Stretch: commit-reveal — `submit_pick` stores hash(team, salt); the server holds salts and auto-reveals after lock; unrevealed = no pick.

---

## 4. Off-chain

### Server (thin)
Polls a scores source, computes the weekly winnersMask, and renders it on a commissioner dashboard next to one CONFIRM button that builds the `post_week_results` transaction. Human-in-the-loop by design.

### Real NFL data
- **Game winners (all the MVP needs):** ESPN's public scoreboard JSON — `site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` — or the nflverse GitHub datasets (free, updated nightly). Verify endpoints at build time.
- **Demo settlement:** Week 1 won't have been played by demo day. Add a `demo` pool flag that replays a real historical week's results so eliminations settle live on stage.

### Stretch mode (build only if ahead of schedule; cut first)
"Attach your Sleeper league": full-league dues escrow + standings-based payouts via Sleeper's public API (no auth): `/v1/league/{id}`, `/rosters`, `/users`, `/matchups/{week}`, `/v1/state/nfl` for current week. Same post → veto → settle spine.

### Frontend screens (the two that matter most)
- **Member dashboard:** "Pot $800 · 6 alive · your pick locks in 3h" + the pick grid: 32 team logos, used teams grayed, countdown to lock.
- **Commissioner CONFIRM screen:** proposed results from the server, one button.

---

## 5. Brand system ("Pigskin" — final, decided)

### The mark: THE LACES
One spine, four cross ticks, rounded ends, tilted 14°. The one part of a football that means football and nothing else; it also reads as stacked plus-signs (money in) and a ladder (surviving weeks). Never draw a full illustrated football — that decision is final. Canonical SVG (viewBox `-100 -100 200 200`):

```svg
<g transform="rotate(-14)" fill="#F6EFE2">
  <rect x="-9" y="-84" width="18" height="168" rx="9"/>
  <rect x="-49" y="-63" width="98" height="18" rx="9"/>
  <rect x="-49" y="-27" width="98" height="18" rx="9"/>
  <rect x="-49" y="9" width="98" height="18" rx="9"/>
  <rect x="-49" y="45" width="98" height="18" rx="9"/>
</g>
```
Cream `#F6EFE2` when on orange; orange `#FF5C1B` when on dark. Below ~40px, drop to spine + 3 ticks (thicker: spine w22, ticks h22).

### Palette (use as design tokens)
| Token | Hex | Job |
|---|---|---|
| leather | `#FF5C1B` | brand, links, CTAs, the mark on dark |
| night | `#120D0A` | ground / backgrounds |
| cream | `#F6EFE2` | type, the mark on orange |
| potGold | `#E9C258` | **money only** — pot amounts, payouts. Nothing else, ever |
| alive | `#35C97A` | survivor "alive" state in-app |
| (elimination red) | pick ~`#E5484D` | "eliminated" state only; never brand |

**The one rule: orange is the brand, gold is the money.**

### Type
- Display/wordmark: **Anton** (Google Fonts), letter-spacing 0.015em. Wordmark is COMMISH in Anton cream — the mark sits BESIDE it, never inside it (ball-as-O was tried and retired).
- UI/body: **Space Grotesk**.

### Assets already cut (founder has the PNGs)
Launch banner 3200×1800, X avatar (cream laces on full-bleed orange), X header 3000×1000, app icon 1024 squircle, transparent marks in both colors. Rebuild any of them from the SVG + tokens above.

### Product flourish worth building
The glyph is four ticks; a season is a sequence of weeks — use the mark as the app's progress/loading indicator, ticks lighting up as a member survives weeks.

---

## 6. Copy bank (voice: confident, league-culture-native, no em dashes in social copy)

- Tagline: "Your Survivor pool, out of that one guy's Venmo."
- Mechanics line: "Buy-ins escrowed on-chain · Picks locked at kickoff · Last one standing takes the pot"
- Trust line: "The commissioner keeps the job, loses the custody."
- Pick-lock line: "No 'I definitely picked the Bills' texts on Monday."
- X bio: "Your Survivor pool, out of that one guy's Venmo. Buy-ins escrowed on-chain, picks locked at kickoff, last one standing takes the pot. Built on Solana. 🔒 commish.fun"

## 7. Seven-day plan (Sept 3–10)

1. **3–4:** Anchor program: create/join/vault + `submit_pick` with all three rejection paths, tests, devnet green. App scaffold in parallel.
2. **5:** post_week_results → veto → settle_week end to end. ESPN proposal server + CONFIRM screen.
3. **6:** Payout paths: last-standing, co-winner split, deadman refund. Tests on all three.
4. **7:** Pick grid polish + demo-replay flag. Stretch: commit-reveal.
5. **8:** The two money screens. Record a backup demo video.
6. **9:** Onboard one real pool, mainnet dry run, submission writeup.
7. **10:** Submit. NFL kickoff same day — launch thread during kickoff hype.

## 8. Demo script (~90s)

1. "Survivor pools move thousands a season through one guy's Venmo. Here's the version where he can't lose it, spend it, or ghost you."
2. Create a pool live; two phones join; buy-ins visibly fill the vault.
3. Both phones pick on the grid; lock hits; picks frozen.
4. Replay a real historical week → CONFIRM → one phone flips to ELIMINATED; the pot pays the survivor.
5. "Results anyone can veto, a pot nobody can strand, picks nobody can backdate. Week 1 locks Thursday. Real pools can use this today."

## 9. Founder facts (for context, not code)

- Solo founder, also runs HoldFlow (Solana creator-fee distribution; deep experience with escrow PDAs, holder snapshots, payout engines — the money-code review is in good hands).
- Check the Nitro 03 rules for what must be built inside the Sept 3–10 window; spec and API testing beforehand is research, first repo commit inside the window.
- Prize pool is $1,000 (500/300/200), but the real prize is the @solana + NoahAI audience on launch day.
