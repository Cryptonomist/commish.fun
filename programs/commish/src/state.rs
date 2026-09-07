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
    /* DEAD, AND DELIBERATELY STILL HERE.
     *
     * Written by `init_config` and `update_config`, read by nothing. There is
     * no creation fee: `create_pool` never looks at this, so setting it has no
     * effect whatsoever. Same shape as the `fee_paid` bug, a field declared in
     * the first commit and never wired up, and the same tell: grep finds only
     * writes.
     *
     * It stays because removing it is not free. It sits BEFORE `paused` and
     * `bump`, so deleting it shifts both eight bytes earlier and the Config
     * already deployed would misparse, reading a stray byte of this as
     * `paused`. `init_config` uses Anchor's `init`, which refuses an account
     * that exists, and there is no instruction to close one, so the config
     * could not be rebuilt. `create_pool` reads `fee_treasury` from it, so a
     * broken config means no pool can be created at all.
     *
     * Delete it in the next program version that redeploys for another
     * reason and re-initialises the config anyway. There is no such version
     * scheduled: a multisig migration was the obvious candidate and is no
     * longer planned, so this may well outlive the hackathon. Until then a
     * named field that does nothing is a far smaller trap than a bricked
     * config, provided it says so out loud. */
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
    /* Which posting the current votes belong to.
     *
     * `veto_count` is reset when a posting is cleared, but a member's own
     * "I already voted" marker lives on their Member account and cannot be
     * reset from here — there is no list of members to walk. Marking the vote
     * with the *week* therefore locked a member out of every later posting for
     * that same week: veto a false result, watch the commissioner post it again
     * unchanged, and the majority that struck it down is disenfranchised.
     *
     * This counts postings instead, so every re-post is a fresh vote. It starts
     * at 0 and a member's default `vetoed_epoch` is 0, so the first posting
     * increments to 1 before anyone can match it. */
    pub veto_epoch: u16,
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
    /// The `Pool::veto_epoch` this member last voted on. 0 == never voted.
    pub vetoed_epoch: u16,
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

        assert_eq!(pool, 1_616, "Pool size changed");
        assert_eq!(member, 201, "Member size changed");
        assert_eq!(config, 92, "Config size changed");

        // System-program CreateAccount via CPI caps at 10,240 bytes. Comfortable,
        // but worth failing loudly the day it stops being.
        assert!(pool < 10_240, "Pool can no longer be created by CPI");
    }
}
