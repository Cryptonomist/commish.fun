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

/* PLAYOFF BRACKETS, the mode kit's second seam.
 *
 * `survives` answers the question every elimination mode asks. A bracket asks a
 * different one — how many points did this entry just earn — so it gets its own
 * pure function rather than a bool forced to mean something it does not. Both
 * live here for the same reason: deciding who is owed money must be provable
 * with `cargo test` and no validator.
 *
 * A bracket entry is four `u32` masks, one per round, and bit N means seed N.
 * See the note in `constants`: seeds rather than teams is what lets one engine
 * score the NFL playoffs and the College Football Playoff without knowing a
 * single team name.
 */
pub type Bracket = [u32; BRACKET_ROUNDS];

/// Every seed in a field of this size, as a mask. Bit N == seed N.
pub fn seed_field(seeds: u8) -> Result<u32> {
    require!(
        (MIN_BRACKET_SEEDS..=MAX_BRACKET_SEEDS).contains(&seeds),
        CommishError::BadBracketSize
    );
    // seeds <= 16, so this cannot touch the sign bit or overflow.
    Ok((1u32 << seeds) - 1)
}

/// How many teams come out of each round of a field this size.
///
/// The derivation is in `constants`: both formats field eight teams in round
/// two, so round one produces `seeds - 8` winners and the rest is 4, 2, 1.
pub fn bracket_shape(seeds: u8) -> Result<[u32; BRACKET_ROUNDS]> {
    require!(
        (MIN_BRACKET_SEEDS..=MAX_BRACKET_SEEDS).contains(&seeds),
        CommishError::BadBracketSize
    );
    Ok([(seeds - 8) as u32, 4, 2, 1])
}

/// How many teams sit out the first round on a bye.
///
/// Round one plays `2 * (seeds - 8)` teams, so the rest are resting:
/// `seeds - 2 * (seeds - 8)` == `16 - seeds`. Two in the NFL, four in the CFP.
pub fn bracket_byes(seeds: u8) -> Result<u32> {
    require!(
        (MIN_BRACKET_SEEDS..=MAX_BRACKET_SEEDS).contains(&seeds),
        CommishError::BadBracketSize
    );
    Ok((MAX_BRACKET_SEEDS - seeds) as u32)
}

/* Is this a bracket somebody could actually have filled in?
 *
 * Counting alone is not enough. An entry with the right number of picks in
 * every round can still have a team losing in the divisional round and then
 * winning the Super Bowl: the counts are right and the bracket is nonsense. A
 * real bracket NARROWS — whoever you have in the final is someone you had in
 * the semi-final — and that is a subset test.
 *
 * EXCEPT ACROSS THE BYE, which is the trap. Round two is not drawn from round
 * one's winners alone; the teams that sat out the first round join it. So
 * `entry[1]` may legitimately contain seeds absent from `entry[0]`, and a plain
 * subset test there would reject every entry that has a bye team going deep —
 * which in the CFP is most of them, since all four byes could win. What IS true
 * is that only a bye team can appear from nowhere, so at most `16 - seeds` of
 * round two's picks may be new. From round two on there are no byes left and
 * the subset rule is exact.
 *
 * This is a structural check, not a re-derivation of the seeding: the program
 * does not know which seeds hold the byes, because that differs by sport and
 * the program deliberately does not know the sport. An entry that slips through
 * — a low seed treated as a bye — can only cost the person who submitted it,
 * since a team that actually lost in round one never appears in round two's
 * posted winners and so scores nothing.
 *
 * Enforced at entry and never again. Scoring a malformed bracket later would be
 * arithmetic on a lie, and by then the buy-in is already in the vault.
 */
pub fn validate_bracket(entry: Bracket, seeds: u8) -> Result<()> {
    let field = seed_field(seeds)?;
    let shape = bracket_shape(seeds)?;
    let byes = bracket_byes(seeds)?;

    for r in 0..BRACKET_ROUNDS {
        // Only seeds that exist, and exactly as many as the round advances.
        require!(entry[r] & !field == 0, CommishError::BadBracket);
        require!(entry[r].count_ones() == shape[r], CommishError::BadBracket);
    }
    // Round two may introduce bye teams, and no more of them than there are.
    require!(
        (entry[1] & !entry[0]).count_ones() <= byes,
        CommishError::BadBracket
    );
    // After that, nobody advances out of a round they were not in.
    for r in 2..BRACKET_ROUNDS {
        require!(entry[r] & !entry[r - 1] == 0, CommishError::BadBracket);
    }
    Ok(())
}

/* WHAT WINS THE POT: a perfect bracket, and nothing else.
 *
 * The pot rule is not a scoring rule. Every game in the round has to be right,
 * so an entry either carries all the way to the trophy or it is out, and one
 * missed game in the first round ends it as surely as losing the final. That
 * makes this a SURVIVAL question, which is why it returns a bool and lands on
 * the same elimination machinery every pick mode already runs on: a miss sets
 * `eliminated_week`, whoever is still standing after the last round takes the
 * pot, and two perfect entries split it the way two survivors already do.
 *
 * THE CASE THIS DESIGN HAS TO ANSWER OUT LOUD: usually nobody wins. Thirteen
 * NFL games picked at a coin flip is one perfect bracket in 8,192, and picking
 * favourites well still leaves it a long shot. Entries also correlate, because
 * everybody likes the same favourites, so a pool tends to end with several
 * perfect brackets or none at all rather than exactly one.
 *
 * When it is none, the pot must not be paid to the nearly-perfect and must not
 * sit in the vault. It is refunded: `reclaim_dues` splits the vault pro rata
 * after the refund deadline and takes no fee, because the fee is only ever
 * charged by `advance_week` on a pool that actually settled. So a bracket pool
 * pays a jackpot or gives everyone their buy-in back, and there is no third
 * outcome. `advance_week` must therefore NOT apply the Survivor rule that hands
 * the pot to whoever was alive when everybody went out — in a bracket that
 * would pay the nearly-perfect, which is exactly what this mode does not do.
 */
pub fn bracket_survives_round(picks: u32, winners: u32) -> bool {
    picks == winners
}

/// Is this entry still perfect after `posted` rounds have been finalized?
///
/// The live status the site shows while the playoffs run, and the same
/// question the settle crank asks one round at a time.
pub fn bracket_still_perfect(entry: Bracket, winners: Bracket, posted: usize) -> bool {
    let through = posted.min(BRACKET_ROUNDS);
    (0..through).all(|r| bracket_survives_round(entry[r], winners[r]))
}

/* WHO GETS PAID, once the last round is finalized.
 *
 * Two shapes, and which one applies is decided by whether anybody went the
 * whole way:
 *
 *   at least one perfect entry -> they split the entire pot evenly and the
 *                                 ladder is not consulted at all
 *   no perfect entry          -> the ladder pays the top finishers by points
 *
 * A tie is split, in both shapes. Two perfect brackets take half each. Two
 * members tied for second in a 60/30/10 pool split the second and third slots
 * between them, twenty per cent each, which is what every sports payout does
 * with a tie and the only answer that does not need a coin toss on chain.
 *
 * THE SLOT THAT NOBODY FILLS IS THE TRAP HERE, and it has already been walked
 * into once on this program: a league with three prize slots and two payers
 * could not post a sheet, and a slot left unassigned is not lost but IS locked
 * until the refund deadline. A bracket ladder is filled by score rather than by
 * hand, so the same shortfall arrives whenever a pool has fewer members than
 * slots. The last rank group therefore absorbs every slot the pool was too
 * small to reach: three members against a 60/25/10/3/2 ladder pay 60, 25 and
 * 15. The pot leaves the vault in full on the day it settles, which is the
 * whole point of not repeating that bug.
 */

/// What each perfect entry takes. The ladder is not consulted.
///
/// Integer division, so the dust stays in the vault rather than going to
/// whoever claims first. Same rule as `pot_per_winner`.
pub fn perfect_share(payable: u64, perfect_count: u16) -> Result<u64> {
    require!(perfect_count > 0, CommishError::NotSettled);
    Ok(payable / perfect_count as u64)
}

/// The share of the pot one rank group covers, in basis points.
///
/// `taken` is how many slots the groups above it have already used, `size` is
/// how many members are tied on this score, and `last` says this is the lowest
/// scoring group in the pool, which is the one that absorbs any slots the
/// roster never reached. A group starting past the end of the ladder covers
/// nothing, which is how a fourth-place finisher in a three-slot pool is paid
/// zero rather than reverting.
pub fn ladder_group_bps(ladder: &[u16], taken: usize, size: usize, last: bool) -> Result<u32> {
    require!(size > 0, CommishError::BadPrizeSplit);
    let start = taken.min(ladder.len());
    let end = if last {
        ladder.len()
    } else {
        taken.saturating_add(size).min(ladder.len())
    }
    .max(start);
    let mut total: u32 = 0;
    for slot in &ladder[start..end] {
        total = total
            .checked_add(*slot as u32)
            .ok_or(CommishError::MathOverflow)?;
    }
    Ok(total)
}

/// What one member of a rank group is paid, given the share that group covers.
///
/// The division happens once, against the real pot, so a tie splits the money
/// rather than splitting a percentage and rounding twice.
pub fn ladder_member_share(payable: u64, covered_bps: u32, size: usize) -> Result<u64> {
    require!(size > 0, CommishError::BadPrizeSplit);
    require!(covered_bps <= BPS_DENOM as u32, CommishError::BadPrizeSplit);
    let raw = (payable as u128)
        .checked_mul(covered_bps as u128)
        .ok_or(CommishError::MathOverflow)?
        / BPS_DENOM as u128
        / size as u128;
    // covered_bps <= BPS_DENOM and size >= 1, so this is at most `payable`.
    Ok(raw as u64)
}

/* Everything below scores an entry in POINTS, which decides no money at all.
 *
 * It is for the standing the site shows while a bracket pool runs — who is
 * closest, who busted in the first round — and for the day a pool wants a
 * points format instead of a jackpot. The pot is decided by
 * `bracket_survives_round` above and by nothing here. Keeping the two apart is
 * deliberate: a leaderboard that looks like a payout order, in a pool that pays
 * only perfection, is a lie about who is owed money.
 */

/// What one round of an entry just scored.
///
/// A push cannot happen here and is not modelled: a playoff game is played to a
/// winner, however long it takes. If one were ever cancelled outright the week
/// simply is not posted, which is the same answer the weekly modes give.
pub fn bracket_round_points(picks: u32, winners: u32, round: usize) -> Result<u32> {
    require!(round < BRACKET_ROUNDS, CommishError::BadBracket);
    // At most 16 bits can match and the weight is at most 8, so a u32 has room
    // many times over; checked anyway, because this is money arithmetic.
    (picks & winners)
        .count_ones()
        .checked_mul(BRACKET_ROUND_POINTS[round])
        .ok_or(CommishError::MathOverflow.into())
}

/// What a completed entry is worth against a completed set of results.
///
/// Used by the site and the tests to show a standing; the program scores one
/// round at a time as each is finalized, and the two must agree.
pub fn bracket_total(entry: Bracket, winners: Bracket) -> Result<u32> {
    let mut total = 0u32;
    for r in 0..BRACKET_ROUNDS {
        total = total
            .checked_add(bracket_round_points(entry[r], winners[r], r)?)
            .ok_or(CommishError::MathOverflow)?;
    }
    Ok(total)
}

/// The most a perfect entry can score in a field this size.
pub fn bracket_perfect_score(seeds: u8) -> Result<u32> {
    let shape = bracket_shape(seeds)?;
    let mut total = 0u32;
    for r in 0..BRACKET_ROUNDS {
        total = total
            .checked_add(
                shape[r]
                    .checked_mul(BRACKET_ROUND_POINTS[r])
                    .ok_or(CommishError::MathOverflow)?,
            )
            .ok_or(CommishError::MathOverflow)?;
    }
    Ok(total)
}

/// The platform's cut of a settled pool, capped.
///
/// Pulled out of `advance_week` because it is money arithmetic with a cap and
/// an overflow path, and none of that should need a validator to check. The
/// cast back to u64 is safe by construction: `bps <= BPS_DENOM`, so the product
/// over BPS_DENOM can never exceed `vault_amount`.
pub fn platform_fee(vault_amount: u64, fee_bps: u16, fee_cap: u64) -> Result<u64> {
    if fee_bps == 0 {
        return Ok(0);
    }
    let raw = (vault_amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(CommishError::MathOverflow)?
        / BPS_DENOM as u128;
    Ok((raw as u64).min(fee_cap))
}

/// The shortest gap between two weekly locks that still leaves room to post
/// results, wait out the dispute window, and finalize before the next lock.
pub fn min_week_gap(dispute_window_secs: u32) -> Result<i64> {
    MIN_POST_DELAY_SECS
        .checked_add(dispute_window_secs as i64)
        .ok_or(CommishError::MathOverflow.into())
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

    /* Renamed. This was `season_one_takes_no_fee`, which stopped being true the
     * day the default went to 300bps — the assertion is still correct and still
     * worth having, because a zero RATE is what `create_pool` forces onto every
     * league and every pool with no buy-in, and that is the guarantee those
     * pools rest on. */
    #[test]
    fn a_zero_rate_charges_nothing() {
        assert_eq!(platform_fee(20_000_000, 0, 50_000_000).unwrap(), 0);
        // However large the vault, and whatever ceiling is recorded.
        assert_eq!(platform_fee(40_000_000_000, 0, 50_000_000).unwrap(), 0);
    }

    /* THE NUMBERS THAT ARE PUBLISHED, checked here so the pages cannot drift
     * from the program. Terms, Risks, Playing Responsibly and the README all
     * state 3% capped at 50 USDC, with two worked examples and a crossover.
     * If this test fails, four pages are lying. */
    #[test]
    fn the_published_three_percent_is_what_the_program_charges() {
        const BPS: u16 = 300;
        const CAP: u64 = 50_000_000; // 50 USDC
        let usdc = |n: u64| n * 1_000_000;

        // "On a twelve-person pool at 100 USDC the fee is 36 USDC."
        assert_eq!(platform_fee(usdc(1_200), BPS, CAP).unwrap(), usdc(36));

        // "on a fifty-person pool at the same buy-in it is 50 USDC rather
        //  than 150."
        assert_eq!(platform_fee(usdc(5_000), BPS, CAP).unwrap(), usdc(50));

        /* "three per cent until the pot reaches about 1,667 USDC and a flat 50
         * USDC above that." The cap bites at 50/0.03 = 1,666.67, so a pot of
         * 1,666 is still on the percentage and 1,667 is over the line. */
        assert_eq!(platform_fee(usdc(1_666), BPS, CAP).unwrap(), 49_980_000);
        assert_eq!(platform_fee(usdc(1_667), BPS, CAP).unwrap(), CAP);
    }

    #[test]
    fn the_fee_is_a_share_and_then_a_ceiling() {
        // 250bps of 20 USDC, well under the cap.
        assert_eq!(platform_fee(20_000_000, 250, 50_000_000).unwrap(), 500_000);
        // 250bps of 40,000 USDC would be 1,000 USDC; the cap bites first.
        assert_eq!(platform_fee(40_000_000_000, 250, 50_000_000).unwrap(), 50_000_000);
    }

    #[test]
    fn the_fee_can_never_exceed_the_vault() {
        // The cap is the whole point of the min(): a mis-set cap must not let
        // the fee reach past what is actually in the vault.
        for bps in [1u16, 250, 5_000, 10_000] {
            let fee = platform_fee(1_000_000, bps, u64::MAX).unwrap();
            assert!(fee <= 1_000_000, "bps {bps} produced {fee}");
        }
        assert_eq!(platform_fee(0, 10_000, u64::MAX).unwrap(), 0);
    }

    /* The floors are load-bearing, and `fastclock` moves two of them. Both
     * builds pin their own values so the flag cannot drift silently, and the
     * fast build is checked for the one property that makes it a faster program
     * rather than a different one: the floors still exist. */
    #[test]
    fn the_timing_floors_are_what_we_think() {
        #[cfg(not(feature = "fastclock"))]
        {
            assert_eq!(MIN_POST_DELAY_SECS, 3 * 60 * 60);
            assert_eq!(MIN_DISPUTE_WINDOW_SECS, 60 * 60);
        }
        #[cfg(feature = "fastclock")]
        {
            assert_eq!(MIN_POST_DELAY_SECS, 60);
            assert_eq!(MIN_DISPUTE_WINDOW_SECS, 30);
        }
        // Zero would let results be posted in the kickoff's own slot.
        assert!(MIN_POST_DELAY_SECS > 0);
        assert!(MIN_DISPUTE_WINDOW_SECS > 0);
        assert!(MIN_DISPUTE_WINDOW_SECS < MAX_DISPUTE_WINDOW_SECS);
    }

    #[test]
    fn a_week_must_outlast_its_own_dispute_window() {
        // The default 48h window needs 51h between locks. A daily schedule
        // cannot finalize a week before the next one locks.
        #[cfg(not(feature = "fastclock"))]
        assert_eq!(min_week_gap(48 * 60 * 60).unwrap(), 51 * 60 * 60);
        assert!(min_week_gap(48 * 60 * 60).unwrap() > 24 * 60 * 60);

        // And the 7-day maximum window needs longer than a real NFL week, so a
        // pool asking for both is correctly refused rather than sold and stuck.
        let seven_days = 7 * 24 * 60 * 60;
        assert!(min_week_gap(seven_days as u32).unwrap() > seven_days);
    }

    /* PLAYOFF BRACKETS.
     *
     * Two real formats, checked as themselves rather than as abstract numbers,
     * because the whole claim of this engine is that one set of rules scores
     * both. NFL: 14 seeds, two byes. CFP: 12 seeds, four byes.
     */
    const NFL: u8 = 14;
    const CFP: u8 = 12;

    /// Seeds 0..n-1 as a mask, for building entries readably.
    fn m(seeds: &[u8]) -> u32 {
        seeds.iter().fold(0u32, |acc, s| acc | (1u32 << s))
    }

    /// A well-formed NFL entry: the top six advance, then four, then two, then one.
    fn nfl_entry() -> Bracket {
        [
            m(&[0, 1, 2, 3, 4, 5]),
            m(&[0, 1, 2, 3]),
            m(&[0, 1]),
            m(&[0]),
        ]
    }

    /// A well-formed CFP entry where all four bye seeds win their quarter-final,
    /// so round two shares nothing with round one. Legal, and the case a plain
    /// subset rule would have thrown out.
    fn cfp_entry_all_byes_advance() -> Bracket {
        [
            m(&[8, 9, 10, 11]), // the four first-round games
            m(&[0, 1, 2, 3]),   // the four byes all win
            m(&[0, 1]),
            m(&[0]),
        ]
    }

    #[test]
    fn both_formats_have_the_shape_their_sport_actually_plays() {
        assert_eq!(bracket_shape(NFL).unwrap(), [6, 4, 2, 1]);
        assert_eq!(bracket_shape(CFP).unwrap(), [4, 4, 2, 1]);
        assert_eq!(bracket_byes(NFL).unwrap(), 2);
        assert_eq!(bracket_byes(CFP).unwrap(), 4);
    }

    #[test]
    fn a_field_that_has_no_four_round_shape_is_refused() {
        for seeds in [0u8, 1, 8, 17, 32, 255] {
            assert!(bracket_shape(seeds).is_err(), "{seeds} seeds must refuse");
            assert!(seed_field(seeds).is_err(), "{seeds} seeds must refuse");
            assert!(bracket_byes(seeds).is_err(), "{seeds} seeds must refuse");
        }
        // The edges of the supported range are supported.
        assert_eq!(bracket_shape(MIN_BRACKET_SEEDS).unwrap()[0], 1);
        assert_eq!(bracket_shape(MAX_BRACKET_SEEDS).unwrap()[0], 8);
        assert_eq!(bracket_byes(MAX_BRACKET_SEEDS).unwrap(), 0);
    }

    #[test]
    fn the_field_mask_is_exactly_the_seeds_that_exist() {
        assert_eq!(seed_field(NFL).unwrap().count_ones(), 14);
        assert_eq!(seed_field(CFP).unwrap().count_ones(), 12);
        // Seed 12 exists in the NFL field and does not exist in the CFP field.
        assert!(seed_field(NFL).unwrap() & (1 << 12) != 0);
        assert!(seed_field(CFP).unwrap() & (1 << 12) == 0);
    }

    #[test]
    fn a_well_formed_entry_is_accepted_in_both_sports() {
        validate_bracket(nfl_entry(), NFL).unwrap();
        validate_bracket(cfp_entry_all_byes_advance(), CFP).unwrap();
    }

    #[test]
    fn a_round_with_the_wrong_number_of_picks_is_refused() {
        let mut short = nfl_entry();
        short[0] = m(&[0, 1, 2, 3, 4]); // five advance out of the wild card round
        assert!(validate_bracket(short, NFL).is_err());

        let mut two_champions = nfl_entry();
        two_champions[3] = m(&[0, 1]);
        assert!(validate_bracket(two_champions, NFL).is_err());

        // An empty entry is the degenerate version of the same mistake.
        assert!(validate_bracket([0, 0, 0, 0], NFL).is_err());
    }

    /* THE ONE THAT COUNTING ALONE WOULD MISS. A team that loses in the
     * divisional round cannot win the Super Bowl, and an entry saying otherwise
     * is not a bracket. */
    #[test]
    fn a_team_cannot_come_back_from_a_round_it_lost() {
        let mut risen = nfl_entry();
        risen[3] = m(&[2]); // seed 2 is not in the conference round picks
        assert_eq!(risen[3].count_ones(), 1, "still the right count");
        assert!(validate_bracket(risen, NFL).is_err());

        let mut risen_semi = nfl_entry();
        risen_semi[2] = m(&[0, 9]); // seed 9 never made the divisional round
        assert!(validate_bracket(risen_semi, NFL).is_err());
    }

    #[test]
    fn round_two_may_add_bye_teams_but_no_more_than_exist() {
        // The NFL rests two, so two new faces in the divisional round is legal.
        let two_new = [
            m(&[0, 1, 2, 3, 4, 5]),
            m(&[0, 1, 12, 13]),
            m(&[0, 12]),
            m(&[0]),
        ];
        validate_bracket(two_new, NFL).unwrap();

        // Three would mean a third bye the format does not have.
        let three_new = [
            m(&[0, 1, 2, 3, 4, 5]),
            m(&[0, 11, 12, 13]),
            m(&[0, 12]),
            m(&[0]),
        ];
        assert!(validate_bracket(three_new, NFL).is_err());
    }

    #[test]
    fn a_seed_the_field_does_not_have_is_refused() {
        // Seed 12 exists in a 14-team field but not in a 12-team one.
        let mut out_of_field = nfl_entry();
        out_of_field[0] = m(&[0, 1, 2, 3, 4, 12]);
        validate_bracket(out_of_field, NFL).unwrap();
        assert!(validate_bracket(out_of_field, CFP).is_err());
    }

    /* THE POT RULE. Every game in the round, or you are out. */
    #[test]
    fn a_round_carries_an_entry_only_when_every_game_is_right() {
        let picks = m(&[0, 1, 2, 3]);
        assert!(bracket_survives_round(picks, picks));
        // Three of four right is out, the same as none of four.
        assert!(!bracket_survives_round(picks, m(&[0, 1, 2, 9])));
        assert!(!bracket_survives_round(picks, m(&[6, 7, 8, 9])));
        // Extra or missing teams are both wrong, not near enough.
        assert!(!bracket_survives_round(picks, m(&[0, 1, 2])));
        assert!(!bracket_survives_round(picks, m(&[0, 1, 2, 3, 4])));
    }

    #[test]
    fn one_missed_game_in_the_first_round_ends_it() {
        let entry = nfl_entry();
        // Correct in every round except the first.
        let results: Bracket = [m(&[0, 1, 2, 3, 4, 9]), entry[1], entry[2], entry[3]];
        assert!(!bracket_still_perfect(entry, results, 1));
        assert!(!bracket_still_perfect(entry, results, BRACKET_ROUNDS));
        // And that entry still scores well, which is exactly why points do not
        // decide the pot: 5 right in round one plus three perfect rounds.
        assert_eq!(bracket_total(entry, results).unwrap(), 5 + 8 + 8 + 8);
    }

    #[test]
    fn an_entry_is_perfect_until_a_round_says_otherwise() {
        let entry = nfl_entry();
        // Nothing posted yet: nobody has busted.
        assert!(bracket_still_perfect(entry, [0, 0, 0, 0], 0));
        // Two rounds posted and both right.
        let two: Bracket = [entry[0], entry[1], 0, 0];
        assert!(bracket_still_perfect(entry, two, 2));
        // The third round goes wrong.
        let three: Bracket = [entry[0], entry[1], m(&[0, 9]), 0];
        assert!(bracket_still_perfect(entry, three, 2));
        assert!(!bracket_still_perfect(entry, three, 3));
        // Asking past the end of the bracket cannot read off the end.
        assert!(bracket_still_perfect(entry, entry, 99));
    }

    #[test]
    fn only_a_flawless_entry_survives_the_whole_bracket() {
        let entry = nfl_entry();
        assert!(bracket_still_perfect(entry, entry, BRACKET_ROUNDS));
        for r in 0..BRACKET_ROUNDS {
            // Break exactly one round, leave the rest perfect.
            let mut broken = entry;
            broken[r] ^= m(&[0]) | m(&[6]);
            assert!(
                !bracket_still_perfect(entry, broken, BRACKET_ROUNDS),
                "round {r} broken must end the entry"
            );
        }
    }

    /* WHO GETS PAID.
     *
     * `pay_out` walks a whole standings list the way the settle crank will,
     * so a test can assert on the money every member actually receives rather
     * than on one function's return value. Scores go in highest first.
     */
    const LADDER_3: [u16; 3] = [6_000, 3_000, 1_000];
    const LADDER_5: [u16; 5] = [6_000, 2_500, 1_000, 300, 200];

    fn pay_out(scores: &[u32], ladder: &[u16], payable: u64) -> Vec<u64> {
        let perfect = scores.iter().filter(|s| **s == u32::MAX).count() as u16;
        if perfect > 0 {
            let share = perfect_share(payable, perfect).unwrap();
            return scores
                .iter()
                .map(|s| if *s == u32::MAX { share } else { 0 })
                .collect();
        }
        let mut paid = vec![0u64; scores.len()];
        let mut i = 0;
        let mut taken = 0usize;
        while i < scores.len() {
            let mut j = i;
            while j < scores.len() && scores[j] == scores[i] {
                j += 1;
            }
            let size = j - i;
            let last = j == scores.len();
            let bps = ladder_group_bps(ladder, taken, size, last).unwrap();
            let share = ladder_member_share(payable, bps, size).unwrap();
            for slot in paid.iter_mut().take(j).skip(i) {
                *slot = share;
            }
            taken += size;
            i = j;
        }
        paid
    }

    /// A perfect entry is modelled as the top score there is.
    const PERFECT: u32 = u32::MAX;

    #[test]
    fn one_perfect_entry_takes_everything() {
        let paid = pay_out(&[PERFECT, 22, 19, 4], &LADDER_3, 1_000_000);
        assert_eq!(paid, vec![1_000_000, 0, 0, 0]);
    }

    #[test]
    fn two_perfect_entries_split_it_evenly_and_the_ladder_is_ignored() {
        let paid = pay_out(&[PERFECT, PERFECT, 22, 19], &LADDER_3, 1_000_000);
        assert_eq!(paid, vec![500_000, 500_000, 0, 0]);
        // Three of them, and the dust stays in the vault rather than going to
        // whoever claims first.
        let paid = pay_out(&[PERFECT, PERFECT, PERFECT], &LADDER_3, 1_000_000);
        assert_eq!(paid, vec![333_333, 333_333, 333_333]);
        assert_eq!(1_000_000 - paid.iter().sum::<u64>(), 1);
    }

    #[test]
    fn with_nobody_perfect_the_ladder_pays_the_top_finishers() {
        let paid = pay_out(&[26, 22, 19, 12, 4], &LADDER_3, 1_000_000);
        assert_eq!(paid, vec![600_000, 300_000, 100_000, 0, 0]);
        assert_eq!(paid.iter().sum::<u64>(), 1_000_000);
    }

    /* A tie takes the slots it spans and splits them. Two tied for second in a
     * 60/30/10 pool take twenty each, not thirty and ten decided by a coin. */
    #[test]
    fn a_tie_splits_the_slots_it_covers() {
        let paid = pay_out(&[26, 22, 22, 12], &LADDER_3, 1_000_000);
        assert_eq!(paid, vec![600_000, 200_000, 200_000, 0]);
        assert_eq!(paid.iter().sum::<u64>(), 1_000_000);
    }

    #[test]
    fn a_tie_at_the_top_splits_the_top_slots() {
        // Two tied for first take 60 + 30, forty-five each; third still gets 10.
        let paid = pay_out(&[26, 26, 19, 4], &LADDER_3, 1_000_000);
        assert_eq!(paid, vec![450_000, 450_000, 100_000, 0]);
        assert_eq!(paid.iter().sum::<u64>(), 1_000_000);
    }

    #[test]
    fn everybody_tied_splits_the_whole_pot() {
        let paid = pay_out(&[12, 12, 12, 12], &LADDER_3, 1_000_000);
        assert_eq!(paid, vec![250_000; 4]);
        assert_eq!(paid.iter().sum::<u64>(), 1_000_000);
    }

    /* THE BUG A LEAGUE ALREADY WALKED INTO, refused here by construction: a
     * pool with fewer members than slots must still pay its pot out in full on
     * settlement day, not strand the tail until a refund deadline. */
    #[test]
    fn a_pool_smaller_than_its_ladder_still_pays_out_in_full() {
        let paid = pay_out(&[26, 22, 19], &LADDER_5, 1_000_000);
        // 60, 25, and the last finisher absorbing 10 + 3 + 2.
        assert_eq!(paid, vec![600_000, 250_000, 150_000]);
        assert_eq!(paid.iter().sum::<u64>(), 1_000_000);

        // Down to a single member, who takes the lot.
        let paid = pay_out(&[26], &LADDER_5, 1_000_000);
        assert_eq!(paid, vec![1_000_000]);

        // And a short pool whose members are all tied.
        let paid = pay_out(&[7, 7], &LADDER_5, 1_000_000);
        assert_eq!(paid, vec![500_000, 500_000]);
    }

    #[test]
    fn a_finisher_below_the_ladder_is_paid_nothing_rather_than_reverting() {
        let paid = pay_out(&[26, 22, 19, 12, 9, 4], &LADDER_3, 1_000_000);
        assert_eq!(&paid[3..], &[0, 0, 0]);
        assert_eq!(ladder_group_bps(&LADDER_3, 9, 1, false).unwrap(), 0);
        // Even as the last group, once the ladder is used up there is nothing
        // left to absorb.
        assert_eq!(ladder_group_bps(&LADDER_3, 9, 1, true).unwrap(), 0);
    }

    /* THE SAFETY PROPERTY. Whatever the standings, whatever the ties, whatever
     * the ladder, the vault can never be asked for more than it holds. A pool
     * that overpays cannot be fixed after the fact: the last claimant simply
     * finds an empty vault. */
    #[test]
    fn the_pot_can_never_be_overpaid() {
        let ladders: [&[u16]; 4] = [&LADDER_3, &LADDER_5, &[10_000], &[2_500; 4]];
        let standings: [&[u32]; 8] = [
            &[30],
            &[30, 30],
            &[26, 22, 19],
            &[26, 26, 26, 26],
            &[26, 22, 22, 22, 4],
            &[9, 9, 9, 9, 9, 9, 9],
            &[PERFECT, PERFECT, 4],
            &[30, 29, 28, 27, 26, 25, 24, 23, 22, 21],
        ];
        for ladder in ladders {
            for scores in standings {
                for payable in [0u64, 1, 7, 1_000_000, 999_999_999_999] {
                    let paid = pay_out(scores, ladder, payable);
                    let total: u64 = paid.iter().sum();
                    assert!(
                        total <= payable,
                        "ladder {ladder:?} standings {scores:?} payable {payable} paid {total}"
                    );
                    // And never more than the dust behind, so nothing is stranded.
                    assert!(
                        payable - total < scores.len() as u64 + 1,
                        "ladder {ladder:?} standings {scores:?} left {} behind",
                        payable - total
                    );
                }
            }
        }
    }

    #[test]
    fn a_ladder_that_sums_to_a_hundred_pays_a_hundred() {
        for ladder in [&LADDER_3[..], &LADDER_5[..]] {
            assert_eq!(ladder.iter().map(|b| *b as u32).sum::<u32>(), BPS_DENOM as u32);
        }
        // And a group cannot be handed more than the whole pot to divide.
        assert!(ladder_member_share(1_000_000, BPS_DENOM as u32 + 1, 1).is_err());
        assert!(ladder_member_share(1_000_000, 5_000, 0).is_err());
        assert!(perfect_share(1_000_000, 0).is_err());
    }

    #[test]
    fn a_perfect_entry_scores_the_published_number() {
        // 6x1 + 4x2 + 2x4 + 8 = 30, and 4x1 + 4x2 + 2x4 + 8 = 28.
        assert_eq!(bracket_perfect_score(NFL).unwrap(), 30);
        assert_eq!(bracket_perfect_score(CFP).unwrap(), 28);

        let entry = nfl_entry();
        assert_eq!(bracket_total(entry, entry).unwrap(), 30);
        let cfp = cfp_entry_all_byes_advance();
        assert_eq!(bracket_total(cfp, cfp).unwrap(), 28);
    }

    #[test]
    fn an_entry_that_gets_nothing_right_scores_nothing() {
        let entry = nfl_entry();
        let results: Bracket = [
            m(&[6, 7, 8, 9, 10, 11]),
            m(&[6, 7, 8, 9]),
            m(&[6, 7]),
            m(&[6]),
        ];
        assert_eq!(bracket_total(entry, results).unwrap(), 0);
    }

    /* Each round is worth double the last, which is the property that makes the
     * final matter without making the first round decoration. */
    #[test]
    fn a_later_round_is_worth_double_the_one_before() {
        let one_seed = m(&[0]);
        for r in 0..BRACKET_ROUNDS {
            assert_eq!(
                bracket_round_points(one_seed, one_seed, r).unwrap(),
                BRACKET_ROUND_POINTS[r]
            );
        }
        assert_eq!(BRACKET_ROUND_POINTS, [1, 2, 4, 8]);
        // Calling a round that does not exist is refused, not wrapped.
        assert!(bracket_round_points(one_seed, one_seed, BRACKET_ROUNDS).is_err());
    }

    #[test]
    fn a_round_scores_only_the_teams_it_actually_got_right() {
        // Four picked, two of them right, in the round worth two apiece.
        let picks = m(&[0, 1, 2, 3]);
        let winners = m(&[0, 1, 8, 9]);
        assert_eq!(bracket_round_points(picks, winners, 1).unwrap(), 4);
        // A win by a team nobody picked is worth nothing to this entry.
        assert_eq!(bracket_round_points(0, winners, 1).unwrap(), 0);
    }

    /* The site shows a running standing from the whole entry; the program adds
     * one round at a time as each is finalized. If those two ever disagree the
     * leaderboard is lying about who is winning somebody's money. */
    #[test]
    fn scoring_round_by_round_agrees_with_scoring_all_at_once() {
        let entry = nfl_entry();
        let results: Bracket = [
            m(&[0, 1, 2, 9, 10, 11]), // three of six right
            m(&[0, 1, 9, 10]),        // two of four right
            m(&[0, 9]),               // one of two right
            m(&[9]),                  // champion wrong
        ];
        let mut running = 0u32;
        for r in 0..BRACKET_ROUNDS {
            running += bracket_round_points(entry[r], results[r], r).unwrap();
        }
        assert_eq!(running, bracket_total(entry, results).unwrap());
        // 3x1 + 2x2 + 1x4 + 0 = 11.
        assert_eq!(running, 11);
    }

    #[test]
    fn no_entry_can_ever_beat_a_perfect_one() {
        for seeds in MIN_BRACKET_SEEDS..=MAX_BRACKET_SEEDS {
            let shape = bracket_shape(seeds).unwrap();
            let field = seed_field(seeds).unwrap();
            let perfect = bracket_perfect_score(seeds).unwrap();
            // Every seed winning every round is the most any scoring can find.
            let all: Bracket = [field, field, field, field];
            let mut most = 0u32;
            for r in 0..BRACKET_ROUNDS {
                // The results only ever carry `shape[r]` winners.
                let winners = (1u32 << shape[r]) - 1;
                most += bracket_round_points(all[r], winners, r).unwrap();
            }
            assert_eq!(most, perfect, "{seeds} seeds");
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
