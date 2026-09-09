use anchor_lang::prelude::*;

/* THE MINT IS PINNED, PER CLUSTER.
 *
 * A pool that accepts "whatever mint the commissioner passed" accepts a mint the
 * commissioner minted himself: members pay in worthless tokens, or — worse — the
 * commissioner funds the vault with a token only he can mint and drains the real
 * one. Checking `usdc_mint == CANONICAL_USDC` at creation is the whole defence,
 * and it costs one comparison.
 *
 * Devnet uses a different USDC, so the constant switches on a build feature
 * rather than being passed in. Building for devnet without the feature fails
 * loudly at pool creation instead of silently accepting the wrong token. */
#[cfg(not(feature = "devnet"))]
pub const CANONICAL_USDC: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
#[cfg(feature = "devnet")]
pub const CANONICAL_USDC: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

pub const SEED_CONFIG: &[u8] = b"config";
pub const SEED_POOL: &[u8] = b"pool";
pub const SEED_MEMBER: &[u8] = b"member";
pub const SEED_ORACLE: &[u8] = b"oracle";
pub const SEED_ADMIN_TRANSFER: &[u8] = b"admin_transfer";

pub const WEEKS: usize = 18;
pub const MAX_PRIZE_SLOTS: usize = 8;
pub const MAX_NAME: usize = 32;
pub const MAX_DISPLAY_NAME: usize = 24;
pub const MAX_NOTE: usize = 24;
pub const MAX_SLOT_LABEL: usize = 16;

pub const MIN_MEMBERS: u16 = 2;
pub const MAX_MEMBERS: u16 = 500;

/// 255 means "no pick this week". A real team index is 0..=31.
pub const NO_PICK: u8 = 255;
pub const TEAM_COUNT: u8 = 32;

/// Basis points are the only percentage unit in the program. 10000 == 100%.
pub const BPS_DENOM: u16 = 10_000;

/* THE FEE CEILING, in code rather than in policy.
 *
 * `update_config` accepted any fee up to BPS_DENOM, which made "the admin
 * would never set 100%" a promise instead of a property. Fees are copied
 * into a pool at creation, so no existing pool was ever at risk; every pool
 * created after a bad update was. A compromised admin key now cannot make a
 * new pool confiscatory, and a fat-fingered one cannot either. Mainnet runs
 * 300 bps; the ceiling is ten percent, and raising it is a program upgrade
 * rather than a transaction. */
pub const MAX_FEE_BPS: u16 = 1_000;

/* THE TIMING FLOORS, AND THE ONE BUILD THAT SHORTENS THEM.
 *
 * A pool cannot be created with its first lock already past, `post_results`
 * waits three hours after that lock, and `finalize_week` waits the dispute
 * window on top. Against a validator whose clock is wall time that makes one
 * trip round the results loop a matter of hours, which is how a screen ends up
 * shipping unexercised.
 *
 * `fastclock` drops the two floors to a minute and thirty seconds so the whole
 * loop can be walked while somebody watches. It is gated on `devnet` at compile
 * time: a mainnet build that enables it does not produce a fast pool, it
 * produces a compile error. A floor that stops a commissioner posting results
 * before the games are played is not a thing to lose to a stray build flag,
 * and the devnet feature is already the switch that says "this binary is not
 * for real money".
 *
 * Neither value drops to zero. A floor of zero would let results be posted in
 * the same slot as the kickoff, which is a different program rather than a
 * faster one, and the point is to exercise the behaviour rather than skip it.
 */
#[cfg(all(feature = "fastclock", not(feature = "devnet")))]
compile_error!(
    "fastclock shortens the result-posting and dispute floors to seconds and is for \
     a local validator only. Build it with --features devnet,fastclock. A mainnet \
     build must never enable it."
);

/// Results may not be posted until the week's games could plausibly be over.
/// Three hours after the FIRST kickoff is not "all games are final" — it is a
/// floor that stops a commissioner posting a week's results before it starts.
#[cfg(not(feature = "fastclock"))]
pub const MIN_POST_DELAY_SECS: i64 = 3 * 60 * 60;
/// Local builds only. Long enough to watch the countdown, short enough to sit
/// through. See the note above.
#[cfg(feature = "fastclock")]
pub const MIN_POST_DELAY_SECS: i64 = 60;

/// How long a finalized prize blocks the deadman refund.
///
/// `reclaim_dues` and `claim_prize` draw on the same vault and neither knows
/// about the other, so a slow winner could have their prize refunded out from
/// under them. Blocking the refund forever would strand the vault instead, so
/// the block expires: after this, unclaimed prizes rejoin the pro-rata split.
pub const PRIZE_CLAIM_GRACE_SECS: i64 = 30 * 24 * 60 * 60;

/* THE DEADMAN CANNOT FIRE WHILE THE LAST WEEK IS BEING DECIDED.
 *
 * `reclaim_dues` opens at the refund deadline, and `create_pool` only asked
 * that the deadline fall after the last lock: one second after was legal.
 * Week 18 cannot be posted for three hours after that lock and cannot be
 * finalized for a further dispute window, so a deadline inside that room
 * let any eliminated member call `reclaim_dues` while the winner was still
 * being decided, flip the pool to ABANDONED, and split the pot pro rata with
 * themselves in it. The site never set such a deadline; the program allowed
 * one. Found by an outside review on 2026-09-09.
 *
 * So the deadline has to clear the whole settle room, posting floor plus
 * dispute window, with a day to spare for the crank. On a fast clock the day
 * is a minute, for the same reason the other floors shrink. */
#[cfg(not(feature = "fastclock"))]
pub const REFUND_MARGIN_SECS: i64 = 24 * 60 * 60;
#[cfg(feature = "fastclock")]
pub const REFUND_MARGIN_SECS: i64 = 60;

/// How long members get to veto a posting when a pool does not choose. Two days
/// is long enough for a working week to notice and short enough that a pot is
/// not held hostage.
pub const DEFAULT_DISPUTE_WINDOW_SECS: u32 = 48 * 60 * 60;
#[cfg(not(feature = "fastclock"))]
pub const MIN_DISPUTE_WINDOW_SECS: u32 = 60 * 60;
/// Local builds only, alongside the shortened `MIN_POST_DELAY_SECS`.
#[cfg(feature = "fastclock")]
pub const MIN_DISPUTE_WINDOW_SECS: u32 = 30;
pub const MAX_DISPUTE_WINDOW_SECS: u32 = 7 * 24 * 60 * 60;

/* Pool types. The mode kit: every mode shares one escrow, one veto, one deadman
 * refund and one claim path, and differs only in the `settle_member` arm.
 * P0 ships 0, 1 and 8; everything else is reachable in the enum and refused at
 * runtime with ModeNotEnabled, so a half-built mode can never take money. */
pub const POOL_SURVIVOR: u8 = 0;
pub const POOL_LOSER: u8 = 1;
pub const POOL_PICKEM: u8 = 2;
pub const POOL_CONFIDENCE: u8 = 3;
pub const POOL_PICK3: u8 = 4;
pub const POOL_TEAM_DRAFT: u8 = 5;
pub const POOL_SQUARES: u8 = 6;
pub const POOL_BRACKET: u8 = 7;
pub const POOL_LEAGUE: u8 = 8;
pub const POOL_TYPE_MAX: u8 = 8;

/// Modes whose money path is implemented and tested.
pub fn mode_enabled(pool_type: u8) -> bool {
    matches!(pool_type, POOL_SURVIVOR | POOL_LOSER | POOL_LEAGUE)
}

/* Pool status. Both state machines share the field; league pools use
 * SheetPosted/SheetFinalized where pick pools use ResultsPosted/Finalized. */
pub const STATUS_OPEN: u8 = 0;
pub const STATUS_LOCKED: u8 = 1;
pub const STATUS_RESULTS_POSTED: u8 = 2;
pub const STATUS_FINALIZED: u8 = 3;
pub const STATUS_SETTLED: u8 = 4;
pub const STATUS_ABANDONED: u8 = 5;
pub const STATUS_SHEET_POSTED: u8 = 6;
pub const STATUS_SHEET_FINALIZED: u8 = 7;

/* Prize slot state. */
pub const SLOT_UNASSIGNED: u8 = 0;
pub const SLOT_PENDING: u8 = 1;
pub const SLOT_FINALIZED: u8 = 2;
pub const SLOT_CLAIMED: u8 = 3;

/// Sentinel for "this member has not been settled for any week yet". Week
/// numbers are 1..=18, so 0 is free and means "never".
///
/// LOAD-BEARING: `claim_pot` distinguishes "one survivor left" from "everybody
/// died in week N" by comparing `pool.winners_week` against this sentinel. That
/// only works because a real week is never 0. If weeks ever become 0-indexed,
/// the two branches collapse into each other and the wrong people get paid.
pub const WEEK_NONE: u8 = 0;
