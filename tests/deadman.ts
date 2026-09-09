/* THE DEADMAN, AND WHAT IT MAY NOT DO.
 *
 * `reclaim_dues` exists so an abandoned pool always refunds. An outside review
 * on 2026-09-09 showed it could also fire while the last week was still being
 * decided: `create_pool` only asked that the refund deadline follow the last
 * lock, week 18 cannot even be posted for three hours after that lock, and a
 * deadline in between let any eliminated member split the pot pro rata with
 * themselves in it while the winner waited on the crank. The same review found
 * that a league assignee who had taken a prize could take a refund share on top,
 * because `claim_prize` never marked the Member.
 *
 * These prove the closures: the deadline must clear the settle room; while a
 * week is posted or finalized the refund waits out the same grace a finalized
 * prize gets; a refund on an empty vault still abandons the pool exactly once;
 * ABANDONED is terminal; a paid assignee cannot be refunded again; and once
 * the refunds begin, an unclaimed prize is forfeit to them.
 *
 * Self-contained, like oracle.ts: every helper it needs is here. Production
 * timing throughout, moved with the clock.
 */

import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { expect } from "chai";
import {
  AccountRole,
  address,
  generateKeyPairSigner,
  getAddressCodec,
  getProgramDerivedAddress,
  lamports,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import type { Address, Instruction, InstructionWithSigners } from "@solana/kit";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";

describe("commish deadman - LiteSVM", () => {
  const idl = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "target/idl/commish.json"), "utf8"),
  );
  const coder = new anchor.BorshCoder(idl);
  const addressCodec = getAddressCodec();

  const programAddress = address("Adb5CFrY4vYiGQnTQ5qsaPPMUAWKyxwVAQtFHWcshjPa");
  const systemProgram = address("11111111111111111111111111111111");
  const tokenProgram = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const ataProgram = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  const rentSysvar = address("SysvarRent111111111111111111111111111111111");
  const CANONICAL_USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

  const WEEKS = 18;
  const POOL_SURVIVOR = 0;
  const POOL_LEAGUE = 8;
  const STATUS_LOCKED = 1;
  const STATUS_RESULTS_POSTED = 2;
  const STATUS_FINALIZED = 3;
  const STATUS_SETTLED = 4;
  const STATUS_ABANDONED = 5;
  const STATUS_SHEET_FINALIZED = 7;
  const SLOT_FINALIZED = 2;
  const SLOT_CLAIMED = 3;

  const HOUR = 3_600;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MIN_POST_DELAY = 3 * HOUR;
  const DISPUTE_WINDOW = 48 * HOUR;
  const LEAGUE_WINDOW = HOUR; // the production minimum
  const REFUND_MARGIN = DAY;
  const PRIZE_CLAIM_GRACE = 30 * DAY;
  /** What create_pool now insists on: last lock + posting floor + window + margin. */
  const SETTLE_ROOM = MIN_POST_DELAY + DISPUTE_WINDOW + REFUND_MARGIN;
  const BUY_IN = 10_000_000n;

  type Signer = Awaited<ReturnType<typeof generateKeyPairSigner>>;

  let svm: LiteSVM;
  let admin: Signer;
  let treasury: Signer;
  let configPDA: Address;
  let treasuryAta: Address;
  let now: number;
  let nonce = 100;

  // ------------------------------------------------------------- accounts
  function encodeMint(decimals: number, authority: Address): Uint8Array {
    const data = new Uint8Array(82);
    const view = new DataView(data.buffer);
    view.setUint32(0, 1, true);
    data.set(addressCodec.encode(authority), 4);
    view.setBigUint64(36, 0n, true);
    data[44] = decimals;
    data[45] = 1;
    view.setUint32(46, 0, true);
    return data;
  }

  function encodeTokenAccount(mint: Address, owner: Address, amount: bigint): Uint8Array {
    const data = new Uint8Array(165);
    const view = new DataView(data.buffer);
    data.set(addressCodec.encode(mint), 0);
    data.set(addressCodec.encode(owner), 32);
    view.setBigUint64(64, amount, true);
    data[108] = 1;
    return data;
  }

  function putMint(mint: Address, authority: Address) {
    const data = encodeMint(6, authority);
    svm.setAccount({
      address: mint,
      lamports: lamports(1_461_600n),
      data,
      programAddress: tokenProgram,
      executable: false,
      space: BigInt(data.length),
    } as any);
  }

  function putTokenAccount(addr: Address, mint: Address, owner: Address, amount: bigint) {
    const data = encodeTokenAccount(mint, owner, amount);
    svm.setAccount({
      address: addr,
      lamports: lamports(2_039_280n),
      data,
      programAddress: tokenProgram,
      executable: false,
      space: BigInt(data.length),
    } as any);
  }

  function tokenAmount(addr: Address): bigint {
    const acc = svm.getAccount(addr);
    if (!acc) throw new Error(`no token account at ${addr}`);
    const bytes = Uint8Array.from(acc.data);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(64, true);
  }

  async function ata(owner: Address, mint: Address): Promise<Address> {
    const [addr] = await getProgramDerivedAddress({
      programAddress: ataProgram,
      seeds: [
        addressCodec.encode(owner),
        addressCodec.encode(tokenProgram),
        addressCodec.encode(mint),
      ],
    });
    return addr;
  }

  async function pda(seeds: Uint8Array[]): Promise<Address> {
    const [addr] = await getProgramDerivedAddress({ programAddress, seeds });
    return addr;
  }
  const poolPda = (commissioner: Address, n: BN) =>
    pda([
      new TextEncoder().encode("pool"),
      addressCodec.encode(commissioner),
      n.toArrayLike(Buffer, "le", 8),
    ]);
  const memberPda = (pool: Address, wallet: Address) =>
    pda([
      new TextEncoder().encode("member"),
      addressCodec.encode(pool),
      addressCodec.encode(wallet),
    ]);

  // --------------------------------------------------------- transactions
  async function buildTx(ix: any, feePayer: any) {
    const msg = appendTransactionMessageInstruction(
      ix as Instruction & InstructionWithSigners,
      setTransactionMessageFeePayerSigner(feePayer, createTransactionMessage({ version: 0 })),
    );
    const withLifetime = svm.setTransactionMessageLifetimeUsingLatestBlockhash(msg);
    return signTransactionMessageWithSigners(withLifetime, { abortSignal: undefined });
  }

  async function sendIx(ix: any, feePayer: any) {
    const res = svm.sendTransaction(await buildTx(ix, feePayer));
    if (res instanceof FailedTransactionMetadata) {
      throw new Error(res.meta().prettyLogs());
    }
    return res;
  }

  async function expectFailure(ix: any, feePayer: any, includes: string) {
    const res = svm.simulateTransaction(await buildTx(ix, feePayer));
    expect(res).to.be.instanceOf(FailedTransactionMetadata);
    const logs = (res as FailedTransactionMetadata).meta().logs().join("\n");
    expect(logs).to.include(includes);
  }

  function fetchAccount<T>(name: string, addr: Address): T {
    const acc = svm.getAccount(addr);
    if (!acc || ("exists" in acc && !acc.exists)) {
      throw new Error(`Missing account ${name} at ${addr}`);
    }
    return coder.accounts.decode(name, Buffer.from(acc.data)) as T;
  }

  const gone = (a: any) => !a || ("exists" in a && !a.exists) || a.data.length === 0;

  function setClock(ts: number) {
    const clock = svm.getClock();
    clock.unixTimestamp = BigInt(ts);
    svm.setClock(clock);
  }

  const lockSchedule = (base: number) =>
    Array.from({ length: WEEKS }, (_, i) => new BN(base + (i + 1) * WEEK));
  const lastLock = () => now + WEEKS * WEEK;

  async function fundedSigner(): Promise<Signer> {
    const s = await generateKeyPairSigner();
    svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    return s;
  }

  // --------------------------------------------------------- instructions
  const initConfigIx = () => ({
    programAddress,
    accounts: [
      { address: configPDA, role: AccountRole.WRITABLE },
      { address: admin.address, role: AccountRole.WRITABLE_SIGNER, signer: admin },
      { address: treasury.address, role: AccountRole.READONLY },
      { address: systemProgram, role: AccountRole.READONLY },
    ],
    data: coder.instruction.encode("init_config", {
      fee_bps: 0,
      fee_cap: new BN(0),
      creation_fee: new BN(0),
    }),
  });

  type CreateOpts = {
    poolType?: number;
    buyIn?: bigint;
    startWeek?: number;
    refundDeadline: number;
    duesDeadline?: number;
    disputeWindow?: number;
    prizeSlots?: { label: string; bps: number }[];
  };

  async function createPoolIx(commissioner: Signer, opts: CreateOpts) {
    const n = new BN(nonce++);
    const pool = await poolPda(commissioner.address, n);
    const vault = await ata(pool, CANONICAL_USDC);
    const league = opts.poolType === POOL_LEAGUE;
    const ix = {
      programAddress,
      accounts: [
        { address: configPDA, role: AccountRole.READONLY },
        { address: pool, role: AccountRole.WRITABLE },
        {
          address: commissioner.address,
          role: AccountRole.WRITABLE_SIGNER,
          signer: commissioner,
        },
        { address: CANONICAL_USDC, role: AccountRole.READONLY },
        { address: vault, role: AccountRole.WRITABLE },
        { address: tokenProgram, role: AccountRole.READONLY },
        { address: ataProgram, role: AccountRole.READONLY },
        { address: systemProgram, role: AccountRole.READONLY },
        { address: rentSysvar, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("create_pool", {
        nonce: n,
        name: league ? "Deadman League" : "Deadman Survivor",
        pool_type: opts.poolType ?? POOL_SURVIVOR,
        buy_in: new BN((opts.buyIn ?? BUY_IN).toString()),
        max_members: 50,
        start_week: opts.startWeek ?? 1,
        lock_ts: lockSchedule(now),
        dues_deadline_ts: new BN(opts.duesDeadline ?? 0),
        refund_deadline_ts: new BN(opts.refundDeadline),
        prize_slots: opts.prizeSlots ?? [],
        weekly_pot_bps: 0,
        dispute_window_secs: opts.disputeWindow ?? (league ? LEAGUE_WINDOW : DISPUTE_WINDOW),
      }),
    };
    return { ix, pool, vault };
  }

  async function createPool(commissioner: Signer, opts: CreateOpts) {
    const made = await createPoolIx(commissioner, opts);
    await sendIx(made.ix, commissioner);
    return made;
  }

  async function join(pool: Address, vault: Address, wallet: Signer, name: string) {
    const walletAta = await ata(wallet.address, CANONICAL_USDC);
    putTokenAccount(walletAta, CANONICAL_USDC, wallet.address, 100_000_000n);
    const member = await memberPda(pool, wallet.address);
    await sendIx(
      {
        programAddress,
        accounts: [
          { address: pool, role: AccountRole.WRITABLE },
          { address: member, role: AccountRole.WRITABLE },
          { address: wallet.address, role: AccountRole.WRITABLE_SIGNER, signer: wallet },
          { address: walletAta, role: AccountRole.WRITABLE },
          { address: vault, role: AccountRole.WRITABLE },
          { address: tokenProgram, role: AccountRole.READONLY },
          { address: systemProgram, role: AccountRole.READONLY },
        ],
        data: coder.instruction.encode("join_pool", { display_name: name }),
      },
      wallet,
    );
    return { member, walletAta };
  }

  const pickIx = (pool: Address, member: Address, wallet: Signer, team: number) => ({
    programAddress,
    accounts: [
      { address: pool, role: AccountRole.WRITABLE },
      { address: member, role: AccountRole.WRITABLE },
      { address: wallet.address, role: AccountRole.WRITABLE_SIGNER, signer: wallet },
    ],
    data: coder.instruction.encode("submit_pick", { team, note: "" }),
  });

  const postResultsIx = (pool: Address, commissioner: Signer, week: number, winners: number) => ({
    programAddress,
    accounts: [
      { address: pool, role: AccountRole.WRITABLE },
      { address: commissioner.address, role: AccountRole.WRITABLE_SIGNER, signer: commissioner },
    ],
    data: coder.instruction.encode("post_results", {
      week,
      winners,
      pushes: 0,
      root: Array(32).fill(0),
    }),
  });

  const crankIx = (name: string, pool: Address) => ({
    programAddress,
    accounts: [{ address: pool, role: AccountRole.WRITABLE }],
    data: coder.instruction.encode(name, {}),
  });

  const settleMemberIx = (pool: Address, member: Address) => ({
    programAddress,
    accounts: [
      { address: pool, role: AccountRole.WRITABLE },
      { address: member, role: AccountRole.WRITABLE },
    ],
    data: coder.instruction.encode("settle_member", { _points: 0 }),
  });

  const advanceWeekIx = (pool: Address, vault: Address) => ({
    programAddress,
    accounts: [
      { address: pool, role: AccountRole.WRITABLE },
      { address: vault, role: AccountRole.WRITABLE },
      { address: treasuryAta, role: AccountRole.WRITABLE },
      { address: tokenProgram, role: AccountRole.READONLY },
    ],
    data: coder.instruction.encode("advance_week", {}),
  });

  const moneyOutIx = (
    name: "claim_pot" | "reclaim_dues",
    pool: Address,
    member: Address,
    wallet: Signer,
    vault: Address,
    walletAta: Address,
  ) => ({
    programAddress,
    accounts: [
      { address: pool, role: AccountRole.WRITABLE },
      { address: member, role: AccountRole.WRITABLE },
      { address: wallet.address, role: AccountRole.WRITABLE_SIGNER, signer: wallet },
      { address: vault, role: AccountRole.WRITABLE },
      { address: walletAta, role: AccountRole.WRITABLE },
      { address: tokenProgram, role: AccountRole.READONLY },
    ],
    data: coder.instruction.encode(name, {}),
  });

  const closeMemberIx = (pool: Address, member: Address, wallet: Signer) => ({
    programAddress,
    accounts: [
      { address: pool, role: AccountRole.READONLY },
      { address: member, role: AccountRole.WRITABLE },
      { address: wallet.address, role: AccountRole.WRITABLE_SIGNER, signer: wallet },
    ],
    data: coder.instruction.encode("close_member", {}),
  });

  const postPayoutSheetIx = (
    pool: Address,
    commissioner: Signer,
    assignments: { slotIdx: number; member: Address }[],
    memberPdas: Address[],
  ) => ({
    programAddress,
    accounts: [
      { address: pool, role: AccountRole.WRITABLE },
      { address: commissioner.address, role: AccountRole.WRITABLE_SIGNER, signer: commissioner },
      ...memberPdas.map((m) => ({ address: m, role: AccountRole.READONLY })),
    ],
    data: coder.instruction.encode("post_payout_sheet", {
      assignments: assignments.map((a) => ({
        slot_idx: a.slotIdx,
        member: new PublicKey(a.member),
      })),
    }),
  });

  /** Six accounts: the Member rides last. See ClaimPrize in lib.rs. */
  const claimPrizeIx = (
    pool: Address,
    wallet: Signer,
    vault: Address,
    walletAta: Address,
    member: Address,
    slotIdx: number,
  ) => ({
    programAddress,
    accounts: [
      { address: pool, role: AccountRole.WRITABLE },
      { address: wallet.address, role: AccountRole.WRITABLE_SIGNER, signer: wallet },
      { address: vault, role: AccountRole.WRITABLE },
      { address: walletAta, role: AccountRole.WRITABLE },
      { address: tokenProgram, role: AccountRole.READONLY },
      { address: member, role: AccountRole.WRITABLE },
    ],
    data: coder.instruction.encode("claim_prize", { slot_idx: slotIdx }),
  });

  /** A Survivor pool that plays only week 18, with Alice on the winner and Bob
   *  on the loser, standing at the moment results may first be posted. The
   *  refund deadline is the earliest the program allows unless given. */
  async function lastWeekPool(opts: { buyIn?: bigint; refundDeadline?: number } = {}) {
    const commissioner = await fundedSigner();
    const alice = await fundedSigner();
    const bob = await fundedSigner();
    const refundDeadline = opts.refundDeadline ?? lastLock() + SETTLE_ROOM;
    const { pool, vault } = await createPool(commissioner, {
      startWeek: WEEKS,
      buyIn: opts.buyIn,
      refundDeadline,
    });
    const a = await join(pool, vault, alice, "Alice");
    const b = await join(pool, vault, bob, "Bob");
    await sendIx(pickIx(pool, a.member, alice, 5), alice);
    await sendIx(pickIx(pool, b.member, bob, 9), bob);
    setClock(lastLock() + MIN_POST_DELAY + 1);
    return { commissioner, alice, bob, a, b, pool, vault, refundDeadline };
  }

  // ---------------------------------------------------------------- setup
  before(async () => {
    svm = new LiteSVM().withLogBytesLimit(256n * 1024n);
    svm.addProgramFromFile(programAddress, "target/deploy/commish.so");

    now = 1_800_000_000;
    setClock(now);

    admin = await fundedSigner();
    treasury = await fundedSigner();
    configPDA = await pda([new TextEncoder().encode("config")]);

    putMint(CANONICAL_USDC, admin.address);
    treasuryAta = await ata(treasury.address, CANONICAL_USDC);
    putTokenAccount(treasuryAta, CANONICAL_USDC, treasury.address, 0n);

    await sendIx(initConfigIx(), admin);
  });

  afterEach(() => setClock(now));

  // ---------------------------------------------------------------- tests
  it("create_pool keeps the refund deadline out of the last week's settle room", async () => {
    const commissioner = await fundedSigner();

    // One second after the last lock used to be legal. So did one second
    // short of the room.
    const tooSoon = await createPoolIx(commissioner, { refundDeadline: lastLock() + 1 });
    await expectFailure(tooSoon.ix, commissioner, "BadRefundDeadline");
    const justShort = await createPoolIx(commissioner, {
      refundDeadline: lastLock() + SETTLE_ROOM - 1,
    });
    await expectFailure(justShort.ix, commissioner, "BadRefundDeadline");

    // The room itself is fine.
    const exact = await createPoolIx(commissioner, { refundDeadline: lastLock() + SETTLE_ROOM });
    await sendIx(exact.ix, commissioner);
    expect(Number(fetchAccount<any>("Pool", exact.pool).refund_deadline_ts)).to.equal(
      lastLock() + SETTLE_ROOM,
    );
  });

  it("while the last week is being decided, the deadman waits and the winner is paid", async () => {
    const w = await lastWeekPool();
    const { pool, vault, alice, bob, a, b, commissioner, refundDeadline } = w;

    await sendIx(postResultsIx(pool, commissioner, WEEKS, 1 << 5), commissioner);
    expect(fetchAccount<any>("Pool", pool).status).to.equal(STATUS_RESULTS_POSTED);

    // The deadline arrives with the week posted and not yet finalized. This is
    // the window the review found: Bob, who is about to be eliminated, would
    // have split the vault with himself in it.
    setClock(refundDeadline);
    await expectFailure(
      moneyOutIx("reclaim_dues", pool, b.member, bob, vault, b.walletAta),
      bob,
      "RefundNotAvailable",
    );

    await sendIx(crankIx("finalize_week", pool), commissioner);
    expect(fetchAccount<any>("Pool", pool).status).to.equal(STATUS_FINALIZED);
    await expectFailure(
      moneyOutIx("reclaim_dues", pool, b.member, bob, vault, b.walletAta),
      bob,
      "RefundNotAvailable",
    );

    await sendIx(settleMemberIx(pool, a.member), commissioner);
    await sendIx(settleMemberIx(pool, b.member), commissioner);
    await sendIx(advanceWeekIx(pool, vault), commissioner);
    expect(fetchAccount<any>("Pool", pool).status).to.equal(STATUS_SETTLED);

    await expectFailure(
      moneyOutIx("reclaim_dues", pool, b.member, bob, vault, b.walletAta),
      bob,
      "AlreadySettled",
    );
    await expectFailure(
      moneyOutIx("claim_pot", pool, b.member, bob, vault, b.walletAta),
      bob,
      "NotAWinner",
    );
    await sendIx(moneyOutIx("claim_pot", pool, a.member, alice, vault, a.walletAta), alice);
    expect(tokenAmount(a.walletAta)).to.equal(100_000_000n - BUY_IN + BUY_IN * 2n);
    expect(tokenAmount(vault)).to.equal(0n);
  });

  it("a week stuck in the crank is refunded after the grace, and abandonment is terminal", async () => {
    const w = await lastWeekPool();
    const { pool, vault, alice, bob, a, b, commissioner, refundDeadline } = w;

    await sendIx(postResultsIx(pool, commissioner, WEEKS, 1 << 5), commissioner);

    // Nobody finalizes, nobody settles. Thirty days past the deadline the
    // deadman still has to work, or the vault is stranded. The grace ends on
    // the second, inclusive, like every other floor in the program.
    setClock(refundDeadline + PRIZE_CLAIM_GRACE - 1);
    await expectFailure(
      moneyOutIx("reclaim_dues", pool, b.member, bob, vault, b.walletAta),
      bob,
      "RefundNotAvailable",
    );
    setClock(refundDeadline + PRIZE_CLAIM_GRACE);
    await sendIx(moneyOutIx("reclaim_dues", pool, b.member, bob, vault, b.walletAta), bob);

    const abandoned = fetchAccount<any>("Pool", pool);
    expect(abandoned.status).to.equal(STATUS_ABANDONED);
    expect(abandoned.refund_per_member.toString()).to.equal(BUY_IN.toString());
    expect(tokenAmount(b.walletAta)).to.equal(100_000_000n);

    // The second refund uses the number the first one fixed.
    await sendIx(moneyOutIx("reclaim_dues", pool, a.member, alice, vault, a.walletAta), alice);
    expect(fetchAccount<any>("Pool", pool).refund_per_member.toString()).to.equal(
      BUY_IN.toString(),
    );
    expect(tokenAmount(a.walletAta)).to.equal(100_000_000n);
    expect(tokenAmount(vault)).to.equal(0n);

    // Nothing cranks a refunded pool anywhere. Finalizing what was posted,
    // posting again, or picking, are all refused.
    await expectFailure(crankIx("finalize_week", pool), commissioner, "NoPendingResults");
    await expectFailure(
      postResultsIx(pool, commissioner, WEEKS, 1 << 9),
      commissioner,
      "PoolAbandoned",
    );
    await expectFailure(pickIx(pool, a.member, alice, 7), alice, "PoolAbandoned");

    // And both, refunded, can close their accounts.
    await sendIx(closeMemberIx(pool, a.member, alice), alice);
    await sendIx(closeMemberIx(pool, b.member, bob), bob);
    expect(svm.getAccount(a.member)).to.satisfy(gone);
  });

  it("an empty vault still abandons the pool exactly once, with a refund of zero", async () => {
    /* The old code used `refund_per_member == 0` to mean "not computed yet".
     * On a pool with no money that is also the computed answer, so every call
     * recomputed and re-flipped the status. The marker is the status now. */
    const w = await lastWeekPool({ buyIn: 0n });
    const { pool, vault, alice, bob, a, b, commissioner, refundDeadline } = w;

    await sendIx(postResultsIx(pool, commissioner, WEEKS, 1 << 5), commissioner);
    setClock(refundDeadline + PRIZE_CLAIM_GRACE + 1);

    await sendIx(moneyOutIx("reclaim_dues", pool, b.member, bob, vault, b.walletAta), bob);
    const p = fetchAccount<any>("Pool", pool);
    expect(p.status).to.equal(STATUS_ABANDONED);
    expect(p.refund_per_member.toString()).to.equal("0");
    expect(fetchAccount<any>("Member", b.member).claimed).to.equal(true);

    await sendIx(moneyOutIx("reclaim_dues", pool, a.member, alice, vault, a.walletAta), alice);
    expect(fetchAccount<any>("Member", a.member).claimed).to.equal(true);
    expect(tokenAmount(vault)).to.equal(0n);
    /* The same bytes again would be dropped as a duplicate before the program
     * ran; a fresh blockhash makes it a new transaction the program refuses. */
    svm.expireBlockhash();
    await expectFailure(
      moneyOutIx("reclaim_dues", pool, a.member, alice, vault, a.walletAta),
      alice,
      "AlreadyClaimed",
    );
  });

  it("a paid prize cannot be topped up with a refund, and an unclaimed one is forfeit once refunds begin", async () => {
    const commissioner = await fundedSigner();
    const alice = await fundedSigner();
    const bob = await fundedSigner();
    const carol = await fundedSigner();

    const duesDeadline = now + HOUR;
    const refundDeadline = now + 200_000;
    const { pool, vault } = await createPool(commissioner, {
      poolType: POOL_LEAGUE,
      duesDeadline,
      refundDeadline,
      prizeSlots: [
        { label: "Champion", bps: 7_000 },
        { label: "Runner-up", bps: 3_000 },
      ],
    });
    const a = await join(pool, vault, alice, "Alice");
    const b = await join(pool, vault, bob, "Bob");
    const c = await join(pool, vault, carol, "Carol");
    expect(tokenAmount(vault)).to.equal(BUY_IN * 3n);

    setClock(duesDeadline + 1);
    await sendIx(crankIx("lock_dues", pool), commissioner);
    await sendIx(
      postPayoutSheetIx(
        pool,
        commissioner,
        [
          { slotIdx: 0, member: alice.address },
          { slotIdx: 1, member: bob.address },
        ],
        [a.member, b.member],
      ),
      commissioner,
    );
    setClock(duesDeadline + 1 + LEAGUE_WINDOW + 1);
    await sendIx(crankIx("finalize_sheet", pool), commissioner);
    const finalized = fetchAccount<any>("Pool", pool);
    expect(finalized.status).to.equal(STATUS_SHEET_FINALIZED);
    expect(finalized.prize_slots[1].state).to.equal(SLOT_FINALIZED);

    // Alice takes the champion's 70%: 21 of the 30 in the vault. The Member
    // now says so, which it never used to.
    await sendIx(claimPrizeIx(pool, alice, vault, a.walletAta, a.member, 0), alice);
    expect(tokenAmount(a.walletAta)).to.equal(100_000_000n - BUY_IN + 21_000_000n);
    expect(fetchAccount<any>("Member", a.member).claimed).to.equal(true);
    expect(fetchAccount<any>("Pool", pool).prize_slots[0].state).to.equal(SLOT_CLAIMED);

    // Bob never claims. His finalized slot holds the refund for the grace.
    setClock(refundDeadline + 1);
    await expectFailure(
      moneyOutIx("reclaim_dues", pool, c.member, carol, vault, c.walletAta),
      carol,
      "RefundNotAvailable",
    );

    // Then the refunds begin, over what is left: 9, so 3 each of three.
    setClock(refundDeadline + PRIZE_CLAIM_GRACE + 1);
    await sendIx(moneyOutIx("reclaim_dues", pool, c.member, carol, vault, c.walletAta), carol);
    const abandoned = fetchAccount<any>("Pool", pool);
    expect(abandoned.status).to.equal(STATUS_ABANDONED);
    expect(abandoned.refund_per_member.toString()).to.equal("3000000");
    expect(tokenAmount(c.walletAta)).to.equal(100_000_000n - BUY_IN + 3_000_000n);

    // Bob's prize is forfeit; his share of the refund is not.
    await expectFailure(
      claimPrizeIx(pool, bob, vault, b.walletAta, b.member, 1),
      bob,
      "PoolAbandoned",
    );
    await sendIx(moneyOutIx("reclaim_dues", pool, b.member, bob, vault, b.walletAta), bob);
    expect(tokenAmount(b.walletAta)).to.equal(100_000_000n - BUY_IN + 3_000_000n);

    // Alice was paid, and stays paid: no refund on top of a prize.
    await expectFailure(
      moneyOutIx("reclaim_dues", pool, a.member, alice, vault, a.walletAta),
      alice,
      "AlreadyClaimed",
    );
    expect(tokenAmount(vault)).to.equal(3_000_000n);

    // The sheet cannot be reposted for the slot Bob forfeited: the pool is done.
    await expectFailure(
      postPayoutSheetIx(pool, commissioner, [{ slotIdx: 1, member: carol.address }], [c.member]),
      commissioner,
      "DuesNotLocked",
    );
    expect(fetchAccount<any>("Pool", pool).status).to.not.equal(STATUS_LOCKED);
  });
});
