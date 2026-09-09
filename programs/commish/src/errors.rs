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
    #[msg("That token account is not the pool's fee treasury")]
    BadFeeTreasury,
    #[msg("The platform fee cannot exceed 10%")]
    FeeTooHigh,
    #[msg("Claim what this pool owes you before closing the account")]
    StillOwed,
    #[msg("That is not a usable admin key")]
    BadAdmin,
    #[msg("This pool was abandoned and refunded; nothing else can happen to it")]
    PoolAbandoned,
    #[msg("The vault holds less than this claim, which should not happen, so it was refused")]
    VaultShort,
    #[msg("A fee needs a cap above zero")]
    FeeCapZero,
    #[msg("That is not a usable treasury")]
    BadTreasury,
}
