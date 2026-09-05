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
import { BorshCoder, type Idl } from "@coral-xyz/anchor";
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
  eliminatedWeek: number;
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
    eliminatedWeek: Number(raw.eliminated_week),
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
