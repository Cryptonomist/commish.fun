# The Commish program

`programs/commish` — the escrow. Anchor 1.1.2, one program, no admin key over
anyone's money.

## The guarantee, stated as code

Money leaves a vault by exactly four paths, and each one names its own
recipient:

| Path | Who gets paid | Gate |
|---|---|---|
| `claim_pot` | a member who passes the winner test | pool is `Settled` |
| `claim_prize` | the member assigned a finalized slot | slot state is `Finalized` |
| `reclaim_dues` | any paid member, pro rata | past `refund_deadline_ts` |
| platform fee | the treasury recorded at creation | computed once at settlement, capped, 0 in season 1 |

There is no admin withdrawal, no sweep, no "emergency" path. Grep for
`Transfer {` — there are six call sites. Two move money *into* a vault
(`join_pool`, `sponsor_join`); the other four are the table above.

**This table was wrong until the fee transfer was written.** The fee was
deducted from the winners' pot in `advance_week` and sent nowhere, so it sat in
the vault as unclaimable residue and the fourth path did not exist. It was
invisible because season 1 runs at `fee_bps == 0`. `Pool::fee_paid` had been
declared since the first commit and never written by anything — that unused
field was the fingerprint. Found by writing the LiteSVM suite at 250bps instead
of at the default.

## Build and test

```bash
cargo test -p commish        # pure rules + account sizes, no validator needed
anchor build                 # needs the Solana toolchain + anchor CLI
anchor deploy --provider.cluster devnet
anchor keys sync             # writes the real program id into lib.rs + Anchor.toml
```

`cargo test` runs today with nothing but Rust installed. `anchor build` needs
`avm`/`anchor` and the SBF toolchain — see SETUP.md.

**Devnet uses a different USDC.** Build with `--features devnet` or pool
creation will reject the devnet mint.

## What is implemented

**Shipped and compiling:** `init_config`, `update_config`, `create_pool`,
`join_pool`, `sponsor_join`, `submit_pick`, `post_results`, `veto_results`,
`finalize_week`, `settle_member`, `advance_week`, `claim_pot`, `reclaim_dues`,
`lock_dues`, `post_payout_sheet`, `finalize_sheet`, `claim_prize`,
`close_member`.

**Modes:** Survivor (0), Loser (1) and League (8). Every other `pool_type` is
refused at creation *and* in `settle_member` with `ModeNotEnabled`, so a
half-built mode can never take money.

**Not built yet:** `submit_pick_mask`, `draft_team`, `claim_weekly`,
`close_pool`, and Merkle verification against `results_root` (the field is
reserved, never read).

## The mode kit

A mode is one arm of `rules::survives`, and nothing else. It is a pure function
so it can be tested without a validator — `cargo test` covers Survivor, Loser,
the push rule, missed picks, all 32 team indices, and that unshipped modes
refuse rather than guess.

Adding Pick'em means: one arm in `rules`, one `PICK_CONTROLS` entry in the app,
and a scoring line. It must not touch the vault, the veto, the refund or the
claim path. If a mode seems to need that, it is a design error — stop.

## The veto only worked once

A member's "I already voted" marker lives on their own `Member` account, and
`veto_results` has no list of members to walk, so clearing a posting cannot
reset anybody's marker. The marker used to be the *week number* — which meant a
commissioner who got vetoed could post the identical results again, and every
member who struck them down the first time was refused with `AlreadyVetoed`.
One abstainer in a four-member pool was enough to make a majority unreachable
on the second attempt. In a league it was worse: the marker was the constant
`u8::MAX`, so a member could veto exactly one sheet ever.

The marker is now `Pool::veto_epoch`, which counts postings rather than weeks
and increments on every `post_results` and `post_payout_sheet`. A re-post is a
new vote. This is why `Pool` is 1,616 bytes and `Member` is 201 rather than the
1,614 and 200 an earlier version of this document quoted.

Found by writing a red test for the re-post path, which is a path no amount of
reading the happy case would have surfaced.

## Where the vault can be raced

Two instructions can draw on the same vault without knowing about each other,
and both cases are decided deliberately:

**`claim_pot` vs `reclaim_dues` — cannot overlap.** `claim_pot` requires
`Settled`; `reclaim_dues` refuses `Settled`. Mutually exclusive by construction,
in every pick mode.

**`claim_prize` vs `reclaim_dues` — could overlap, and did.** A finalized payout
sheet leaves a league at `SheetFinalized`, not `Settled`, so the refund guard
let it through. Past the refund deadline the first member to call
`reclaim_dues` split the entire vault pro rata; the assignee's `claim_prize`
then paid `amount.min(vault.amount)` == 0 and still burned the slot, and at
10,000 claimed bps the pool flipped to `Settled`, closing the refund behind
whoever moved first.

`reclaim_dues` now refuses while any slot is `Pending` or `Finalized`. Because a
winner who never claims would otherwise strand the vault forever, the block
expires `PRIZE_CLAIM_GRACE_SECS` (30 days) after the refund deadline, at which
point unclaimed prizes rejoin the pro-rata split. The deadman still always
fires; it just waits its turn.

## A week has to be long enough to play

`post_results` cannot run until `MIN_POST_DELAY_SECS` (3h) after a lock, and
`finalize_week` waits a further `dispute_window_secs`. If the next lock arrives
before that finishes, `advance_week` never runs, the next week opens already
locked, every member misses a pick and the pool is dead — after the buy-ins are
collected. `create_pool` used to check only that locks were strictly increasing.

It now requires `lock_ts[w] - lock_ts[w-1] > MIN_POST_DELAY_SECS +
dispute_window_secs`. Note what that means at the extremes: the 7-day maximum
dispute window needs more than 171 hours between locks, which is longer than a
real NFL week. A pool wanting week-long disputes has to shorten its schedule or
its window. That is a genuine constraint, and it is now refused at creation
rather than sold and discovered in week two.

## Three decisions worth knowing

**Pool is 1,616 bytes, not the 1,280 in the handoff.** The spec's own field list
does not fit in 1,280 — `results_root: [[u8;32];18]` is 576 bytes alone — so a
literal 1,280 would have failed on the first `create_pool`, after the rent was
paid. Space is derived with `InitSpace` and pinned by a test. It was 1,614 until
`veto_epoch` was added; the test is what makes a change like that a decision
rather than a surprise.

**Prizes are a share of `total_dues`, fixed at `lock_dues`, not of the live
vault.** An interim payout would otherwise shrink the base and quietly change
every later slot's value.

**The commissioner does not get a Member from `create_pool`.** They call
`join_pool` like everyone else; the app sends both in one transaction. One join
path, atomic, no optional account.

## Security invariants, each one a line you can find

- `usdc_mint == CANONICAL_USDC`, per cluster, checked at creation
- the vault is the pool PDA's ATA, derived by the `Accounts` struct, never passed in
- every `Member` is a PDA of `[b"member", pool, wallet]`; assignees on a payout
  sheet are proven by that derivation, not asserted by the commissioner
- checked arithmetic on every counter and every money calculation
- `settle_member`, `claim_*` and `reclaim_dues` are idempotent — the second call
  is refused, not repeated
- one veto per member per **posting** — keyed on `veto_epoch`, not the week, so
  a re-post reopens the vote; a **strict** majority clears it
- `paused` blocks pool creation only, never a claim or a refund
- integer division on splits; dust stays in the vault. This is deliberate and
  is *not* the same as the fee bug above: dust is bounded by `winners_count`
  micro-USDC — millionths of a dollar — while the fee scaled with the pot

## Before mainnet

1. `anchor build` + `anchor test` against a validator — none of the
   account-level constraints have executed yet, only compiled.
2. Every rejection path from the handoff's §10.5 test list.
3. The three-wallet devnet loop: create → join ×3 → pick → post → veto →
   re-post → finalize → settle → advance → claim.
4. Boundary tests at ±1s around every lock and window.
5. Decide the upgrade authority AFTER an audit. Keep the single key, discard it
   for immutability, or share it. No option is committed to; a 2-of-3 multisig
   was the plan of record and is not any more.
