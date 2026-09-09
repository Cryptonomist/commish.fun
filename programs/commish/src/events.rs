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

/// The admin named, or replaced, the automated poster.
#[event]
pub struct OracleSet {
    pub poster: Pubkey,
}

/// Emitted alongside ResultsPosted when the oracle, not the commissioner, made
/// the proposal. A separate event rather than a field on ResultsPosted, so the
/// shape an indexer already reads does not change under it.
#[event]
pub struct ResultsPostedByOracle {
    pub pool: Pubkey,
    pub week: u8,
    pub poster: Pubkey,
}

/// The admin named a successor. Nothing changes until that key accepts.
#[event]
pub struct AdminProposed {
    pub admin: Pubkey,
    pub pending: Pubkey,
}

/// The successor accepted. `previous` administers nothing from here on.
#[event]
pub struct AdminAccepted {
    pub previous: Pubkey,
    pub admin: Pubkey,
}

/// The admin withdrew a proposal before it was accepted.
#[event]
pub struct AdminTransferCancelled {
    pub admin: Pubkey,
    pub pending: Pubkey,
}

/// The admin pointed the fee of every FUTURE pool at a new treasury. Pools
/// already created keep the one recorded on them at creation.
#[event]
pub struct FeeTreasurySet {
    pub previous: Pubkey,
    pub treasury: Pubkey,
}
