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
