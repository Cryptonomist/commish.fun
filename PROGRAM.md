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
| platform fee | the treasury recorded at creation | computed once, capped, 0 in season 1 |

There is no admin withdrawal, no sweep, no "emergency" path. Grep for
`Transfer {` — there are five call sites and every one is above.

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

## Three decisions worth knowing

**Pool is 1,614 bytes, not the 1,280 in the handoff.** The spec's own field list
does not fit in 1,280 — `results_root: [[u8;32];18]` is 576 bytes alone — so a
literal 1,280 would have failed on the first `create_pool`, after the rent was
paid. Space is derived with `InitSpace` and pinned by a test.

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
- one veto per member per posting; a **strict** majority clears it
- `paused` blocks pool creation only, never a claim or a refund
- integer division on splits; dust stays in the vault

## Before mainnet

1. `anchor build` + `anchor test` against a validator — none of the
   account-level constraints have executed yet, only compiled.
2. Every rejection path from the handoff's §10.5 test list.
3. The three-wallet devnet loop: create → join ×3 → pick → post → veto →
   re-post → finalize → settle → advance → claim.
4. Boundary tests at ±1s around every lock and window.
5. Upgrade authority to a 2-of-3 multisig; immutable after audit.
