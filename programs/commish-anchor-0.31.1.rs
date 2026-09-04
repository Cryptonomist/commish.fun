#![allow(clippy::too_many_arguments)]
#![allow(unexpected_cfgs)]

//! # Commish
//!
//! Escrow for NFL Survivor pools and league dues.
//!
//! ## The one idea
//!
//! The commissioner keeps the job and loses the custody. Every pool has a vault
//! that is the pool PDA's associated token account, and **there is no
//! instruction anywhere in this program that moves money out of a vault to an
//! arbitrary destination.** Funds leave by exactly four paths, each of which
//! names its own recipient:
//!
//! * `claim_pot` — to a member who passes the winner test
//! * `claim_prize` — to the member assigned a finalized prize slot
//! * `reclaim_dues` — pro rata, to any paid member, after the refund deadline
//! * the platform fee — to the treasury recorded on the pool at creation
//!
//! There is no admin withdrawal, no "emergency" sweep and no upgrade-only
//! escape hatch. That is a property of the instruction set, not a policy.
//!
//! ## The mode kit
//!
//! Every game mode shares one escrow, one veto, one deadman refund and one
//! claim path. A mode differs only in its arm of `settle_member`. P0 ships
//! Survivor (0), Loser (1) and League (8); every other mode is refused at
//! runtime with `ModeNotEnabled`, so a half-built mode can never take money.
//!
//! ## Trust, stated honestly
//!
//! Results enter through the commissioner, checked by members against any
//! public scoreboard. There is no oracle here and the program does not pretend
//! otherwise. What it guarantees is that a bad posting can be vetoed by a
//! majority, that a posting cannot be acted on until its dispute window closes,
//! and that an abandoned pool always refunds.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};

/* PORTED TO ANCHOR 0.31.1.
 * The 1.x line changed `CpiContext::new` to take a `Pubkey`; 0.31 takes the
 * program's `AccountInfo`. That is the only API difference between the two
 * builds of this program — five call sites, all token transfers. */


pub mod constants {
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

/// Results may not be posted until the week's games could plausibly be over.
/// Three hours after the FIRST kickoff is not "all games are final" — it is a
/// floor that stops a commissioner posting a week's results before it starts.
pub const MIN_POST_DELAY_SECS: i64 = 3 * 60 * 60;

/// How long members get to veto a posting when a pool does not choose. Two days
/// is long enough for a working week to notice and short enough that a pot is
/// not held hostage.
pub const DEFAULT_DISPUTE_WINDOW_SECS: u32 = 48 * 60 * 60;
pub const MIN_DISPUTE_WINDOW_SECS: u32 = 60 * 60;
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
pub const WEEK_NONE: u8 = 0;

}

pub mod errors {
use anchor_lang::prelude::*;

/// Every rejection the program can produce. The message is what a member reads
/// in a wallet, so each one says what happened, not which check failed.
#[error_code]
pub enum CommishError {
    #[msg("Pool creation is paused")]
    Paused,
    #[msg("That is not the USDC mint this program accepts")]
    WrongMint,
    #[msg("Kickoff times must be strictly increasing and in the future")]
    BadSchedule,
    #[msg("Start week must be between 1 and 18")]
    BadStartWeek,
    #[msg("Prize slots must be between 1 and 8")]
    BadPrizeSplit,
    #[msg("Prize slots must add up to exactly 100%")]
    SlotsNotSummingTo100,
    #[msg("That name is too long")]
    NameTooLong,
    #[msg("That note is too long")]
    NoteTooLong,
    #[msg("This pool is full")]
    PoolFull,
    #[msg("Joining has closed for this pool")]
    JoinClosed,
    #[msg("The dues deadline has passed")]
    DuesDeadlinePassed,
    #[msg("Dues are not locked yet")]
    DuesNotLocked,
    #[msg("Picks are locked for this week")]
    PicksLocked,
    #[msg("You have already used that team this season")]
    TeamAlreadyUsed,
    #[msg("That is not a valid team")]
    InvalidTeam,
    #[msg("You are out of this pool")]
    MemberEliminated,
    #[msg("You are not a member of this pool")]
    NotAMember,
    #[msg("That prize slot is already assigned")]
    SlotAlreadyAssigned,
    #[msg("That prize slot is not finalized yet")]
    SlotNotFinalized,
    #[msg("That prize slot is not yours")]
    NotSlotAssignee,
    #[msg("A payout sheet is already awaiting its dispute window")]
    SheetPending,
    #[msg("There is no payout sheet awaiting a decision")]
    NoPendingSheet,
    #[msg("Results for that week are already final")]
    ResultsAlreadyPosted,
    #[msg("Results are already posted and awaiting their dispute window")]
    ResultsPending,
    #[msg("There are no pending results")]
    NoPendingResults,
    #[msg("A team cannot both win and push")]
    OverlappingMasks,
    #[msg("The dispute window is still open")]
    DisputeWindowOpen,
    #[msg("You have already vetoed this posting")]
    AlreadyVetoed,
    #[msg("Too early")]
    TooEarly,
    #[msg("That week is not finalized")]
    NotFinalized,
    #[msg("Already settled for this week")]
    AlreadyProcessed,
    #[msg("Some members still need settling for this week")]
    WeekIncomplete,
    #[msg("This pool is not settled")]
    NotSettled,
    #[msg("You did not win this pool")]
    NotAWinner,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Refunds are not available yet")]
    RefundNotAvailable,
    #[msg("The vault still holds funds")]
    VaultNotEmpty,
    #[msg("It is not your turn to draft")]
    NotYourTurn,
    #[msg("That pick mask is not valid for this week")]
    BadPickMask,
    #[msg("Those confidence ranks are not valid")]
    BadRanks,
    #[msg("The draft is closed")]
    DraftClosed,
    #[msg("That proof does not match the posted results")]
    BadProof,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("That game mode is not enabled yet")]
    ModeNotEnabled,
    #[msg("That is not a valid pool type")]
    BadPoolType,
    #[msg("That dispute window is out of range")]
    BadDisputeWindow,
    #[msg("The refund deadline must be after the season ends")]
    BadRefundDeadline,
    #[msg("This pool is already settled")]
    AlreadySettled,
    #[msg("That action does not apply to this kind of pool")]
    WrongPoolKind,
    #[msg("That member has not paid their buy-in")]
    MemberNotPaid,
    #[msg("The vault does not belong to this pool")]
    BadVault,
}

}

pub mod events {
use anchor_lang::prelude::*;

/* Events are the indexer's only input. Everything the app shows about a pool it
 * did not just write is reconstructed from these, so each one carries enough to
 * be understood alone — never "something changed, go read the account". */

#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub commissioner: Pubkey,
    pub pool_type: u8,
    pub buy_in: u64,
    pub max_members: u16,
    pub start_week: u8,
}

#[event]
pub struct MemberJoined {
    pub pool: Pubkey,
    pub wallet: Pubkey,
    pub sponsored_by: Option<Pubkey>,
    pub paid: u64,
    pub member_count: u16,
}

#[event]
pub struct PickSubmitted {
    pub pool: Pubkey,
    pub wallet: Pubkey,
    pub week: u8,
    pub team: u8,
}

#[event]
pub struct ResultsPosted {
    pub pool: Pubkey,
    pub week: u8,
    pub winners: u32,
    pub pushes: u32,
    pub posted_ts: i64,
}

#[event]
pub struct ResultsVetoed {
    pub pool: Pubkey,
    pub week: u8,
    pub veto_count: u16,
    pub cleared: bool,
}

#[event]
pub struct WeekFinalized {
    pub pool: Pubkey,
    pub week: u8,
    pub winners: u32,
    pub pushes: u32,
}

#[event]
pub struct MemberSettled {
    pub pool: Pubkey,
    pub wallet: Pubkey,
    pub week: u8,
    pub survived: bool,
    pub points: u32,
}

#[event]
pub struct WeekAdvanced {
    pub pool: Pubkey,
    pub week: u8,
    pub alive_count: u16,
}

#[event]
pub struct PoolSettled {
    pub pool: Pubkey,
    pub winners_week: u8,
    pub winners_count: u16,
    pub pot_per_winner: u64,
}

#[event]
pub struct DuesLocked {
    pub pool: Pubkey,
    pub total_dues: u64,
    pub paid_members: u16,
}

#[event]
pub struct PayoutSheetPosted {
    pub pool: Pubkey,
    pub slots: u8,
    pub posted_ts: i64,
}

#[event]
pub struct SheetVetoed {
    pub pool: Pubkey,
    pub veto_count: u16,
    pub cleared: bool,
}

#[event]
pub struct SheetFinalized {
    pub pool: Pubkey,
    pub slots: u8,
}

#[event]
pub struct PrizeClaimed {
    pub pool: Pubkey,
    pub wallet: Pubkey,
    pub slot_idx: u8,
    pub amount: u64,
}

#[event]
pub struct PotClaimed {
    pub pool: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DuesReclaimed {
    pub pool: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
}

#[event]
pub struct FeePaid {
    pub pool: Pubkey,
    pub treasury: Pubkey,
    pub amount: u64,
}

}

pub mod state {
use anchor_lang::prelude::*;

use crate::constants::*;

/* Platform defaults, copied into a pool at creation and never read again.
 *
 * A pool that read fees from Config at CLAIM time would let the admin raise the
 * fee on a pot that was already collected. Copying at creation means the deal a
 * member joined is the deal that pays out, whatever the admin does later. That
 * is the entire reason these fields are duplicated onto Pool. */
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub fee_treasury: Pubkey,
    pub default_fee_bps: u16,
    pub default_fee_cap: u64,
    pub creation_fee: u64,
    pub paused: bool,
    pub bump: u8,
}

/// One payout slot in a league's prize sheet.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default)]
pub struct PrizeSlot {
    pub label: [u8; MAX_SLOT_LABEL],
    pub bps: u16,
    pub assignee: Pubkey,
    /// 0 unassigned · 1 pending (in dispute window) · 2 finalized · 3 claimed
    pub state: u8,
}

/* THE POOL.
 *
 * SIZE, AND A CORRECTION TO THE SPEC. The handoff gives Pool a space of 1280
 * bytes. Adding the field list up gives roughly 1,600 — `results_root:
 * [[u8;32];18]` alone is 576 of them — so a hand-written 1280 would have
 * panicked on the first `create_pool` with an out-of-bounds write, at which
 * point the account is already paid for. `InitSpace` derives the number from
 * the fields, so it cannot drift from them again. Print it with the
 * `pool_space` test.
 *
 * `results_root` is reserved, not used: the Merkle-scored modes (§ engine
 * generalization) verify `(member, points)` against it later. It costs about
 * 0.004 SOL of rent per pool to reserve, which is the price of not migrating
 * every live pool when those modes land. */
#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub commissioner: Pubkey,
    pub usdc_mint: Pubkey,
    pub vault: Pubkey,
    pub nonce: u64,
    pub name: [u8; MAX_NAME],
    pub pool_type: u8,

    pub buy_in: u64,
    pub max_members: u16,
    pub member_count: u16,
    pub paid_members: u16,
    pub total_dues: u64,

    pub alive_count: u16,
    pub alive_at_week_start: u16,
    pub processed_this_week: u16,

    pub start_week: u8,
    pub current_week: u8,
    pub lock_ts: [i64; WEEKS],
    pub dues_deadline_ts: i64,
    pub refund_deadline_ts: i64,
    pub dispute_window_secs: u32,

    /// Committed results, one bitmask per week. Bit N == team N.
    pub winners: [u32; WEEKS],
    pub pushes: [u32; WEEKS],
    pub results_root: [[u8; 32]; WEEKS],
    pub results_posted: [bool; WEEKS],

    pub pending_winners: u32,
    pub pending_pushes: u32,
    pub pending_root: [u8; 32],
    pub pending_week: u8,
    pub pending_posted_ts: i64,
    pub veto_count: u16,
    pub finalized_week: u8,

    pub prize_slots: [PrizeSlot; MAX_PRIZE_SLOTS],
    pub slot_count: u8,
    pub claimed_bps: u16,

    pub status: u8,
    pub winners_week: u8,
    pub winners_count: u16,
    pub pot_per_winner: u64,

    pub weekly_pot_bps: u16,
    pub rollover: u64,

    pub fee_bps: u16,
    pub fee_cap: u64,
    pub fee_treasury: Pubkey,
    pub fee_paid: bool,
    pub refund_per_member: u64,
    pub bump: u8,
}

impl Pool {
    pub fn is_league(&self) -> bool {
        self.pool_type == POOL_LEAGUE
    }

    /// The moment picks lock for a given week (1-indexed).
    pub fn lock_for(&self, week: u8) -> Result<i64> {
        let idx = week
            .checked_sub(1)
            .ok_or(crate::errors::CommishError::BadStartWeek)? as usize;
        require!(idx < WEEKS, crate::errors::CommishError::BadStartWeek);
        Ok(self.lock_ts[idx])
    }

    /// The parts a caller needs to rebuild this pool's signer seeds. The nonce
    /// bytes have to outlive the seeds array, so the caller owns them:
    ///
    /// ```ignore
    /// let (commissioner, nonce, bump) = pool.seed_parts();
    /// let seeds: &[&[u8]] = &[SEED_POOL, commissioner.as_ref(), &nonce, &[bump]];
    /// ```
    pub fn seed_parts(&self) -> (Pubkey, [u8; 8], u8) {
        (self.commissioner, self.nonce.to_le_bytes(), self.bump)
    }
}

/* One per wallet per pool. Holds everything the settle rules need, so settling
 * a member never has to look at another member's account. */
#[account]
#[derive(InitSpace)]
pub struct Member {
    pub pool: Pubkey,
    pub wallet: Pubkey,
    pub display_name: [u8; MAX_DISPLAY_NAME],

    pub paid: bool,
    pub sponsored_by: Pubkey,
    pub joined_ts: i64,

    /// Bit N set == team N already spent this season.
    pub used_mask: u32,
    /// 255 == no pick. Otherwise 0..=31.
    pub current_pick: u8,
    pub pick_mask: u32,
    pub ranks: [u8; 16],
    pub owned_mask: u32,

    pub pick_week: u8,
    pub pick_note: [u8; MAX_NOTE],
    pub points: u32,

    pub processed_week: u8,
    /// 0 == still alive. Otherwise the week they went out.
    pub eliminated_week: u8,
    pub vetoed_week: u8,
    pub claimed: bool,
    pub bump: u8,
}

impl Member {
    pub fn is_alive(&self) -> bool {
        self.eliminated_week == WEEK_NONE
    }

    pub fn has_used(&self, team: u8) -> bool {
        self.used_mask & (1u32 << team) != 0
    }
}

/// Copy a slice into a fixed-size, zero-padded byte field.
pub fn fixed_bytes<const N: usize>(src: &str) -> Result<[u8; N]> {
    let bytes = src.as_bytes();
    require!(bytes.len() <= N, crate::errors::CommishError::NameTooLong);
    let mut out = [0u8; N];
    out[..bytes.len()].copy_from_slice(bytes);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /* THE SPEC SAID 1280. IT IS NOT 1280.
     *
     * The handoff gives Pool a space of 1280 bytes, but its own field list adds
     * up to 1,614 — `results_root: [[u8;32];18]` is 576 of them on its own. A hand-written 1280 would have allocated an account too small for
     * the struct and panicked on the first `create_pool`, after the rent was
     * already paid.
     *
     * `InitSpace` derives the number from the fields, so it cannot drift again.
     * This test pins it: if a field is added, this fails and someone decides
     * deliberately whether the extra rent is worth it, rather than finding out
     * from a failed transaction. */
    #[test]
    fn account_sizes_are_what_we_think() {
        let pool = 8 + Pool::INIT_SPACE;
        let member = 8 + Member::INIT_SPACE;
        let config = 8 + Config::INIT_SPACE;
        println!("Pool = {pool} bytes, Member = {member} bytes, Config = {config} bytes");

        assert_eq!(pool, 1_614, "Pool size changed");
        assert_eq!(member, 200, "Member size changed");
        assert_eq!(config, 92, "Config size changed");

        // System-program CreateAccount via CPI caps at 10,240 bytes. Comfortable,
        // but worth failing loudly the day it stops being.
        assert!(pool < 10_240, "Pool can no longer be created by CPI");
    }
}

}

pub mod rules {
//! The mode kit's one seam.
//!
//! Every game mode shares one escrow, one veto, one deadman refund and one claim
//! path. What a mode actually *is* lives here: given a week's committed results
//! and what a member picked, did they survive?
//!
//! It is a pure function on purpose. The settle instruction reads accounts,
//! writes accounts and emits an event; deciding who is out is the part that must
//! be provable without a validator, so it is testable with `cargo test`.

use crate::constants::*;
use crate::errors::CommishError;
use anchor_lang::prelude::*;

/// What a member did this week, reduced to the three facts any mode needs.
#[derive(Clone, Copy, Debug)]
pub struct Outcome {
    /// Did they submit a pick for THIS week? A missed pick is not a wrong pick.
    pub made_a_pick: bool,
    /// The picked team as a one-bit mask, or 0 when no pick was made.
    pub bit: u32,
    /// Teams that won, one bit each.
    pub winners: u32,
    /// Teams whose game was cancelled or voided.
    pub pushes: u32,
}

impl Outcome {
    pub fn won(&self) -> bool {
        self.bit != 0 && self.winners & self.bit != 0
    }
    pub fn pushed(&self) -> bool {
        self.bit != 0 && self.pushes & self.bit != 0
    }
}

/// Does this member survive the week?
///
/// THE PUSH RULE, which is where these games actually go wrong: a cancelled or
/// no-contest game is not a loss in any mode. The member survives and the team
/// is still consumed — you spent it, the league did not play it. Postponed games
/// are a different thing entirely and are handled by not posting results yet.
pub fn survives(pool_type: u8, o: Outcome) -> Result<bool> {
    // A missed pick is out in every pick mode. No exceptions, no grace: the
    // whole product is that the deadline is real.
    if !o.made_a_pick {
        return match pool_type {
            POOL_SURVIVOR | POOL_LOSER => Ok(false),
            _ => err!(CommishError::ModeNotEnabled),
        };
    }
    match pool_type {
        // Survivor: your team has to win. A push carries you.
        POOL_SURVIVOR => Ok(o.won() || o.pushed()),
        // Loser pool: your team has to NOT win. A push still carries you.
        POOL_LOSER => Ok(!o.won() || o.pushed()),
        _ => err!(CommishError::ModeNotEnabled),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BUF: u32 = 1 << 3; // Buffalo, team index 3
    const KC: u32 = 1 << 15; // Kansas City, team index 15

    fn o(bit: u32, winners: u32, pushes: u32) -> Outcome {
        Outcome { made_a_pick: bit != 0, bit, winners, pushes }
    }

    #[test]
    fn survivor_advances_on_a_win() {
        assert!(survives(POOL_SURVIVOR, o(BUF, BUF | KC, 0)).unwrap());
    }

    #[test]
    fn survivor_is_out_on_a_loss() {
        assert!(!survives(POOL_SURVIVOR, o(BUF, KC, 0)).unwrap());
    }

    #[test]
    fn survivor_survives_a_push() {
        // Buffalo's game was cancelled: not a loss, in either direction.
        assert!(survives(POOL_SURVIVOR, o(BUF, KC, BUF)).unwrap());
    }

    #[test]
    fn a_missed_pick_is_out() {
        let missed = Outcome { made_a_pick: false, bit: 0, winners: BUF, pushes: 0 };
        assert!(!survives(POOL_SURVIVOR, missed).unwrap());
        assert!(!survives(POOL_LOSER, missed).unwrap());
    }

    #[test]
    fn loser_pool_inverts_the_win() {
        // Picked Buffalo, Buffalo won: out in a loser pool.
        assert!(!survives(POOL_LOSER, o(BUF, BUF, 0)).unwrap());
        // Picked Buffalo, Buffalo lost: survive.
        assert!(survives(POOL_LOSER, o(BUF, KC, 0)).unwrap());
    }

    #[test]
    fn loser_pool_survives_a_push_even_when_the_team_won() {
        // A voided game cannot eliminate anyone, in any mode.
        assert!(survives(POOL_LOSER, o(BUF, BUF, BUF)).unwrap());
    }

    #[test]
    fn unshipped_modes_are_refused_not_guessed() {
        for t in [POOL_PICKEM, POOL_CONFIDENCE, POOL_PICK3, POOL_TEAM_DRAFT, POOL_SQUARES, POOL_BRACKET] {
            assert!(survives(t, o(BUF, BUF, 0)).is_err(), "mode {t} must refuse");
        }
    }

    #[test]
    fn every_team_index_round_trips_through_a_mask() {
        for team in 0..TEAM_COUNT {
            let bit = 1u32 << team;
            assert!(survives(POOL_SURVIVOR, o(bit, bit, 0)).unwrap());
            assert!(!survives(POOL_SURVIVOR, o(bit, !bit, 0)).unwrap());
        }
    }
}

}

use constants::*;
use errors::CommishError;
use events::*;
use state::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod commish {
    use super::*;

    // ─────────────────────────────────────────────────────────────────────────
    // Admin. Season 1 runs with every fee at zero; these exist so that fact is
    // visible on chain rather than assumed.
    // ─────────────────────────────────────────────────────────────────────────

    pub fn init_config(
        ctx: Context<InitConfig>,
        fee_bps: u16,
        fee_cap: u64,
        creation_fee: u64,
    ) -> Result<()> {
        require!(fee_bps <= BPS_DENOM, CommishError::BadPrizeSplit);
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.fee_treasury = ctx.accounts.fee_treasury.key();
        c.default_fee_bps = fee_bps;
        c.default_fee_cap = fee_cap;
        c.creation_fee = creation_fee;
        c.paused = false;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        fee_bps: u16,
        fee_cap: u64,
        creation_fee: u64,
        paused: bool,
    ) -> Result<()> {
        require!(fee_bps <= BPS_DENOM, CommishError::BadPrizeSplit);
        let c = &mut ctx.accounts.config;
        c.default_fee_bps = fee_bps;
        c.default_fee_cap = fee_cap;
        c.creation_fee = creation_fee;
        // `paused` blocks pool CREATION only. It can never block a claim or a
        // refund: an admin who could freeze payouts would be a custodian.
        c.paused = paused;
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pool lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    /// Create a pool and its vault.
    ///
    /// The commissioner does NOT get a Member here. If they are playing, the
    /// app calls `join_pool` in the same transaction — one join path, atomic,
    /// and no optional account to reason about.
    pub fn create_pool(
        ctx: Context<CreatePool>,
        nonce: u64,
        name: String,
        pool_type: u8,
        buy_in: u64,
        max_members: u16,
        start_week: u8,
        lock_ts: [i64; WEEKS],
        dues_deadline_ts: i64,
        refund_deadline_ts: i64,
        prize_slots: Vec<PrizeSlotArg>,
        weekly_pot_bps: u16,
        dispute_window_secs: u32,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let cfg = &ctx.accounts.config;

        require!(!cfg.paused, CommishError::Paused);
        require!(pool_type <= POOL_TYPE_MAX, CommishError::BadPoolType);
        require!(mode_enabled(pool_type), CommishError::ModeNotEnabled);
        require_keys_eq!(
            ctx.accounts.usdc_mint.key(),
            CANONICAL_USDC,
            CommishError::WrongMint
        );
        require!(
            (MIN_MEMBERS..=MAX_MEMBERS).contains(&max_members),
            CommishError::PoolFull
        );
        require!(
            (MIN_DISPUTE_WINDOW_SECS..=MAX_DISPUTE_WINDOW_SECS).contains(&dispute_window_secs),
            CommishError::BadDisputeWindow
        );
        require!(weekly_pot_bps <= BPS_DENOM, CommishError::BadPrizeSplit);

        let pool = &mut ctx.accounts.pool;

        if pool_type == POOL_LEAGUE {
            // A league has no pick schedule; it has a dues deadline and a sheet.
            require!(dues_deadline_ts > now, CommishError::DuesDeadlinePassed);
            require!(
                !prize_slots.is_empty() && prize_slots.len() <= MAX_PRIZE_SLOTS,
                CommishError::BadPrizeSplit
            );
            // The sum is enforced HERE, at creation, because a league whose
            // slots add to 90% would lock 10% of everyone's money in the vault
            // with no instruction able to release it.
            let mut total: u32 = 0;
            for (i, s) in prize_slots.iter().enumerate() {
                total = total
                    .checked_add(s.bps as u32)
                    .ok_or(CommishError::MathOverflow)?;
                pool.prize_slots[i] = PrizeSlot {
                    label: fixed_bytes::<MAX_SLOT_LABEL>(&s.label)?,
                    bps: s.bps,
                    assignee: Pubkey::default(),
                    state: SLOT_UNASSIGNED,
                };
            }
            require!(
                total == BPS_DENOM as u32,
                CommishError::SlotsNotSummingTo100
            );
            pool.slot_count = prize_slots.len() as u8;
            pool.dues_deadline_ts = dues_deadline_ts;
            pool.refund_deadline_ts = refund_deadline_ts;
            require!(
                refund_deadline_ts > dues_deadline_ts,
                CommishError::BadRefundDeadline
            );
        } else {
            require!(
                (1..=WEEKS as u8).contains(&start_week),
                CommishError::BadStartWeek
            );
            // Strictly increasing, and the first week this pool plays must not
            // have kicked off yet. A pool created after its own lock would take
            // buy-ins for a week nobody can pick.
            for w in 1..WEEKS {
                require!(lock_ts[w] > lock_ts[w - 1], CommishError::BadSchedule);
            }
            require!(
                lock_ts[start_week as usize - 1] > now,
                CommishError::BadSchedule
            );
            require!(
                refund_deadline_ts > lock_ts[WEEKS - 1],
                CommishError::BadRefundDeadline
            );
            pool.lock_ts = lock_ts;
            pool.dues_deadline_ts = lock_ts[start_week as usize - 1];
            pool.refund_deadline_ts = refund_deadline_ts;
        }

        pool.commissioner = ctx.accounts.commissioner.key();
        pool.usdc_mint = ctx.accounts.usdc_mint.key();
        pool.vault = ctx.accounts.vault.key();
        pool.nonce = nonce;
        pool.name = fixed_bytes::<MAX_NAME>(&name)?;
        pool.pool_type = pool_type;
        pool.buy_in = buy_in;
        pool.max_members = max_members;
        pool.start_week = if pool_type == POOL_LEAGUE { 1 } else { start_week };
        pool.current_week = pool.start_week;
        pool.dispute_window_secs = dispute_window_secs;
        pool.weekly_pot_bps = weekly_pot_bps;
        pool.status = STATUS_OPEN;
        pool.bump = ctx.bumps.pool;

        // Fees are COPIED, not referenced. See the note on Config: the deal a
        // member joins is the deal that pays out. A $0 pool never pays a fee.
        if buy_in == 0 {
            pool.fee_bps = 0;
            pool.fee_cap = 0;
        } else {
            pool.fee_bps = cfg.default_fee_bps;
            pool.fee_cap = cfg.default_fee_cap;
        }
        pool.fee_treasury = cfg.fee_treasury;

        emit!(PoolCreated {
            pool: pool.key(),
            commissioner: pool.commissioner,
            pool_type,
            buy_in,
            max_members,
            start_week: pool.start_week,
        });
        Ok(())
    }

    /// Join a pool, paying your own buy-in.
    pub fn join_pool(ctx: Context<JoinPool>, display_name: String) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let buy_in = ctx.accounts.pool.buy_in;
        check_join_open(&ctx.accounts.pool, now)?;

        init_member(
            &mut ctx.accounts.member,
            ctx.accounts.pool.key(),
            ctx.accounts.wallet.key(),
            None,
            &display_name,
            now,
            ctx.bumps.member,
        )?;

        if buy_in > 0 {
            transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.payer_ata.to_account_info(),
                        to: ctx.accounts.vault.to_account_info(),
                        authority: ctx.accounts.wallet.to_account_info(),
                    },
                ),
                buy_in,
            )?;
        }

        credit_join(&mut ctx.accounts.pool, buy_in)?;
        emit!(MemberJoined {
            pool: ctx.accounts.pool.key(),
            wallet: ctx.accounts.wallet.key(),
            sponsored_by: None,
            paid: buy_in,
            member_count: ctx.accounts.pool.member_count,
        });
        Ok(())
    }

    /// The commissioner covers somebody's seat.
    ///
    /// This is the answer to "my brother-in-law does not have a wallet with
    /// money in it yet". The seat is real, the Member is theirs, and the record
    /// says who paid for it.
    pub fn sponsor_join(
        ctx: Context<SponsorJoin>,
        wallet: Pubkey,
        display_name: String,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let buy_in = ctx.accounts.pool.buy_in;
        check_join_open(&ctx.accounts.pool, now)?;

        init_member(
            &mut ctx.accounts.member,
            ctx.accounts.pool.key(),
            wallet,
            Some(ctx.accounts.commissioner.key()),
            &display_name,
            now,
            ctx.bumps.member,
        )?;

        if buy_in > 0 {
            transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.payer_ata.to_account_info(),
                        to: ctx.accounts.vault.to_account_info(),
                        authority: ctx.accounts.commissioner.to_account_info(),
                    },
                ),
                buy_in,
            )?;
        }

        credit_join(&mut ctx.accounts.pool, buy_in)?;
        emit!(MemberJoined {
            pool: ctx.accounts.pool.key(),
            wallet,
            sponsored_by: Some(ctx.accounts.commissioner.key()),
            paid: buy_in,
            member_count: ctx.accounts.pool.member_count,
        });
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Picks
    // ─────────────────────────────────────────────────────────────────────────

    /// One team, to win, this week.
    pub fn submit_pick(ctx: Context<SubmitPick>, team: u8, note: String) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let pool = &ctx.accounts.pool;
        let member = &mut ctx.accounts.member;

        require!(!pool.is_league(), CommishError::WrongPoolKind);
        require!(pool.status != STATUS_SETTLED, CommishError::AlreadySettled);
        require!(team < TEAM_COUNT, CommishError::InvalidTeam);
        require!(member.is_alive(), CommishError::MemberEliminated);

        // The lock is the product. Everything else about a Survivor pool is
        // administration; this line is why it is on a chain at all.
        let lock = pool.lock_for(pool.current_week)?;
        require!(now < lock, CommishError::PicksLocked);

        require!(!member.has_used(team), CommishError::TeamAlreadyUsed);

        member.current_pick = team;
        member.pick_week = pool.current_week;
        member.pick_note = fixed_bytes::<MAX_NOTE>(&note).map_err(|_| CommishError::NoteTooLong)?;

        emit!(PickSubmitted {
            pool: pool.key(),
            wallet: member.wallet,
            week: pool.current_week,
            team,
        });
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Results: post → dispute → finalize → settle → advance
    // ─────────────────────────────────────────────────────────────────────────

    /// The commissioner proposes a week's results. Nothing settles yet.
    pub fn post_results(
        ctx: Context<PostResults>,
        week: u8,
        winners: u32,
        pushes: u32,
        root: [u8; 32],
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let pool = &mut ctx.accounts.pool;

        require!(!pool.is_league(), CommishError::WrongPoolKind);
        require!(pool.status != STATUS_SETTLED, CommishError::AlreadySettled);
        require_eq!(week, pool.current_week, CommishError::TooEarly);
        require!(pool.pending_week == WEEK_NONE, CommishError::ResultsPending);
        require!(
            !pool.results_posted[week as usize - 1],
            CommishError::ResultsAlreadyPosted
        );
        // A team cannot both win and be voided. Allowing it would make the
        // survive test depend on which branch happened to run first.
        require!(winners & pushes == 0, CommishError::OverlappingMasks);
        // Not before the games could be over.
        require!(
            now >= pool
                .lock_for(week)?
                .checked_add(MIN_POST_DELAY_SECS)
                .ok_or(CommishError::MathOverflow)?,
            CommishError::TooEarly
        );

        pool.pending_winners = winners;
        pool.pending_pushes = pushes;
        pool.pending_root = root;
        pool.pending_week = week;
        pool.pending_posted_ts = now;
        pool.veto_count = 0;
        pool.status = STATUS_RESULTS_POSTED;

        emit!(ResultsPosted {
            pool: pool.key(),
            week,
            winners,
            pushes,
            posted_ts: now,
        });
        Ok(())
    }

    /// A member disputes the pending posting — results or payout sheet.
    ///
    /// One vote per member per posting, and a STRICT majority clears it. The
    /// commissioner then posts again. This is the check on the one piece of
    /// trust the design keeps.
    pub fn veto_results(ctx: Context<VetoResults>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let member = &mut ctx.accounts.member;

        let is_sheet = pool.status == STATUS_SHEET_POSTED;
        require!(
            is_sheet || pool.status == STATUS_RESULTS_POSTED,
            CommishError::NoPendingResults
        );

        // Who gets a vote: everyone still alive in a pick pool, every paid
        // member in a league.
        let (electorate, marker) = if is_sheet {
            require!(member.paid, CommishError::MemberNotPaid);
            (pool.paid_members, u8::MAX)
        } else {
            require!(member.is_alive(), CommishError::MemberEliminated);
            (pool.alive_count, pool.pending_week)
        };
        require!(member.vetoed_week != marker, CommishError::AlreadyVetoed);

        member.vetoed_week = marker;
        pool.veto_count = pool
            .veto_count
            .checked_add(1)
            .ok_or(CommishError::MathOverflow)?;

        let cleared = 2 * (pool.veto_count as u32) > electorate as u32;
        if cleared {
            if is_sheet {
                for i in 0..pool.slot_count as usize {
                    if pool.prize_slots[i].state == SLOT_PENDING {
                        pool.prize_slots[i].state = SLOT_UNASSIGNED;
                        pool.prize_slots[i].assignee = Pubkey::default();
                    }
                }
                pool.status = STATUS_LOCKED;
                emit!(SheetVetoed {
                    pool: pool.key(),
                    veto_count: pool.veto_count,
                    cleared,
                });
            } else {
                let week = pool.pending_week;
                pool.pending_week = WEEK_NONE;
                pool.pending_winners = 0;
                pool.pending_pushes = 0;
                pool.pending_root = [0u8; 32];
                pool.status = STATUS_LOCKED;
                emit!(ResultsVetoed {
                    pool: pool.key(),
                    week,
                    veto_count: pool.veto_count,
                    cleared,
                });
            }
            pool.veto_count = 0;
        } else if is_sheet {
            emit!(SheetVetoed {
                pool: pool.key(),
                veto_count: pool.veto_count,
                cleared,
            });
        } else {
            emit!(ResultsVetoed {
                pool: pool.key(),
                week: pool.pending_week,
                veto_count: pool.veto_count,
                cleared,
            });
        }
        Ok(())
    }

    /// The dispute window closed without a majority. Commit the week.
    ///
    /// Permissionless on purpose: if this needed the commissioner, a
    /// commissioner who lost interest could freeze the pot.
    pub fn finalize_week(ctx: Context<CrankPool>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let pool = &mut ctx.accounts.pool;

        require_eq!(
            pool.status,
            STATUS_RESULTS_POSTED,
            CommishError::NoPendingResults
        );
        require!(
            now >= pool
                .pending_posted_ts
                .checked_add(pool.dispute_window_secs as i64)
                .ok_or(CommishError::MathOverflow)?,
            CommishError::DisputeWindowOpen
        );

        let w = pool.pending_week as usize - 1;
        pool.winners[w] = pool.pending_winners;
        pool.pushes[w] = pool.pending_pushes;
        pool.results_root[w] = pool.pending_root;
        pool.results_posted[w] = true;
        pool.finalized_week = pool.pending_week;

        // Snapshot the electorate BEFORE settling starts: `alive_count` falls as
        // members are settled, and `advance_week` needs to know how many were
        // due to be processed.
        pool.alive_at_week_start = pool.alive_count;
        pool.processed_this_week = 0;

        pool.pending_week = WEEK_NONE;
        pool.veto_count = 0;
        pool.status = STATUS_FINALIZED;

        emit!(WeekFinalized {
            pool: pool.key(),
            week: pool.finalized_week,
            winners: pool.winners[w],
            pushes: pool.pushes[w],
        });
        Ok(())
    }

    /// Apply the finalized week to one member. Anyone may crank it, and running
    /// it twice for the same member and week is refused rather than repeated.
    pub fn settle_member(ctx: Context<SettleMember>, _points: u32) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let member = &mut ctx.accounts.member;

        require_eq!(pool.status, STATUS_FINALIZED, CommishError::NotFinalized);
        let week = pool.finalized_week;
        require!(
            member.processed_week != week,
            CommishError::AlreadyProcessed
        );
        require!(member.is_alive(), CommishError::MemberEliminated);

        let w = week as usize - 1;
        let winners = pool.winners[w];
        let pushes = pool.pushes[w];
        let picked = member.current_pick;
        let made_a_pick = picked != NO_PICK && member.pick_week == week;
        let bit = if made_a_pick { 1u32 << picked } else { 0 };

        /* THE MODE KIT. Every mode that ever ships adds one arm in `rules`, and
         * touches nothing else — not the vault, not the veto, not the refund,
         * not the claim path. An unshipped mode is refused, never half-applied.
         * The rule is a pure function so it can be tested without a validator. */
        let survived = rules::survives(
            pool.pool_type,
            rules::Outcome { made_a_pick, bit, winners, pushes },
        )?;

        if survived {
            // The team is spent only when it carried you through.
            member.used_mask |= bit;
        } else {
            member.eliminated_week = week;
            pool.alive_count = pool.alive_count.saturating_sub(1);
        }

        member.processed_week = week;
        member.current_pick = NO_PICK;
        pool.processed_this_week = pool
            .processed_this_week
            .checked_add(1)
            .ok_or(CommishError::MathOverflow)?;

        emit!(MemberSettled {
            pool: pool.key(),
            wallet: member.wallet,
            week,
            survived,
            points: member.points,
        });
        Ok(())
    }

    /// Close the week: either the pool is decided, or it moves on.
    pub fn advance_week(ctx: Context<AdvanceWeek>) -> Result<()> {
        let vault_amount = ctx.accounts.vault.amount;
        let pool = &mut ctx.accounts.pool;

        require_eq!(pool.status, STATUS_FINALIZED, CommishError::NotFinalized);
        require!(
            pool.processed_this_week >= pool.alive_at_week_start,
            CommishError::WeekIncomplete
        );

        let week = pool.finalized_week;
        let last_week = week as usize >= WEEKS;

        /* Three ways a Survivor pool ends, and the middle one is the case every
         * paper design forgets: EVERYBODY loses in the same week. The pot then
         * belongs to the people who were alive when that week started, not to
         * nobody. `winners_week` records which of the two rules applies. */
        let (settled, winners_week, winners_count) = if pool.alive_count == 0 {
            (true, week, pool.alive_at_week_start)
        } else if pool.alive_count == 1 {
            (true, WEEK_NONE, 1u16)
        } else if last_week {
            (true, WEEK_NONE, pool.alive_count)
        } else {
            (false, WEEK_NONE, 0)
        };

        if settled {
            require!(winners_count > 0, CommishError::NotSettled);
            // The fee is computed once, here, off the vault as it stands, and
            // capped. Season 1 has fee_bps == 0, so this is zero.
            let fee = if pool.fee_bps == 0 {
                0u64
            } else {
                let raw = (vault_amount as u128)
                    .checked_mul(pool.fee_bps as u128)
                    .ok_or(CommishError::MathOverflow)?
                    / BPS_DENOM as u128;
                (raw as u64).min(pool.fee_cap)
            };
            let payable = vault_amount
                .checked_sub(fee)
                .ok_or(CommishError::MathOverflow)?;
            // Integer division. The dust stays in the vault rather than being
            // handed to whoever claims first.
            pool.pot_per_winner = payable / winners_count as u64;
            pool.winners_week = winners_week;
            pool.winners_count = winners_count;
            pool.status = STATUS_SETTLED;

            emit!(PoolSettled {
                pool: pool.key(),
                winners_week,
                winners_count,
                pot_per_winner: pool.pot_per_winner,
            });
        } else {
            pool.current_week = week
                .checked_add(1)
                .ok_or(CommishError::MathOverflow)?;
            pool.status = STATUS_LOCKED;
            emit!(WeekAdvanced {
                pool: pool.key(),
                week: pool.current_week,
                alive_count: pool.alive_count,
            });
        }
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Money out
    // ─────────────────────────────────────────────────────────────────────────

    /// A winner takes their share.
    pub fn claim_pot(ctx: Context<ClaimPot>) -> Result<()> {
        let pool_key = ctx.accounts.pool.key();
        let (commissioner, nonce, bump) = ctx.accounts.pool.seed_parts();
        let pool = &ctx.accounts.pool;
        let member = &ctx.accounts.member;

        require_eq!(pool.status, STATUS_SETTLED, CommishError::NotSettled);
        require!(!member.claimed, CommishError::AlreadyClaimed);

        // Two shapes of winner, decided by how the pool ended.
        let is_winner = if pool.winners_week == WEEK_NONE {
            member.is_alive()
        } else {
            member.eliminated_week == pool.winners_week
        };
        require!(is_winner, CommishError::NotAWinner);

        let amount = pool.pot_per_winner;
        let seeds: &[&[u8]] = &[SEED_POOL, commissioner.as_ref(), &nonce, &[bump]];
        let signer: &[&[&[u8]]] = &[seeds];

        if amount > 0 {
            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.member_ata.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer,
                ),
                amount,
            )?;
        }

        ctx.accounts.member.claimed = true;
        emit!(PotClaimed {
            pool: pool_key,
            wallet: ctx.accounts.member.wallet,
            amount,
        });
        Ok(())
    }

    /// The deadman switch.
    ///
    /// If a pool is never settled — the commissioner vanished, the season fell
    /// apart, anything — every paid member can take their pro-rata share back
    /// after the refund deadline. The first caller fixes the per-member number
    /// so the last one out is not shortchanged by the ones before.
    pub fn reclaim_dues(ctx: Context<ReclaimDues>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let vault_amount = ctx.accounts.vault.amount;
        let pool_key = ctx.accounts.pool.key();
        let (commissioner, nonce, bump) = ctx.accounts.pool.seed_parts();

        {
            let pool = &ctx.accounts.pool;
            require!(pool.status != STATUS_SETTLED, CommishError::AlreadySettled);
            require!(
                now >= pool.refund_deadline_ts,
                CommishError::RefundNotAvailable
            );
            require!(ctx.accounts.member.paid, CommishError::MemberNotPaid);
            require!(!ctx.accounts.member.claimed, CommishError::AlreadyClaimed);
            require!(pool.paid_members > 0, CommishError::NotAMember);
        }

        let pool = &mut ctx.accounts.pool;
        if pool.refund_per_member == 0 {
            pool.refund_per_member = vault_amount / pool.paid_members as u64;
            pool.status = STATUS_ABANDONED;
        }
        let amount = pool.refund_per_member.min(vault_amount);

        let seeds: &[&[u8]] = &[SEED_POOL, commissioner.as_ref(), &nonce, &[bump]];
        let signer: &[&[&[u8]]] = &[seeds];
        if amount > 0 {
            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.member_ata.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer,
                ),
                amount,
            )?;
        }

        ctx.accounts.member.claimed = true;
        emit!(DuesReclaimed {
            pool: pool_key,
            wallet: ctx.accounts.member.wallet,
            amount,
        });
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // League mode (8): dues → sheet → dispute → claim
    // ─────────────────────────────────────────────────────────────────────────

    /// Close joining and fix the prize base.
    ///
    /// Prizes are a share of `total_dues` fixed here, NOT of the live vault
    /// balance. An interim payout would otherwise shrink the base and quietly
    /// change every later slot's value.
    pub fn lock_dues(ctx: Context<CrankPool>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let pool = &mut ctx.accounts.pool;

        require!(pool.is_league(), CommishError::WrongPoolKind);
        require_eq!(pool.status, STATUS_OPEN, CommishError::DuesNotLocked);
        require!(now >= pool.dues_deadline_ts, CommishError::TooEarly);

        pool.status = STATUS_LOCKED;
        emit!(DuesLocked {
            pool: pool.key(),
            total_dues: pool.total_dues,
            paid_members: pool.paid_members,
        });
        Ok(())
    }

    /// The commissioner declares who gets paid what.
    ///
    /// Assignees are passed as `remaining_accounts` — one Member PDA each — and
    /// every one is checked to be a real, paid member of THIS pool. That is what
    /// makes a typo'd address impossible rather than merely unlikely.
    pub fn post_payout_sheet(
        ctx: Context<PostPayoutSheet>,
        assignments: Vec<SlotAssignment>,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let pool_key = ctx.accounts.pool.key();
        let pool = &mut ctx.accounts.pool;

        require!(pool.is_league(), CommishError::WrongPoolKind);
        require_eq!(pool.status, STATUS_LOCKED, CommishError::DuesNotLocked);
        require!(!assignments.is_empty(), CommishError::BadPrizeSplit);
        require_eq!(
            assignments.len(),
            ctx.remaining_accounts.len(),
            CommishError::NotAMember
        );

        for (i, a) in assignments.iter().enumerate() {
            require!(
                (a.slot_idx as usize) < pool.slot_count as usize,
                CommishError::BadPrizeSplit
            );
            let slot = &pool.prize_slots[a.slot_idx as usize];
            require!(
                slot.state == SLOT_UNASSIGNED,
                CommishError::SlotAlreadyAssigned
            );

            // The assignee must be an existing paid member of this pool, proven
            // by their Member PDA, not asserted by the commissioner.
            let info = &ctx.remaining_accounts[i];
            let expected = Pubkey::find_program_address(
                &[SEED_MEMBER, pool_key.as_ref(), a.member.as_ref()],
                &crate::ID,
            )
            .0;
            require_keys_eq!(info.key(), expected, CommishError::NotAMember);
            let data = info.try_borrow_data()?;
            let m = Member::try_deserialize(&mut &data[..])?;
            require_keys_eq!(m.pool, pool_key, CommishError::NotAMember);
            require_keys_eq!(m.wallet, a.member, CommishError::NotAMember);
            require!(m.paid, CommishError::MemberNotPaid);

            let slot = &mut pool.prize_slots[a.slot_idx as usize];
            slot.assignee = a.member;
            slot.state = SLOT_PENDING;
        }

        pool.pending_posted_ts = now;
        pool.veto_count = 0;
        pool.status = STATUS_SHEET_POSTED;

        emit!(PayoutSheetPosted {
            pool: pool_key,
            slots: assignments.len() as u8,
            posted_ts: now,
        });
        Ok(())
    }

    /// The sheet survived its dispute window.
    pub fn finalize_sheet(ctx: Context<CrankPool>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let pool = &mut ctx.accounts.pool;

        require!(pool.is_league(), CommishError::WrongPoolKind);
        require_eq!(
            pool.status,
            STATUS_SHEET_POSTED,
            CommishError::NoPendingSheet
        );
        require!(
            now >= pool
                .pending_posted_ts
                .checked_add(pool.dispute_window_secs as i64)
                .ok_or(CommishError::MathOverflow)?,
            CommishError::DisputeWindowOpen
        );

        let mut n = 0u8;
        for i in 0..pool.slot_count as usize {
            if pool.prize_slots[i].state == SLOT_PENDING {
                pool.prize_slots[i].state = SLOT_FINALIZED;
                n += 1;
            }
        }
        pool.status = STATUS_SHEET_FINALIZED;
        pool.veto_count = 0;

        emit!(SheetFinalized {
            pool: pool.key(),
            slots: n,
        });
        Ok(())
    }

    /// The assignee of a finalized slot takes it.
    pub fn claim_prize(ctx: Context<ClaimPrize>, slot_idx: u8) -> Result<()> {
        let pool_key = ctx.accounts.pool.key();
        let (commissioner, nonce, bump) = ctx.accounts.pool.seed_parts();

        let (amount, bps) = {
            let pool = &ctx.accounts.pool;
            require!(pool.is_league(), CommishError::WrongPoolKind);
            require!(
                (slot_idx as usize) < pool.slot_count as usize,
                CommishError::BadPrizeSplit
            );
            let slot = &pool.prize_slots[slot_idx as usize];
            require!(slot.state == SLOT_FINALIZED, CommishError::SlotNotFinalized);
            require_keys_eq!(
                slot.assignee,
                ctx.accounts.wallet.key(),
                CommishError::NotSlotAssignee
            );
            let amount = (pool.total_dues as u128)
                .checked_mul(slot.bps as u128)
                .ok_or(CommishError::MathOverflow)?
                / BPS_DENOM as u128;
            (amount as u64, slot.bps)
        };

        let seeds: &[&[u8]] = &[SEED_POOL, commissioner.as_ref(), &nonce, &[bump]];
        let signer: &[&[&[u8]]] = &[seeds];
        let payable = amount.min(ctx.accounts.vault.amount);
        if payable > 0 {
            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.wallet_ata.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer,
                ),
                payable,
            )?;
        }

        let pool = &mut ctx.accounts.pool;
        pool.prize_slots[slot_idx as usize].state = SLOT_CLAIMED;
        pool.claimed_bps = pool
            .claimed_bps
            .checked_add(bps)
            .ok_or(CommishError::MathOverflow)?;

        // Every slot paid: the league is done. Otherwise it goes back to Locked
        // so the commissioner can post a sheet for the slots that remain.
        if pool.claimed_bps >= BPS_DENOM {
            pool.status = STATUS_SETTLED;
        } else if pool.prize_slots[..pool.slot_count as usize]
            .iter()
            .all(|s| s.state != SLOT_FINALIZED)
        {
            pool.status = STATUS_LOCKED;
        }

        emit!(PrizeClaimed {
            pool: pool_key,
            wallet: ctx.accounts.wallet.key(),
            slot_idx,
            amount: payable,
        });
        Ok(())
    }

    /// Rent hygiene. Only after this member is done with the pool.
    pub fn close_member(ctx: Context<CloseMember>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let member = &ctx.accounts.member;
        require!(
            pool.status == STATUS_SETTLED || pool.status == STATUS_ABANDONED,
            CommishError::NotSettled
        );
        // Either they took their money or they were never owed any.
        require!(
            member.claimed || !member.paid,
            CommishError::AlreadyClaimed
        );
        Ok(())
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Instruction arguments
// ═════════════════════════════════════════════════════════════════════════════

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PrizeSlotArg {
    pub label: String,
    pub bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SlotAssignment {
    pub slot_idx: u8,
    pub member: Pubkey,
}

// ═════════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═════════════════════════════════════════════════════════════════════════════

fn check_join_open(pool: &Pool, now: i64) -> Result<()> {
    require_eq!(pool.status, STATUS_OPEN, CommishError::JoinClosed);
    require!(
        pool.member_count < pool.max_members,
        CommishError::PoolFull
    );
    if pool.is_league() {
        require!(
            now < pool.dues_deadline_ts,
            CommishError::DuesDeadlinePassed
        );
    } else {
        require!(
            now < pool.lock_for(pool.start_week)?,
            CommishError::JoinClosed
        );
    }
    Ok(())
}

fn init_member(
    member: &mut Account<Member>,
    pool: Pubkey,
    wallet: Pubkey,
    sponsored_by: Option<Pubkey>,
    display_name: &str,
    now: i64,
    bump: u8,
) -> Result<()> {
    member.pool = pool;
    member.wallet = wallet;
    member.display_name = fixed_bytes::<MAX_DISPLAY_NAME>(display_name)?;
    member.paid = true;
    member.sponsored_by = sponsored_by.unwrap_or_default();
    member.joined_ts = now;
    member.used_mask = 0;
    member.current_pick = NO_PICK;
    member.pick_week = WEEK_NONE;
    member.processed_week = WEEK_NONE;
    member.eliminated_week = WEEK_NONE;
    member.vetoed_week = WEEK_NONE;
    member.claimed = false;
    member.bump = bump;
    Ok(())
}

fn credit_join(pool: &mut Account<Pool>, buy_in: u64) -> Result<()> {
    pool.member_count = pool
        .member_count
        .checked_add(1)
        .ok_or(CommishError::MathOverflow)?;
    pool.paid_members = pool
        .paid_members
        .checked_add(1)
        .ok_or(CommishError::MathOverflow)?;
    pool.alive_count = pool
        .alive_count
        .checked_add(1)
        .ok_or(CommishError::MathOverflow)?;
    pool.total_dues = pool
        .total_dues
        .checked_add(buy_in)
        .ok_or(CommishError::MathOverflow)?;
    Ok(())
}

// ═════════════════════════════════════════════════════════════════════════════
// Accounts
// ═════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [SEED_CONFIG],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: recorded as the fee destination; never signed, never read.
    pub fee_treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreatePool<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = commissioner,
        space = 8 + Pool::INIT_SPACE,
        seeds = [SEED_POOL, commissioner.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub commissioner: Signer<'info>,
    pub usdc_mint: Account<'info, Mint>,
    /// The vault IS the pool's associated token account. Deriving it rather
    /// than accepting one closes the "pass in an account you control" hole.
    #[account(
        init,
        payer = commissioner,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct JoinPool<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer = wallet,
        space = 8 + Member::INIT_SPACE,
        seeds = [SEED_MEMBER, pool.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(mut, constraint = payer_ata.mint == pool.usdc_mint @ CommishError::WrongMint)]
    pub payer_ata: Account<'info, TokenAccount>,
    #[account(mut, address = pool.vault @ CommishError::BadVault)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct SponsorJoin<'info> {
    #[account(mut, has_one = commissioner)]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer = commissioner,
        space = 8 + Member::INIT_SPACE,
        seeds = [SEED_MEMBER, pool.key().as_ref(), wallet.as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,
    #[account(mut)]
    pub commissioner: Signer<'info>,
    #[account(mut, constraint = payer_ata.mint == pool.usdc_mint @ CommishError::WrongMint)]
    pub payer_ata: Account<'info, TokenAccount>,
    #[account(mut, address = pool.vault @ CommishError::BadVault)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitPick<'info> {
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [SEED_MEMBER, pool.key().as_ref(), wallet.key().as_ref()],
        bump = member.bump,
        has_one = wallet @ CommishError::NotAMember
    )]
    pub member: Account<'info, Member>,
    pub wallet: Signer<'info>,
}

#[derive(Accounts)]
pub struct PostResults<'info> {
    #[account(mut, has_one = commissioner)]
    pub pool: Account<'info, Pool>,
    pub commissioner: Signer<'info>,
}

#[derive(Accounts)]
pub struct VetoResults<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [SEED_MEMBER, pool.key().as_ref(), wallet.key().as_ref()],
        bump = member.bump,
        has_one = wallet @ CommishError::NotAMember
    )]
    pub member: Account<'info, Member>,
    pub wallet: Signer<'info>,
}

/// Permissionless cranks: anyone may fire them, and nothing about who signs
/// changes what they do.
#[derive(Accounts)]
pub struct CrankPool<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
}

#[derive(Accounts)]
pub struct SettleMember<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [SEED_MEMBER, pool.key().as_ref(), member.wallet.as_ref()],
        bump = member.bump,
        constraint = member.pool == pool.key() @ CommishError::NotAMember
    )]
    pub member: Account<'info, Member>,
}

#[derive(Accounts)]
pub struct AdvanceWeek<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(address = pool.vault @ CommishError::BadVault)]
    pub vault: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct ClaimPot<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [SEED_MEMBER, pool.key().as_ref(), wallet.key().as_ref()],
        bump = member.bump,
        has_one = wallet @ CommishError::NotAMember
    )]
    pub member: Account<'info, Member>,
    pub wallet: Signer<'info>,
    #[account(mut, address = pool.vault @ CommishError::BadVault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = member_ata.owner == wallet.key() @ CommishError::NotAMember,
        constraint = member_ata.mint == pool.usdc_mint @ CommishError::WrongMint
    )]
    pub member_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReclaimDues<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [SEED_MEMBER, pool.key().as_ref(), wallet.key().as_ref()],
        bump = member.bump,
        has_one = wallet @ CommishError::NotAMember
    )]
    pub member: Account<'info, Member>,
    pub wallet: Signer<'info>,
    #[account(mut, address = pool.vault @ CommishError::BadVault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = member_ata.owner == wallet.key() @ CommishError::NotAMember,
        constraint = member_ata.mint == pool.usdc_mint @ CommishError::WrongMint
    )]
    pub member_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct PostPayoutSheet<'info> {
    #[account(mut, has_one = commissioner)]
    pub pool: Account<'info, Pool>,
    pub commissioner: Signer<'info>,
    // Assignee Member PDAs arrive as remaining_accounts, one per assignment.
}

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    pub wallet: Signer<'info>,
    #[account(mut, address = pool.vault @ CommishError::BadVault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = wallet_ata.owner == wallet.key() @ CommishError::NotAMember,
        constraint = wallet_ata.mint == pool.usdc_mint @ CommishError::WrongMint
    )]
    pub wallet_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseMember<'info> {
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        close = wallet,
        seeds = [SEED_MEMBER, pool.key().as_ref(), wallet.key().as_ref()],
        bump = member.bump,
        has_one = wallet @ CommishError::NotAMember
    )]
    pub member: Account<'info, Member>,
    #[account(mut)]
    pub wallet: Signer<'info>,
}
