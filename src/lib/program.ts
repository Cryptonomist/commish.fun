/* The client half of the escrow contract.
 *
 * Every address here is DERIVED, never passed in and never stored. The pool is
 * a PDA of the commissioner and a nonce; the vault is the pool's associated
 * token account; a member is a PDA of the pool and the wallet. That matters
 * more on this side than it looks: if the client could nominate a vault, a
 * phishing page could nominate its own, and the program's guarantee that money
 * only leaves by four named paths would be worth nothing to the person clicking
 * the button. The program re-derives all of it and rejects a mismatch — this
 * module exists so the honest client agrees with it.
 *
 * Instruction data is encoded with Anchor's BorshCoder from the vendored IDL,
 * which is the same path the LiteSVM tests use. Hand-rolling the layout would
 * be one silent field-order bug away from a transaction that means something
 * other than what the form said.
 */

import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { BorshCoder, utils, type Idl } from "@coral-xyz/anchor";
import BN from "bn.js";

import idlJson from "@/idl/commish.json";
import { WEEKS } from "@/lib/schedule";

export const idl = idlJson as unknown as Idl;
export const coder = new BorshCoder(idl);

/* The program id comes from the IDL that was built alongside the program, so
 * the client cannot drift from the binary it is talking to. The env var is an
 * override for pointing a preview build at a different deployment. */
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ??
    (idlJson as { address?: string }).address ??
    "11111111111111111111111111111111",
);

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/* USDC IS PINNED PER CLUSTER, AND THE TWO HALVES MUST AGREE. The program
 * compiles in one mint — mainnet's by default, devnet's with `--features
 * devnet` — and rejects any other at creation. If this constant and the build
 * disagree, every create_pool fails with WrongMint and the error will look like
 * a wallet problem. Set NEXT_PUBLIC_USDC_MINT on any deployment pointed at a
 * devnet build. */
export const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ?? MAINNET_USDC,
);

export const POOL_SURVIVOR = 0;
export const POOL_LOSER = 1;
export const POOL_LEAGUE = 8;

export const MAX_NAME = 32;
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 500;

const enc = new TextEncoder();

export function configPda(): PublicKey {
  return PublicKey.findProgramAddressSync([enc.encode("config")], PROGRAM_ID)[0];
}

export function poolPda(commissioner: PublicKey, nonce: bigint): PublicKey {
  const le = new Uint8Array(8);
  new DataView(le.buffer).setBigUint64(0, nonce, true);
  return PublicKey.findProgramAddressSync(
    [enc.encode("pool"), commissioner.toBytes(), le],
    PROGRAM_ID,
  )[0];
}

export function memberPda(pool: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc.encode("member"), pool.toBytes(), wallet.toBytes()],
    PROGRAM_ID,
  )[0];
}

/** The associated token account for an owner and mint. Derived, never guessed. */
export function ataFor(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/** A fresh pool nonce. Random rather than sequential so two commissioners
 *  creating pools at the same moment cannot collide on a PDA. */
export function randomNonce(): bigint {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  // Clear the top bit: the program takes a u64 but BN/i64 round-trips through
  // the IDL are friendlier well inside 2^63.
  b[7] &= 0x7f;
  return new DataView(b.buffer).getBigUint64(0, true);
}

export type CreatePoolArgs = {
  commissioner: PublicKey;
  nonce: bigint;
  name: string;
  poolType: number;
  /** USDC base units — 6 decimals. Never a float. */
  buyIn: bigint;
  maxMembers: number;
  startWeek: number;
  /** Eighteen unix-second locks. */
  lockTs: number[];
  refundDeadlineTs: number;
  disputeWindowSecs: number;
};

export type CreatePoolPlan = {
  instruction: TransactionInstruction;
  pool: PublicKey;
  vault: PublicKey;
  config: PublicKey;
};

export function buildCreatePool(args: CreatePoolArgs): CreatePoolPlan {
  if (args.lockTs.length !== WEEKS) {
    throw new Error(`lockTs must have ${WEEKS} entries`);
  }
  if (enc.encode(args.name).length > MAX_NAME) {
    throw new Error(`Pool name is longer than ${MAX_NAME} bytes`);
  }

  const config = configPda();
  const pool = poolPda(args.commissioner, args.nonce);
  const vault = ataFor(pool, USDC_MINT);

  const data = coder.instruction.encode("create_pool", {
    nonce: new BN(args.nonce.toString()),
    name: args.name,
    pool_type: args.poolType,
    buy_in: new BN(args.buyIn.toString()),
    max_members: args.maxMembers,
    start_week: args.startWeek,
    lock_ts: args.lockTs.map((t) => new BN(t)),
    // Ignored for pick pools: the program sets it to the starting week's lock.
    dues_deadline_ts: new BN(0),
    refund_deadline_ts: new BN(args.refundDeadlineTs),
    prize_slots: [],
    weekly_pot_bps: 0,
    dispute_window_secs: args.disputeWindowSecs,
  });

  /* Account order is part of the interface. It matches `CreatePool` in
   * programs/commish/src/lib.rs exactly; a reordering here is not a type error
   * anywhere, it is a runtime failure at best and the wrong account at worst. */
  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: args.commissioner, isSigner: true, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  return { instruction, pool, vault, config };
}

export const MAX_DISPLAY_NAME = 24;

/* Pool status, as the program writes it. Only the ones the UI reads are named;
 * the rest are league states this app does not surface yet. */
export const STATUS_OPEN = 0;
export const STATUS_LOCKED = 1;
export const STATUS_RESULTS_POSTED = 2;
export const STATUS_FINALIZED = 3;
export const STATUS_SETTLED = 4;
export const STATUS_ABANDONED = 5;

/** A pool, decoded, with the raw account's snake_case flattened into something
 *  a component can read without knowing Borsh. */
export type PoolView = {
  commissioner: PublicKey;
  usdcMint: PublicKey;
  vault: PublicKey;
  name: string;
  poolType: number;
  buyIn: bigint;
  maxMembers: number;
  memberCount: number;
  paidMembers: number;
  aliveCount: number;
  totalDues: bigint;
  status: number;
  currentWeek: number;
  duesDeadlineTs: number;
  /** Eighteen unix-second locks, as stored. Index 0 is week 1. */
  lockTs: number[];

  /** How long members get to dispute a posting, in seconds. */
  disputeWindowSecs: number;
  /** The week awaiting a dispute window, or WEEK_NONE when nothing is pending. */
  pendingWeek: number;
  /** Proposed results, one bit per team. Only meaningful while a week pends. */
  pendingWinners: number;
  pendingPushes: number;
  /** When the pending results were posted. The window runs from here. */
  pendingPostedTs: number;
  /** Votes against the pending posting. Reset to 0 when a posting is cleared. */
  vetoCount: number;
  /** Which posting the votes belong to. Counts postings, never weeks. */
  vetoEpoch: number;
  /** The last week committed by finalize_week, or WEEK_NONE. */
  finalizedWeek: number;
  /** How many members were alive when the week was finalized, snapshotted
   *  there because `aliveCount` falls as members are settled. `advance_week`
   *  refuses until `processedThisWeek` reaches it. */
  aliveAtWeekStart: number;
  processedThisWeek: number;
  /** Owner of the token account `advance_week` pays the platform fee to. */
  feeTreasury: PublicKey;
  /** Written once the pool settles. `winnersWeek` is WEEK_NONE when survivors
   *  won outright, or the week everybody went out together. */
  winnersWeek: number;
  winnersCount: number;
  potPerWinner: bigint;
};

/* Fixed-size name fields are zero-padded on chain. Trimming at the first NUL
 * rather than trimming whitespace matters: a name can legitimately end in a
 * space, and `String::from_utf8` on the padded bytes yields trailing NULs that
 * render as boxes. */
function fromFixedBytes(bytes: number[] | Uint8Array): string {
  const arr = Array.from(bytes);
  const end = arr.indexOf(0);
  return new TextDecoder().decode(
    Uint8Array.from(end === -1 ? arr : arr.slice(0, end)),
  );
}

export function decodePool(data: Uint8Array): PoolView {
  const raw = coder.accounts.decode("Pool", Buffer.from(data)) as Record<
    string,
    { toString(): string }
  >;
  const num = (k: string) => Number(raw[k]);
  const big = (k: string) => BigInt(raw[k].toString());
  return {
    commissioner: raw.commissioner as unknown as PublicKey,
    usdcMint: raw.usdc_mint as unknown as PublicKey,
    vault: raw.vault as unknown as PublicKey,
    name: fromFixedBytes(raw.name as unknown as number[]),
    poolType: num("pool_type"),
    buyIn: big("buy_in"),
    maxMembers: num("max_members"),
    memberCount: num("member_count"),
    paidMembers: num("paid_members"),
    aliveCount: num("alive_count"),
    totalDues: big("total_dues"),
    status: num("status"),
    currentWeek: num("current_week"),
    duesDeadlineTs: num("dues_deadline_ts"),
    lockTs: (raw.lock_ts as unknown as { toString(): string }[]).map((t) =>
      Number(t.toString()),
    ),
    disputeWindowSecs: num("dispute_window_secs"),
    pendingWeek: num("pending_week"),
    pendingWinners: num("pending_winners"),
    pendingPushes: num("pending_pushes"),
    pendingPostedTs: num("pending_posted_ts"),
    vetoCount: num("veto_count"),
    vetoEpoch: num("veto_epoch"),
    finalizedWeek: num("finalized_week"),
    aliveAtWeekStart: num("alive_at_week_start"),
    processedThisWeek: num("processed_this_week"),
    feeTreasury: raw.fee_treasury as unknown as PublicKey,
    winnersWeek: num("winners_week"),
    winnersCount: num("winners_count"),
    potPerWinner: big("pot_per_winner"),
  };
}

/* Create the caller's USDC account if they have never held USDC.
 *
 * `join_pool` takes `payer_ata` as a typed TokenAccount, so it must already
 * exist — a first-time member would otherwise be refused by account
 * deserialization before any of the program's own checks ran, with an error
 * that says nothing about what to do. Prepending this makes joining work on the
 * first try; `CreateIdempotent` (instruction 1) is a no-op when the account is
 * already there, so it costs nothing for everybody else. */
export function createAtaIdempotentIx(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ataFor(owner, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

export type JoinPoolArgs = {
  pool: PublicKey;
  wallet: PublicKey;
  displayName: string;
};

export type JoinPoolPlan = {
  instruction: TransactionInstruction;
  member: PublicKey;
  payerAta: PublicKey;
  vault: PublicKey;
};

/* Joining is the only instruction a member calls that moves their own money in.
 * Everything it touches is derived: the member account from the pool and the
 * wallet, the payer's token account from the wallet and the mint, the vault
 * from the pool. Nothing here is a value the page picked. */
export function buildJoinPool(args: JoinPoolArgs): JoinPoolPlan {
  if (enc.encode(args.displayName).length > MAX_DISPLAY_NAME) {
    throw new Error(`Display name is longer than ${MAX_DISPLAY_NAME} bytes`);
  }

  const member = memberPda(args.pool, args.wallet);
  const payerAta = ataFor(args.wallet, USDC_MINT);
  const vault = ataFor(args.pool, USDC_MINT);

  const data = coder.instruction.encode("join_pool", {
    display_name: args.displayName,
  });

  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.pool, isSigner: false, isWritable: true },
      { pubkey: member, isSigner: false, isWritable: true },
      { pubkey: args.wallet, isSigner: true, isWritable: true },
      { pubkey: payerAta, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return { instruction, member, payerAta, vault };
}

export const NO_PICK = 255;
export const WEEK_NONE = 0;
export const TEAM_COUNT = 32;
export const MAX_NOTE = 24;

/** A member, decoded. `usedMask` is the on-chain u32: bit N means team N is
 *  spent for the season and can never be picked again. */
export type MemberView = {
  wallet: PublicKey;
  displayName: string;
  paid: boolean;
  usedMask: number;
  currentPick: number;
  pickWeek: number;
  /** The last week `settle_member` applied to this member. A second call for
   *  the same week is refused, which is what makes the crank re-runnable. */
  processedWeek: number;
  eliminatedWeek: number;
  /** The Pool::veto_epoch this member last voted on. 0 == never voted. */
  vetoedEpoch: number;
  claimed: boolean;
};

export function decodeMember(data: Uint8Array): MemberView {
  const raw = coder.accounts.decode("Member", Buffer.from(data)) as Record<
    string,
    { toString(): string }
  >;
  return {
    wallet: raw.wallet as unknown as PublicKey,
    displayName: fromFixedBytes(raw.display_name as unknown as number[]),
    paid: raw.paid as unknown as boolean,
    usedMask: Number(raw.used_mask),
    currentPick: Number(raw.current_pick),
    pickWeek: Number(raw.pick_week),
    processedWeek: Number(raw.processed_week),
    eliminatedWeek: Number(raw.eliminated_week),
    vetoedEpoch: Number(raw.vetoed_epoch),
    claimed: raw.claimed as unknown as boolean,
  };
}

/** Is this member still in? 0 is the sentinel for "never eliminated". */
export const isAlive = (m: MemberView) => m.eliminatedWeek === WEEK_NONE;

/** Has this member already spent that team? Mirrors `Member::has_used`. */
export const hasUsed = (usedMask: number, team: number) =>
  (usedMask & (1 << team)) !== 0;

export type SubmitPickArgs = {
  pool: PublicKey;
  wallet: PublicKey;
  team: number;
  note?: string;
};

/* A pick is the only instruction in the program that moves no money, and it is
 * still the one that decides who gets it all. `pool` is read-only here — the
 * pick lives entirely on the member's own account, which is why two people
 * picking at the same moment never contend. */
export function buildSubmitPick(args: SubmitPickArgs): TransactionInstruction {
  if (!Number.isInteger(args.team) || args.team < 0 || args.team >= TEAM_COUNT) {
    throw new Error(`Team ${args.team} is not 0..${TEAM_COUNT - 1}`);
  }
  const note = args.note ?? "";
  if (enc.encode(note).length > MAX_NOTE) {
    throw new Error(`Note is longer than ${MAX_NOTE} bytes`);
  }

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.pool, isSigner: false, isWritable: false },
      { pubkey: memberPda(args.pool, args.wallet), isSigner: false, isWritable: true },
      { pubkey: args.wallet, isSigner: true, isWritable: false },
    ],
    data: coder.instruction.encode("submit_pick", { team: args.team, note }),
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Results: post → dispute → finalize
 * ────────────────────────────────────────────────────────────────────────── */

/* TEAM MASKS ARE UNSIGNED, AND JAVASCRIPT'S BITWISE OPERATORS ARE NOT.
 *
 * `winners` and `pushes` are u32 on chain, one bit per team. Every bitwise
 * operator in JS coerces to a SIGNED 32-bit integer first, so `1 << 31` — which
 * is Washington, team 31 — is -2147483648, and Borsh will not encode a negative
 * number as a u32. The bug only appears in weeks where WAS is involved, which
 * is exactly the kind of thing that ships. Every mask leaves this module
 * through `>>> 0`, the one operator that yields unsigned.
 */
export const teamBit = (team: number): number => (1 << team) >>> 0;

export const maskHas = (mask: number, team: number): boolean =>
  (mask & teamBit(team)) !== 0;

export const maskWith = (mask: number, team: number): number =>
  (mask | teamBit(team)) >>> 0;

export const maskWithout = (mask: number, team: number): number =>
  (mask & ~teamBit(team)) >>> 0;

export function maskToTeams(mask: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < TEAM_COUNT; t++) if (maskHas(mask, t)) out.push(t);
  return out;
}

export const maskCount = (mask: number): number => maskToTeams(mask).length;

export type PostResultsArgs = {
  pool: PublicKey;
  commissioner: PublicKey;
  /** Must equal the pool's current week. The program refuses anything else. */
  week: number;
  winners: number;
  pushes: number;
};

/* The commissioner proposes a week. Nothing settles here and no money moves —
 * this only starts the dispute window, which is the point: the one piece of
 * trust the design keeps is bounded by a vote the members can win.
 *
 * `root` is the reserved Merkle field. The program stores it and never reads
 * it, so it goes out as 32 zero bytes exactly as the LiteSVM suite sends it.
 */
export function buildPostResults(args: PostResultsArgs): TransactionInstruction {
  const winners = args.winners >>> 0;
  const pushes = args.pushes >>> 0;
  /* The program refuses this with OverlappingMasks, and it is worth refusing
   * here too: a team that both won and pushed would make the survive test
   * depend on which branch ran first. */
  if ((winners & pushes) !== 0) {
    throw new Error("A team cannot be both a winner and a push");
  }

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.pool, isSigner: false, isWritable: true },
      { pubkey: args.commissioner, isSigner: true, isWritable: true },
    ],
    data: coder.instruction.encode("post_results", {
      week: args.week,
      winners,
      pushes,
      root: Array(32).fill(0),
    }),
  });
}

/* One member strikes at the pending posting. A STRICT majority clears it and
 * the commissioner has to post again. */
export function buildVetoResults(args: {
  pool: PublicKey;
  wallet: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.pool, isSigner: false, isWritable: true },
      { pubkey: memberPda(args.pool, args.wallet), isSigner: false, isWritable: true },
      { pubkey: args.wallet, isSigner: true, isWritable: true },
    ],
    data: coder.instruction.encode("veto_results", {}),
  });
}

/* DOES THIS POSTING CARRY THIS PICK? A mirror of `rules::survives`.
 *
 * The same liability as `lib/schedule.ts`: this duplicates a rule that lives in
 * the program, and if `rules.rs` gains an arm this file is quietly wrong. It
 * earns the risk because it is what makes the dispute window mean anything to a
 * member. "Week 3 is posted" is a notification; "week 3 as posted puts you out"
 * is the sentence that decides whether somebody checks the scoreboard.
 *
 * Nothing here gates a transaction. The program decides who is out in
 * `settle_member`, and this only tells a member what to expect.
 */
export function survivesPosting(
  poolType: number,
  opts: { madeAPick: boolean; team: number; winners: number; pushes: number },
): boolean | null {
  // A missed pick is out in every pick mode. No exceptions and no grace.
  if (!opts.madeAPick) return false;
  const won = maskHas(opts.winners, opts.team);
  const pushed = maskHas(opts.pushes, opts.team);
  if (poolType === POOL_SURVIVOR) return won || pushed;
  // Loser pool: your team has to NOT win. A push still carries you.
  if (poolType === POOL_LOSER) return !won || pushed;
  // A mode this client does not model. Say nothing rather than guess.
  return null;
}

/** The smallest number of votes that clears a posting. The program tests
 *  `2 * veto_count > electorate`, so this is a strict majority: three of five,
 *  and three of four. */
export const vetoThreshold = (electorate: number): number =>
  Math.floor(electorate / 2) + 1;

/* HAS THIS MEMBER ALREADY VOTED ON *THIS POSTING*?
 *
 * Keyed on the epoch, never on the week. The marker used to be the week number,
 * which meant a commissioner who got vetoed could re-post the identical results
 * and every member who struck them down the first time was refused with
 * AlreadyVetoed — one abstainer in a four-member pool was enough to make the
 * majority unreachable on the second attempt. `veto_epoch` counts postings, so
 * a re-post is a fresh vote. Comparing `pendingWeek` here would put the bug
 * back in the UI even though the program no longer has it.
 *
 * Only meaningful while a posting is pending: with nothing posted, a member who
 * has never voted (`vetoedEpoch === 0`) matches a pool that has never posted
 * (`vetoEpoch === 0`). Callers check the status first, as the program does.
 */
export const hasVetoedPosting = (member: MemberView, pool: PoolView): boolean =>
  member.vetoedEpoch === pool.vetoEpoch;

/* ─────────────────────────────────────────────────────────────────────────────
 * Running the week: finalize → settle every member → advance
 * ────────────────────────────────────────────────────────────────────────── */

/* ALL THREE ARE PERMISSIONLESS, AND THAT IS THE POINT. None of them takes a
 * signer: the transaction needs a fee payer and nothing else. A crank that
 * required the commissioner would let a commissioner who lost interest freeze
 * the pot after the buy-ins were collected, which is the exact failure the
 * escrow exists to remove. Any wallet can run the week. */

export function buildFinalizeWeek(pool: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [{ pubkey: pool, isSigner: false, isWritable: true }],
    data: coder.instruction.encode("finalize_week", {}),
  });
}

/* One member, one call, idempotent: a second call for the same week is refused
 * rather than repeated. `_points` is reserved for the scored modes and ignored
 * by Survivor and Loser, so it goes out as zero, as the tests send it. */
export function buildSettleMember(
  pool: PublicKey,
  member: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: member, isSigner: false, isWritable: true },
    ],
    data: coder.instruction.encode("settle_member", { _points: 0 }),
  });
}

/* THE FEE TREASURY TOKEN ACCOUNT IS REQUIRED EVEN WHEN THE FEE IS ZERO.
 *
 * Anchor's account list is static, so `advance_week` names it on every call,
 * including the ones that only roll the week forward. Season 1 runs at
 * `fee_bps == 0` and transfers nothing, but the account is still deserialized:
 * if it does not exist, the instruction fails before any of the program's own
 * checks run, with an error that says nothing about treasuries. Callers should
 * check it exists first and say so plainly. */
export function buildAdvanceWeek(args: {
  pool: PublicKey;
  vault: PublicKey;
  feeTreasuryAta: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.pool, isSigner: false, isWritable: true },
      { pubkey: args.vault, isSigner: false, isWritable: true },
      { pubkey: args.feeTreasuryAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: coder.instruction.encode("advance_week", {}),
  });
}

/* Finding every member of a pool.
 *
 * The discriminator comes out of the IDL rather than being pasted in, and the
 * pool is matched at offset 8 because `Member` opens with `pool: Pubkey` right
 * after it. Filtering on a hardcoded account SIZE would have been the other
 * option and is worse: `Member` grew from 200 bytes to 201 when `vetoed_epoch`
 * was added, and a stale size filter does not error, it silently returns no
 * members at all — which would look like a week with nobody left to settle. */
const MEMBER_DISCRIMINATOR = (
  idlJson as { accounts?: { name: string; discriminator: number[] }[] }
).accounts?.find((a) => a.name === "Member")?.discriminator;

export function memberAccountFilters(pool: PublicKey) {
  if (!MEMBER_DISCRIMINATOR) {
    throw new Error("The vendored IDL has no Member account discriminator");
  }
  return [
    {
      memcmp: {
        offset: 0,
        bytes: utils.bytes.bs58.encode(Buffer.from(MEMBER_DISCRIMINATOR)),
      },
    },
    { memcmp: { offset: 8, bytes: pool.toBase58() } },
  ];
}

/** A member account as `getProgramAccounts` returns it, decoded. */
export type MemberEntry = { address: PublicKey; member: MemberView };

/** Who still has to be settled for the finalized week.
 *
 * `settle_member` refuses an already-processed member and refuses a dead one,
 * so this is exactly the set that will succeed. A member eliminated by THIS
 * week's settling has `processedWeek === week` and drops out of the list on the
 * next read, which is what makes re-running the crank safe. */
export function pendingSettles(
  entries: MemberEntry[],
  finalizedWeek: number,
): MemberEntry[] {
  return entries.filter(
    (e) => isAlive(e.member) && e.member.processedWeek !== finalizedWeek,
  );
}

/* How many settles fit in one transaction.
 *
 * Each adds one writable account (32 bytes in the account table) and about 17
 * bytes of instruction, against a 1232-byte packet: roughly `198 + 49n`, so
 * twenty-one would fit. Twelve leaves room for a fee payer that is also a
 * member, and for the day this arithmetic is wrong. */
export const SETTLES_PER_TX = 12;

/* ─────────────────────────────────────────────────────────────────────────────
 * Money out: a winner takes their share
 * ────────────────────────────────────────────────────────────────────────── */

/* TWO SHAPES OF WINNER, AND THE SECOND ONE IS THE INTERESTING ONE. A mirror of
 * the test inside `claim_pot`.
 *
 * `winnersWeek == WEEK_NONE` is the ordinary ending: somebody was still
 * standing, and being alive is the whole qualification. Otherwise everybody
 * went out in the same week, and the pot belongs to the people who were alive
 * when THAT week started, which on their accounts reads as having been
 * eliminated in exactly that week. Somebody knocked out in week four does not
 * share in a week-nine wipeout.
 *
 * Same liability as `survivesPosting`: this duplicates a rule that lives in the
 * program, and nothing here gates a transaction. The program decides; this only
 * decides whether to offer somebody a button.
 */
export const isPotWinner = (pool: PoolView, member: MemberView): boolean =>
  pool.winnersWeek === WEEK_NONE
    ? isAlive(member)
    : member.eliminatedWeek === pool.winnersWeek;

export type ClaimPotArgs = {
  pool: PublicKey;
  wallet: PublicKey;
  vault: PublicKey;
  /* The pool's own mint rather than this module's constant: the program checks
   * `member_ata.mint == pool.usdc_mint`, so the pool is the authority on which
   * token account has to be paid. */
  usdcMint: PublicKey;
};

export type ClaimPotPlan = {
  instruction: TransactionInstruction;
  member: PublicKey;
  memberAta: PublicKey;
};

/* Idempotent by construction: `member.claimed` is set here and refused on a
 * second call, so a double-click costs a failed transaction rather than a
 * second payout.
 *
 * `member_ata` must already exist, the same trap `join_pool` has. A member who
 * was brought in through `sponsor_join` may never have held USDC at all, which
 * makes the winner of a sponsored seat exactly the person most likely to hit
 * it. Callers prepend `createAtaIdempotentIx`. */
export function buildClaimPot(args: ClaimPotArgs): ClaimPotPlan {
  const member = memberPda(args.pool, args.wallet);
  const memberAta = ataFor(args.wallet, args.usdcMint);

  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.pool, isSigner: false, isWritable: true },
      { pubkey: member, isSigner: false, isWritable: true },
      { pubkey: args.wallet, isSigner: true, isWritable: true },
      { pubkey: args.vault, isSigner: false, isWritable: true },
      { pubkey: memberAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: coder.instruction.encode("claim_pot", {}),
  });

  return { instruction, member, memberAta };
}

/* Anchor errors arrive as a log line, not as anything structured. Pulling the
 * program's own message out beats showing "custom program error: 0x1771" to
 * somebody who was trying to start a football pool. */
export function readableProgramError(err: unknown): string {
  const text =
    err instanceof Error
      ? `${err.message}\n${(err as { logs?: string[] }).logs?.join("\n") ?? ""}`
      : String(err);

  const named = text.match(/Error Message: ([^.\n]+)/);
  if (named) return named[1].trim();

  if (/AccountNotInitialized|could not find account/i.test(text)) {
    return "The program's config account does not exist yet on this cluster.";
  }
  if (/insufficient (lamports|funds)/i.test(text)) {
    return "Not enough SOL to pay rent for the pool and its vault.";
  }
  if (/User rejected|rejected the request/i.test(text)) {
    return "You cancelled the transaction in your wallet.";
  }
  return text.split("\n")[0].slice(0, 200);
}
