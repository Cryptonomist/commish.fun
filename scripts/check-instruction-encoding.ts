/* Does the browser build the same bytes the tested path builds?
 *
 * The LiteSVM suite proves the PROGRAM. It says nothing about `src/lib/program.ts`,
 * which encodes the same instructions again, by hand, for the browser. A
 * reordered account or a mistyped argument name there is not a type error
 * anywhere: it is a transaction that means something other than what the form
 * said, and the first place it would surface is a commissioner posting a week
 * against real money.
 *
 * So this compares, byte for byte, what `buildPostResults` and
 * `buildVetoResults` produce against the builders in `tests/veto.ts` and
 * `tests/workspace.ts` — the ones the nineteen passing tests actually send. An
 * instruction is entirely determined by its program id, its account list and
 * its data, so matching all three against a known-good instruction makes the
 * client's version correct by the same evidence, with no validator and no
 * three-hour wait for a dispute window.
 *
 * It also covers the one case the suite does not: team 31.
 *
 * Run with:  npx tsx scripts/check-instruction-encoding.ts
 */

import fs from "fs";
import path from "path";
import { PublicKey, Transaction } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  AccountRole,
  address,
  getAddressCodec,
  getProgramDerivedAddress,
} from "@solana/kit";
import type { Address } from "@solana/kit";

import {
  buildAdvanceWeek,
  buildClaimPot,
  buildFinalizeWeek,
  buildPostResults,
  buildReclaimDues,
  buildSettleMember,
  buildVetoResults,
  ataFor,
  estimatedRefund,
  memberAccountFilters,
  memberPda,
  poolPda,
  maskWith,
  PROGRAM_ID,
  SETTLES_PER_TX,
  TOKEN_PROGRAM_ID,
  type PoolView,
} from "@/lib/program";
import {
  FAST_CLOCK,
  MIN_POST_DELAY_SECS as TS_MIN_POST_DELAY,
  MIN_DISPUTE_WINDOW_SECS as TS_MIN_DISPUTE_WINDOW,
} from "@/lib/schedule";

/* The reference coder reads `target/idl`, exactly as the tests do. The client
 * reads the vendored `src/idl`. If those two have drifted then every byte
 * comparison below is comparing the client against the wrong contract, so that
 * is the first thing checked rather than an assumption. */
const targetIdlPath = path.resolve(process.cwd(), "target/idl/commish.json");
const vendoredIdlPath = path.resolve(process.cwd(), "src/idl/commish.json");
const idl = JSON.parse(fs.readFileSync(targetIdlPath, "utf8"));
const coder = new anchor.BorshCoder(idl);
const addressCodec = getAddressCodec();

let failures = 0;
let checks = 0;

function ok(name: string, cond: boolean, detail = "") {
  checks++;
  if (cond) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failures++;
    console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail ? `\n      ${detail}` : ""}`);
  }
}

/** A kit AccountRole reduced to the two flags web3.js carries. */
function roleFlags(role: AccountRole) {
  return {
    isSigner:
      role === AccountRole.READONLY_SIGNER || role === AccountRole.WRITABLE_SIGNER,
    isWritable:
      role === AccountRole.WRITABLE || role === AccountRole.WRITABLE_SIGNER,
  };
}

type RefIx = {
  programAddress: Address;
  accounts: { address: Address; role: AccountRole }[];
  data: Buffer;
};

/** Compare a client instruction against a known-good reference. */
function compare(label: string, mine: ReturnType<typeof buildPostResults>, ref: RefIx) {
  console.log(`\n${label}`);

  ok(
    "program id",
    mine.programId.toBase58() === ref.programAddress.toString(),
    `client ${mine.programId.toBase58()} vs test ${ref.programAddress}`,
  );

  ok(
    "account count",
    mine.keys.length === ref.accounts.length,
    `client ${mine.keys.length} vs test ${ref.accounts.length}`,
  );

  const n = Math.min(mine.keys.length, ref.accounts.length);
  for (let i = 0; i < n; i++) {
    const a = mine.keys[i];
    const b = ref.accounts[i];
    const flags = roleFlags(b.role);
    ok(
      `account[${i}] address`,
      a.pubkey.toBase58() === b.address.toString(),
      `client ${a.pubkey.toBase58()} vs test ${b.address}`,
    );
    ok(
      `account[${i}] signer=${flags.isSigner} writable=${flags.isWritable}`,
      a.isSigner === flags.isSigner && a.isWritable === flags.isWritable,
      `client signer=${a.isSigner} writable=${a.isWritable}`,
    );
  }

  const mineData = Buffer.from(mine.data);
  ok(
    `data ${mineData.length} bytes identical`,
    mineData.equals(ref.data),
    `client ${mineData.toString("hex")}\n      test   ${ref.data.toString("hex")}`,
  );
}

/* ── The reference builders, copied verbatim from the passing tests ────────── */

const programAddress = address(PROGRAM_ID.toBase58());

function refPostResults(opts: {
  pool: Address;
  commissioner: Address;
  week: number;
  winners: number;
  pushes: number;
}): RefIx {
  return {
    programAddress,
    accounts: [
      { address: opts.pool, role: AccountRole.WRITABLE },
      { address: opts.commissioner, role: AccountRole.WRITABLE_SIGNER },
    ],
    data: coder.instruction.encode("post_results", {
      week: opts.week,
      winners: opts.winners,
      pushes: opts.pushes,
      root: Array(32).fill(0),
    }),
  };
}

/* workspace.ts: crankIx("finalize_week", pool) */
function refFinalizeWeek(pool: Address): RefIx {
  return {
    programAddress,
    accounts: [{ address: pool, role: AccountRole.WRITABLE }],
    data: coder.instruction.encode("finalize_week", {}),
  };
}

/* workspace.ts: settleMemberIx(pool, member) */
function refSettleMember(pool: Address, member: Address): RefIx {
  return {
    programAddress,
    accounts: [
      { address: pool, role: AccountRole.WRITABLE },
      { address: member, role: AccountRole.WRITABLE },
    ],
    data: coder.instruction.encode("settle_member", { _points: 0 }),
  };
}

/* workspace.ts: advanceWeekIx(pool, vault) */
function refAdvanceWeek(
  pool: Address,
  vault: Address,
  treasuryAta: Address,
): RefIx {
  return {
    programAddress,
    accounts: [
      { address: pool, role: AccountRole.WRITABLE },
      { address: vault, role: AccountRole.WRITABLE },
      { address: treasuryAta, role: AccountRole.WRITABLE },
      { address: address(TOKEN_PROGRAM_ID.toBase58()), role: AccountRole.READONLY },
    ],
    data: coder.instruction.encode("advance_week", {}),
  };
}

/* workspace.ts: claimPotIx({ pool, member, wallet, vault, memberAta }) */
function refClaimPot(opts: {
  pool: Address;
  member: Address;
  wallet: Address;
  vault: Address;
  memberAta: Address;
}): RefIx {
  return {
    programAddress,
    accounts: [
      { address: opts.pool, role: AccountRole.WRITABLE },
      { address: opts.member, role: AccountRole.WRITABLE },
      { address: opts.wallet, role: AccountRole.WRITABLE_SIGNER },
      { address: opts.vault, role: AccountRole.WRITABLE },
      { address: opts.memberAta, role: AccountRole.WRITABLE },
      { address: address(TOKEN_PROGRAM_ID.toBase58()), role: AccountRole.READONLY },
    ],
    data: coder.instruction.encode("claim_pot", {}),
  };
}

/* workspace.ts:310 reclaimDuesIx — the same six accounts as claimPotIx, which
 * is why the client shares one builder between them. Transcribed separately
 * anyway: a reference that reuses the thing it is checking proves nothing. */
function refReclaimDues(opts: {
  pool: Address;
  member: Address;
  wallet: Address;
  vault: Address;
  memberAta: Address;
}): RefIx {
  return {
    programAddress,
    accounts: [
      { address: opts.pool, role: AccountRole.WRITABLE },
      { address: opts.member, role: AccountRole.WRITABLE },
      { address: opts.wallet, role: AccountRole.WRITABLE_SIGNER },
      { address: opts.vault, role: AccountRole.WRITABLE },
      { address: opts.memberAta, role: AccountRole.WRITABLE },
      { address: address(TOKEN_PROGRAM_ID.toBase58()), role: AccountRole.READONLY },
    ],
    data: coder.instruction.encode("reclaim_dues", {}),
  };
}

function refVetoResults(pool: Address, member: Address, wallet: Address): RefIx {
  return {
    programAddress,
    accounts: [
      { address: pool, role: AccountRole.WRITABLE },
      { address: member, role: AccountRole.WRITABLE },
      { address: wallet, role: AccountRole.WRITABLE_SIGNER },
    ],
    data: coder.instruction.encode("veto_results", {}),
  };
}

async function main() {
  console.log("IDL");
  const a = fs.readFileSync(targetIdlPath);
  const b = fs.readFileSync(vendoredIdlPath);
  ok(
    "vendored src/idl matches built target/idl",
    a.equals(b),
    "the client is encoding against a different contract than the tests",
  );

  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const m = fs
      .readFileSync(envPath, "utf8")
      .match(/^NEXT_PUBLIC_PROGRAM_ID=(.+)$/m);
    const envId = m?.[1].trim().replace(/^["']|["']$/g, "");
    ok(
      "NEXT_PUBLIC_PROGRAM_ID agrees with the IDL address",
      !envId || envId === (idl as { address: string }).address,
      `.env.local ${envId} vs IDL ${(idl as { address: string }).address}`,
    );
  }

  /* Deterministic keys. Byte arrays rather than invented base58 so both halves
   * are provably talking about the same 32 bytes. */
  const commissioner = new PublicKey(new Uint8Array(32).fill(7));
  const wallet = new PublicKey(new Uint8Array(32).fill(11));
  // BigInt(…) rather than a literal: the tsconfig targets ES2017.
  const nonce = BigInt(42);
  const pool = poolPda(commissioner, nonce);

  // ── PDA derivation: web3.js against kit ─────────────────────────────────────
  console.log("\nPDA derivation (client web3.js vs test @solana/kit)");
  const [kitPool] = await getProgramDerivedAddress({
    programAddress,
    seeds: [
      new TextEncoder().encode("pool"),
      addressCodec.encode(address(commissioner.toBase58())),
      new BN(nonce.toString()).toArrayLike(Buffer, "le", 8),
    ],
  });
  ok("pool PDA", pool.toBase58() === kitPool.toString(), `${pool.toBase58()} vs ${kitPool}`);

  const [kitMember] = await getProgramDerivedAddress({
    programAddress,
    seeds: [
      new TextEncoder().encode("member"),
      addressCodec.encode(address(pool.toBase58())),
      addressCodec.encode(address(wallet.toBase58())),
    ],
  });
  const mineMember = memberPda(pool, wallet);
  ok(
    "member PDA",
    mineMember.toBase58() === kitMember.toString(),
    `${mineMember.toBase58()} vs ${kitMember}`,
  );

  const poolAddr = address(pool.toBase58());
  const commAddr = address(commissioner.toBase58());
  const walletAddr = address(wallet.toBase58());

  // ── The exact cases the suite sends ─────────────────────────────────────────
  for (const c of [
    { label: "post_results — week 1, winners 1<<5 (workspace.ts:1126)", week: 1, winners: 1 << 5, pushes: 0 },
    { label: "post_results — week 1, winners 1<<30 (veto.ts:448)", week: 1, winners: 1 << 30, pushes: 0 },
    { label: "post_results — week 1, winners 1<<7 (workspace.ts:1211)", week: 1, winners: 1 << 7, pushes: 0 },
    { label: "post_results — winners and pushes together", week: 3, winners: (1 << 2) | (1 << 9), pushes: 1 << 14 },
  ]) {
    compare(
      c.label,
      buildPostResults({
        pool,
        commissioner,
        week: c.week,
        winners: c.winners,
        pushes: c.pushes,
      }),
      refPostResults({
        pool: poolAddr,
        commissioner: commAddr,
        week: c.week,
        winners: c.winners,
        pushes: c.pushes,
      }),
    );
  }

  compare(
    "veto_results",
    buildVetoResults({ pool, wallet }),
    refVetoResults(poolAddr, address(mineMember.toBase58()), walletAddr),
  );

  /* ── Team 31, which the suite never sends ──────────────────────────────────
   *
   * The highest bit the tests exercise is 1<<30. `1 << 31` in JavaScript is
   * -2147483648, so a week where Washington won is the one input that can hit a
   * signed-integer path the whole suite misses. Decoding the bytes back is the
   * check that matters: it proves what the PROGRAM will read, not what the
   * client believed it wrote. */
  console.log("\nTeam 31 (Washington) — the case the suite does not cover");
  const was = maskWith(0, 31);
  ok("mask is unsigned", was === 2_147_483_648, `got ${was}`);
  ok("naive 1 << 31 would have been negative", 1 << 31 === -2_147_483_648);

  const ix31 = buildPostResults({
    pool,
    commissioner,
    week: 5,
    winners: was,
    pushes: 0,
  });
  const decoded = coder.instruction.decode(Buffer.from(ix31.data)) as {
    name: string;
    data: { week: number; winners: number; pushes: number };
  } | null;

  ok("decodes as post_results", decoded?.name === "post_results", `got ${decoded?.name}`);
  ok(
    "winners round-trips to 2147483648",
    decoded?.data.winners === 2_147_483_648,
    `got ${decoded?.data.winners}`,
  );
  ok("week round-trips to 5", decoded?.data.week === 5, `got ${decoded?.data.week}`);

  // Every team, one at a time, must survive the round trip.
  let allTeamsOk = true;
  for (let t = 0; t < 32; t++) {
    const mask = maskWith(0, t);
    const d = coder.instruction.decode(
      Buffer.from(
        buildPostResults({ pool, commissioner, week: 1, winners: mask, pushes: 0 }).data,
      ),
    ) as { data: { winners: number } } | null;
    if (d?.data.winners !== mask) {
      allTeamsOk = false;
      console.log(`      team ${t}: encoded ${mask}, decoded ${d?.data.winners}`);
    }
  }
  ok("all 32 teams round-trip individually", allTeamsOk);

  // ── The crank: finalize, settle, advance ───────────────────────────────────
  const vault = ataFor(pool, new PublicKey(new Uint8Array(32).fill(13)));
  const treasury = new PublicKey(new Uint8Array(32).fill(17));
  const treasuryAta = ataFor(treasury, new PublicKey(new Uint8Array(32).fill(13)));

  compare(
    "finalize_week (workspace.ts crankIx)",
    buildFinalizeWeek(pool),
    refFinalizeWeek(poolAddr),
  );

  compare(
    "settle_member (workspace.ts:506)",
    buildSettleMember(pool, mineMember),
    refSettleMember(poolAddr, address(mineMember.toBase58())),
  );

  compare(
    "advance_week (workspace.ts:517)",
    buildAdvanceWeek({ pool, vault, feeTreasuryAta: treasuryAta }),
    refAdvanceWeek(
      poolAddr,
      address(vault.toBase58()),
      address(treasuryAta.toBase58()),
    ),
  );

  /* ── The money path ────────────────────────────────────────────────────────
   *
   * The associated token account is derived by the client for both
   * `advance_week` (the fee treasury's) and `claim_pot` (the winner's), and it
   * is the account the money actually lands in. Deriving it the other library's
   * way is worth the four lines. */
  const mint = new PublicKey(new Uint8Array(32).fill(13));
  const [kitAta] = await getProgramDerivedAddress({
    programAddress: address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    seeds: [
      addressCodec.encode(address(wallet.toBase58())),
      addressCodec.encode(address(TOKEN_PROGRAM_ID.toBase58())),
      addressCodec.encode(address(mint.toBase58())),
    ],
  });
  console.log("\nAssociated token account derivation");
  ok(
    "ataFor matches @solana/kit",
    ataFor(wallet, mint).toBase58() === kitAta.toString(),
    `${ataFor(wallet, mint).toBase58()} vs ${kitAta}`,
  );

  const claim = buildClaimPot({ pool, wallet, vault, usdcMint: mint });
  ok(
    "claim_pot pays the wallet's own token account",
    claim.memberAta.toBase58() === kitAta.toString(),
  );
  compare(
    "claim_pot (workspace.ts claimPotIx)",
    claim.instruction,
    refClaimPot({
      pool: poolAddr,
      member: address(mineMember.toBase58()),
      wallet: walletAddr,
      vault: address(vault.toBase58()),
      memberAta: address(kitAta.toString()),
    }),
  );

  const reclaim = buildReclaimDues({ pool, wallet, vault, usdcMint: mint });
  compare(
    "reclaim_dues (workspace.ts:310)",
    reclaim.instruction,
    refReclaimDues({
      pool: poolAddr,
      member: address(mineMember.toBase58()),
      wallet: walletAddr,
      vault: address(vault.toBase58()),
      memberAta: address(kitAta.toString()),
    }),
  );

  /* claim_pot and reclaim_dues share one client builder because the program's
   * two account structs are identical. That is exactly the refactor where a
   * dropped argument stops mattering to the account comparison and starts
   * mattering to which instruction actually runs: an ignored `name` would send
   * a refund as a winner's claim, and every check above would still pass. */
  console.log("\nThe two payout paths must not collapse into one");
  ok(
    "claim_pot and reclaim_dues carry different discriminators",
    !Buffer.from(claim.instruction.data).equals(Buffer.from(reclaim.instruction.data)),
    `both encode to ${Buffer.from(claim.instruction.data).toString("hex")}`,
  );
  ok(
    "…and identical account lists, as the program declares them",
    JSON.stringify(claim.instruction.keys) ===
      JSON.stringify(reclaim.instruction.keys),
  );

  /* ── The refund arithmetic ─────────────────────────────────────────────────
   *
   * `refund_per_member` is fixed by the first caller and zero before that, so
   * the screen shows an estimate or a fact depending on a single condition.
   * Inverting it would quote an authoritative-sounding number that is wrong. */
  console.log("\nRefund share");
  const asPool = (over: Partial<PoolView>) =>
    ({ refundPerMember: BigInt(0), paidMembers: 0, ...over }) as PoolView;
  ok(
    "before anyone reclaims, it is the vault split by paid members",
    estimatedRefund(asPool({ paidMembers: 4 }), BigInt(1_000_000)) ===
      BigInt(250_000),
  );
  ok(
    "once fixed, the stored figure wins over the live vault",
    estimatedRefund(
      asPool({ paidMembers: 4, refundPerMember: BigInt(250_000) }),
      BigInt(10),
    ) === BigInt(250_000),
  );
  ok(
    "no paid members is zero, not a division by zero",
    estimatedRefund(asPool({ paidMembers: 0 }), BigInt(1_000_000)) === BigInt(0),
  );

  /* ── Finding members by memcmp ─────────────────────────────────────────────
   *
   * The filter matches the pool pubkey at byte 8, which is only correct while
   * `pool` is the FIRST field of Member, immediately after the eight-byte
   * discriminator. Reordering that struct would not break anything loudly: the
   * filter would simply match nothing, `pendingSettles` would return an empty
   * list, and the crank would report a week with nobody left to settle. */
  console.log("\nMember lookup filters");
  const memberFields = (
    idl as { types: { name: string; type: { fields?: { name: string; type: unknown }[] } }[] }
  ).types.find((t) => t.name === "Member")?.type.fields;
  ok("Member has fields in the IDL", !!memberFields && memberFields.length > 0);
  ok(
    "offset 8 is Member.pool (a pubkey)",
    memberFields?.[0]?.name === "pool" && memberFields?.[0]?.type === "pubkey",
    `first field is ${JSON.stringify(memberFields?.[0])}`,
  );

  const filters = memberAccountFilters(pool);
  ok("two filters: discriminator and pool", filters.length === 2);
  ok("second filter matches the pool at offset 8",
    filters[1].memcmp.offset === 8 && filters[1].memcmp.bytes === pool.toBase58());
  const idlDisc = (idl as { accounts: { name: string; discriminator: number[] }[] }).accounts.find(
    (a) => a.name === "Member",
  )?.discriminator;
  ok(
    "first filter carries the IDL's Member discriminator at offset 0",
    filters[0].memcmp.offset === 0 &&
      !!idlDisc &&
      filters[0].memcmp.bytes ===
        anchor.utils.bytes.bs58.encode(Buffer.from(idlDisc)),
  );

  /* ── A full settle batch has to fit in one packet ──────────────────────────
   *
   * SETTLES_PER_TX is arithmetic in a comment until something serializes it.
   * A batch one over the limit does not fail cleanly at the top of the crank;
   * it fails when the wallet tries to send it, halfway through settling. */
  console.log("\nSettle batching");
  const PACKET = 1232;
  const sizeOf = (n: number): number => {
    const tx = new Transaction();
    for (let i = 0; i < n; i++) {
      tx.add(buildSettleMember(pool, memberPda(pool, new PublicKey(new Uint8Array(32).fill(i + 20)))));
    }
    tx.feePayer = commissioner;
    tx.recentBlockhash = new PublicKey(new Uint8Array(32).fill(3)).toBase58();
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false })
      .length;
  };
  const full = sizeOf(SETTLES_PER_TX);
  ok(
    `${SETTLES_PER_TX} settles serialize to ${full} bytes, under ${PACKET}`,
    full < PACKET,
  );
  ok("one settle fits comfortably", sizeOf(1) < PACKET);
  // The check discriminates: far past the limit it must actually fail.
  let oversizeRejected = false;
  try {
    oversizeRejected = sizeOf(40) >= PACKET;
  } catch {
    oversizeRejected = true;
  }
  ok("a 40-settle batch would not fit, so the limit is real", oversizeRejected);

  /* ── The client's copy of the program's timing floors ──────────────────────
   *
   * `lib/schedule.ts` duplicates MIN_POST_DELAY_SECS and MIN_DISPUTE_WINDOW_SECS
   * so the create form can refuse a bad schedule before a wallet opens, and its
   * own header calls that duplication a liability. `fastclock` doubles the
   * liability: there are now two sets of values to keep in step, and being
   * wrong in either direction is silent. A form built against the wrong half
   * either refuses schedules the chain would take, or builds pools the chain
   * rejects after the commissioner has committed to everything else.
   *
   * So the numbers are read straight out of constants.rs and compared. This is
   * the only check here that reads the program's source rather than its IDL,
   * because these values never reach the IDL at all. */
  console.log("\nTiming floors: lib/schedule.ts against constants.rs");
  const rust = fs.readFileSync(
    path.resolve(process.cwd(), "programs/commish/src/constants.rs"),
    "utf8",
  );

  /** The value of a `pub const` under, or not under, the fastclock cfg. */
  function rustConst(name: string, fast: boolean): number | null {
    const lines = rust.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(
        new RegExp(`^pub const ${name}\\s*:\\s*\\w+\\s*=\\s*([0-9_ *]+);`),
      );
      if (!m) continue;
      const cfg = i > 0 && lines[i - 1].trim().startsWith("#[") ? lines[i - 1] : "";
      const notFast = cfg.includes('not(feature = "fastclock")');
      const isFast = cfg.includes('feature = "fastclock"') && !notFast;
      // An unconditional declaration answers for both builds.
      if (cfg === "" || (fast ? isFast : notFast)) {
        return m[1]
          .split("*")
          .reduce((acc, part) => acc * Number(part.trim().replace(/_/g, "")), 1);
      }
    }
    return null;
  }

  /* Both branches are read out of schedule.ts itself rather than restated
   * here. Restating them makes this check compare the program against numbers
   * typed into the check, which passes happily while the file it is supposed to
   * be guarding drifts. */
  const ts = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/schedule.ts"),
    "utf8",
  );
  const evalNums = (expr: string): number =>
    expr.split("*").reduce((a, p) => a * Number(p.trim().replace(/_/g, "")), 1);

  function tsConst(name: string): { fast: number; slow: number } | null {
    const m = ts.match(
      new RegExp(
        `export const ${name}\\s*=\\s*FAST_CLOCK\\s*\\?\\s*([0-9_ *]+):\\s*([0-9_ *]+);`,
      ),
    );
    return m ? { fast: evalNums(m[1]), slow: evalNums(m[2]) } : null;
  }

  for (const [name, live] of [
    ["MIN_POST_DELAY_SECS", TS_MIN_POST_DELAY],
    ["MIN_DISPUTE_WINDOW_SECS", TS_MIN_DISPUTE_WINDOW],
  ] as const) {
    const slow = rustConst(name, false);
    const fast = rustConst(name, true);
    const client = tsConst(name);
    ok(
      `${name} declared for both builds in constants.rs and schedule.ts`,
      slow !== null && fast !== null && client !== null,
    );
    ok(
      `${name} default: schedule.ts ${client?.slow} matches Rust ${slow}`,
      client?.slow === slow,
    );
    ok(
      `${name} fastclock: schedule.ts ${client?.fast} matches Rust ${fast}`,
      client?.fast === fast,
    );
    ok(
      `${name} is shorter under fastclock, and never zero`,
      !!fast && !!slow && fast < slow && fast > 0,
    );
    /* And the value the app actually imports is the branch its own env selects.
     * The parse above proves the two written numbers agree with the program;
     * this proves the module hands out the one that matches how it was built. */
    ok(
      `${name} exports the ${FAST_CLOCK ? "fastclock" : "default"} branch (${live})`,
      live === (FAST_CLOCK ? client?.fast : client?.slow),
    );
  }

  /* The compressed season still has to satisfy the program's own gap rule:
   * `create_pool` requires lock[w] - lock[w-1] > MIN_POST_DELAY + window. A
   * fast clock whose weeks are too close together produces a form that cannot
   * create anything, which is a worse outcome than the slow one it replaced. */
  const fastGap = (rustConst("MIN_POST_DELAY_SECS", true) ?? 0) + 30;
  ok(
    `fastclock weeks are 120s apart, clearing the ${fastGap}s minimum gap`,
    120 > fastGap,
    `120 is not greater than ${fastGap}`,
  );

  /* ── The season schedule is a contract too ────────────────────────────────
   *
   * `lockTs` goes on chain at pool creation and `submit_pick` enforces it to
   * the second, so this file is part of the deal a member joins. Two things
   * must hold or pools built from it are broken in ways nothing else catches:
   * every abbreviation has to resolve to the on-chain team index, and the locks
   * have to be strictly increasing or `create_pool` refuses outright. */
  console.log("\nSeason schedule");
  const sched = JSON.parse(
    fs.readFileSync(
      path.resolve(process.cwd(), "src/data/nfl-schedule-2026.json"),
      "utf8",
    ),
  ) as {
    season: number;
    weeks: { week: number; lockTs: number; byes: string[]; games: { away: string; home: string }[] }[];
  };
  const nfl = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/nfl.ts"),
    "utf8",
  );
  const known = new Set([...nfl.matchAll(/abbr: "([A-Z]{2,3})"/g)].map((m) => m[1]));

  ok(`eighteen weeks for ${sched.season}`, sched.weeks.length === 18);

  const strays = new Set<string>();
  let games = 0;
  for (const w of sched.weeks) {
    games += w.games.length;
    for (const g of w.games) {
      for (const a of [g.away, g.home]) if (!known.has(a)) strays.add(a);
    }
    for (const b of w.byes) if (!known.has(b)) strays.add(b);
  }
  ok(
    `every team in ${games} games and all byes is one of the thirty-two`,
    strays.size === 0,
    strays.size ? `unknown: ${[...strays].join(", ")}` : "",
  );

  let increasing = true;
  for (let i = 1; i < sched.weeks.length; i++) {
    if (sched.weeks[i].lockTs <= sched.weeks[i - 1].lockTs) increasing = false;
  }
  ok("locks are strictly increasing, as create_pool requires", increasing);

  /* Each team plays or sits, exactly once a week. A team appearing twice, or
   * neither playing nor on a bye, means the schedule is malformed in a way the
   * bye mask would silently paper over. */
  let accounted = true;
  for (const w of sched.weeks) {
    const seen = new Map<string, number>();
    for (const g of w.games) {
      for (const a of [g.away, g.home]) seen.set(a, (seen.get(a) ?? 0) + 1);
    }
    for (const b of w.byes) seen.set(b, (seen.get(b) ?? 0) + 1);
    if (seen.size !== 32 || [...seen.values()].some((n) => n !== 1)) {
      accounted = false;
    }
  }
  ok("every week accounts for all thirty-two teams exactly once", accounted);

  /* ── Every key the decoders read must exist on the account ────────────────
   *
   * `decodePool` and `decodeMember` reach into the decoded account by
   * snake_case string. A typo there is not a type error and does not throw: it
   * yields `undefined`, `Number(undefined)` is NaN, and the dispute window
   * silently counts down from nothing. Reading the keys back out of the source
   * and checking them against the IDL's own field list catches that class of
   * bug without needing an account to decode. */
  console.log("\nDecoder field names against the IDL");
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/program.ts"),
    "utf8",
  );

  const fieldsOf = (typeName: string): string[] => {
    const t = (idl as { types: { name: string; type: { fields?: { name: string }[] } }[] }).types.find(
      (x) => x.name === typeName,
    );
    return t?.type.fields?.map((f) => f.name) ?? [];
  };

  const bodyOf = (fnName: string): string => {
    const start = src.indexOf(`export function ${fnName}(`);
    if (start === -1) return "";
    const end = src.indexOf("\n}", start);
    return src.slice(start, end === -1 ? undefined : end);
  };

  for (const [fn, typeName] of [
    ["decodePool", "Pool"],
    ["decodeMember", "Member"],
  ] as const) {
    const body = bodyOf(fn);
    const known = fieldsOf(typeName);
    ok(`${typeName} is declared in the IDL`, known.length > 0);

    const keys = new Set<string>();
    for (const re of [
      /\bnum\("([a-z_0-9]+)"\)/g,
      /\bbig\("([a-z_0-9]+)"\)/g,
      /\braw\.([a-z_0-9]+)/g,
      /\braw\["([a-z_0-9]+)"\]/g,
    ]) {
      for (const m of body.matchAll(re)) keys.add(m[1]);
    }

    ok(`${fn} reads at least one field`, keys.size > 0);
    const unknown = [...keys].filter((k) => !known.includes(k));
    ok(
      `${fn} reads ${keys.size} fields, all present on ${typeName}`,
      unknown.length === 0,
      unknown.length ? `not on ${typeName}: ${unknown.join(", ")}` : "",
    );
  }

  // The decoders name their account type as a string too.
  const accountNames = (idl as { accounts: { name: string }[] }).accounts.map(
    (x) => x.name,
  );
  for (const n of ["Pool", "Member"]) {
    ok(
      `coder.accounts.decode("${n}") names a real account`,
      accountNames.includes(n),
      `IDL has ${accountNames.join(", ")}`,
    );
  }

  // ── The illegal state the form is built to make unreachable ────────────────
  console.log("\nRefusals");
  let threw = false;
  try {
    buildPostResults({ pool, commissioner, week: 1, winners: 1 << 4, pushes: 1 << 4 });
  } catch {
    threw = true;
  }
  ok("overlapping winners and pushes is refused before the wallet opens", threw);

  console.log(
    `\n${failures === 0 ? "\x1b[32m" : "\x1b[31m"}${checks - failures}/${checks} checks passed\x1b[0m`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
