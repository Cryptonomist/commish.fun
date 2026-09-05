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
  buildFinalizeWeek,
  buildPostResults,
  buildSettleMember,
  buildVetoResults,
  ataFor,
  memberAccountFilters,
  memberPda,
  poolPda,
  maskWith,
  PROGRAM_ID,
  SETTLES_PER_TX,
  TOKEN_PROGRAM_ID,
} from "@/lib/program";

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
