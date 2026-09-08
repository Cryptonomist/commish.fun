/* WHAT IT COSTS TO GET OFF THE GROUND, as arithmetic.
 *
 * Two currencies are needed here and only one of them is obvious. The buy-in
 * is USDC and the page says so everywhere. The other is SOL, for rent on the
 * accounts a pool creates — and somebody can hold plenty of dollars, connect a
 * funded wallet, and still be unable to create a pool.
 *
 * That is not hypothetical. It happened on this project's own first mainnet
 * pool, with 2.06 USDC and 0.0131 SOL in the wallet, and the error said "Not
 * enough SOL to pay rent for the pool and its vault" — accurate, but only
 * legible if you already knew the number. The wallet page said "About 0.01 SOL
 * covers it comfortably", which was wrong by enough to be the cause.
 *
 * So the numbers live here, in one place, as functions a test can check.
 *
 * WHY A CONSTANT AND NOT getMinimumBalanceForRentExemption. Rent could be
 * fetched exactly, at the cost of an RPC round trip per size on a page that is
 * pure guidance. The figure below was measured against mainnet rather than
 * taken from a formula — the documented DEFAULT_LAMPORTS_PER_BYTE_YEAR of 3480
 * over a two-year threshold gives 6960, and mainnet actually charges 6333:
 *
 *     solana rent 0     -> 0.000810624   =   128 * 6333
 *     solana rent 165   -> 0.001855569   =   293 * 6333
 *     solana rent 209   -> 0.002134221   =   337 * 6333
 *     solana rent 1624  -> 0.011095416   =  1752 * 6333
 *
 * Four sizes, one multiplier, exact to the lamport. Everything this file
 * produces is ADVISORY and rounded up before it reaches a screen, so a change
 * in rent parameters makes the advice slightly generous rather than wrong. The
 * chain remains the authority at signing time.
 */

/** Lamports per byte for rent exemption, measured on mainnet. See above. */
const LAMPORTS_PER_BYTE = 6333;

/** Every account carries 128 bytes of overhead before its own data. */
const ACCOUNT_OVERHEAD = 128;

export const LAMPORTS_PER_SOL = 1_000_000_000;

/* Sizes as the program allocates them. Pool and Member are
 * `8 + T::INIT_SPACE` — eight bytes of Anchor discriminator plus the derived
 * layout — and both are pinned by `account_sizes_are_what_we_think` in
 * state.rs, so they cannot drift here without that test failing there. */
const POOL_BYTES = 8 + 1616;
const MEMBER_BYTES = 8 + 201;
/** An SPL token account is a fixed 165 bytes. The vault is one of these. */
const TOKEN_ACCOUNT_BYTES = 165;

/** Rent-exempt minimum for an account holding `bytes` of data. */
export function rentFor(bytes: number): number {
  return (ACCOUNT_OVERHEAD + bytes) * LAMPORTS_PER_BYTE;
}

/** A wallet is itself an account, and spending it below its own rent-exempt
 *  floor is refused — which is the failure that reads as "insufficient funds"
 *  while the balance still looks sufficient for what you asked to do. */
export const WALLET_FLOOR = rentFor(0);

/** Creating a pool allocates the pool account and its vault. */
export function lamportsToCreate(): number {
  return rentFor(POOL_BYTES) + rentFor(TOKEN_ACCOUNT_BYTES);
}

/** Joining allocates one member account. A joiner who has never held this
 *  token also pays for their own token account, hence the second term. */
export function lamportsToJoin(hasTokenAccount: boolean): number {
  return rentFor(MEMBER_BYTES) + (hasTokenAccount ? 0 : rentFor(TOKEN_ACCOUNT_BYTES));
}

/** Transaction fees. Trivial next to rent, but not zero, and a budget that
 *  lands a wallet exactly on its floor is a budget that fails. */
const FEE_HEADROOM = 20_000;

/**
 * What a wallet needs before it can do `intent`, including the wallet's own
 * rent-exempt floor. Rounded UP to a clean number of thousandths of a SOL,
 * because advice that is exact to the lamport is advice that fails on the
 * next transaction fee.
 */
export function solNeeded(
  intent: "create" | "join",
  hasTokenAccount = false,
): number {
  const raw =
    (intent === "create" ? lamportsToCreate() : lamportsToJoin(hasTokenAccount)) +
    WALLET_FLOOR +
    FEE_HEADROOM;
  const thousandths = Math.ceil((raw / LAMPORTS_PER_SOL) * 1000);
  return thousandths / 1000;
}

export type Shortfall = {
  /** True when the wallet can proceed. */
  ok: boolean;
  needSol: number;
  haveSol: number;
  /** How much more SOL to add, 0 when none is required. */
  addSol: number;
  needUsdc: number;
  haveUsdc: number;
  addUsdc: number;
};

/**
 * Measure a wallet against what it is about to do.
 *
 * Both currencies at once, deliberately. Reporting only the one that happens
 * to be checked first sends somebody to buy USDC when the thing standing in
 * their way is half a cent of SOL.
 */
export function shortfall(args: {
  intent: "create" | "join";
  haveSol: number;
  haveUsdc: number;
  /** The buy-in, in USDC. Creating a pool moves none. */
  buyIn?: number;
  hasTokenAccount?: boolean;
}): Shortfall {
  const needSol = solNeeded(args.intent, args.hasTokenAccount ?? false);
  const needUsdc = args.intent === "join" ? (args.buyIn ?? 0) : 0;

  /* Round the gap up to a cent of SOL and a cent of USDC. Telling somebody to
   * add 0.0007 SOL is telling them to fail again on the next fee. */
  const gap = (need: number, have: number, step: number) =>
    have >= need ? 0 : Math.ceil(((need - have) / step) * 1) * step;

  const addSol = +gap(needSol, args.haveSol, 0.001).toFixed(3);
  const addUsdc = +gap(needUsdc, args.haveUsdc, 0.01).toFixed(2);

  return {
    ok: addSol === 0 && addUsdc === 0,
    needSol,
    haveSol: args.haveSol,
    addSol,
    needUsdc,
    haveUsdc: args.haveUsdc,
    addUsdc,
  };
}
