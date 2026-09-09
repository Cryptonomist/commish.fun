/* THE RESULTS ORACLE: a second key that may propose a week, and nothing else.
 *
 * `post_results` trusted one person per pool. The failure that actually
 * threatens a pool is not a dishonest commissioner but an absent or mistaken
 * one, so the program now has a second door into the same proposal, signed by
 * a key the admin names. These prove the door is the same door: same floor,
 * same masks, same window, same veto epoch, same crank to settlement — and
 * that nobody but the named key can walk through it, including the
 * commissioner and the admin themselves.
 *
 * Self-contained, like veto.ts: every helper it needs is here, because the
 * ones in workspace.ts are closures inside its describe.
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

describe("commish results oracle - LiteSVM", () => {
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
  const STATUS_RESULTS_POSTED = 2;
  const STATUS_FINALIZED = 3;
  const STATUS_SETTLED = 4;
  const MIN_POST_DELAY = 3 * 60 * 60;
  const DISPUTE_WINDOW = 48 * 60 * 60;
  const WEEK = 7 * 86_400;
  const BUY_IN = 10_000_000n;
  const HAS_ONE = "A has one constraint was violated";

  type Signer = Awaited<ReturnType<typeof generateKeyPairSigner>>;

  let svm: LiteSVM;
  let admin: Signer;
  let treasury: Signer;
  let poster: Signer;
  let configPDA: Address;
  let oraclePDA: Address;
  let treasuryAta: Address;
  let now: number;

  /* Shared between "only the named key may post" and "runs the whole week":
   * the second continues the pool the first left at RESULTS_POSTED. */
  let week1: {
    pool: Address;
    vault: Address;
    members: Address[];
    lock: number;
    alice: Signer;
    bob: Signer;
  };

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
  const poolPda = (commissioner: Address, nonce: BN) =>
    pda([
      new TextEncoder().encode("pool"),
      addressCodec.encode(commissioner),
      nonce.toArrayLike(Buffer, "le", 8),
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

  function toAddressString(value: any): string {
    if (typeof value === "string") return value;
    if (value && typeof value.toBase58 === "function") return value.toBase58();
    return addressCodec.decode(Uint8Array.from(value));
  }

  function setClock(ts: number) {
    const clock = svm.getClock();
    clock.unixTimestamp = BigInt(ts);
    svm.setClock(clock);
  }

  const lockSchedule = (base: number) =>
    Array.from({ length: WEEKS }, (_, i) => new BN(base + (i + 1) * WEEK));

  // --------------------------------------------------------- instructions
  function initConfigIx() {
    return {
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
    };
  }

  function setOracleIx(signer: Signer, newPoster: Address) {
    return {
      programAddress,
      accounts: [
        { address: configPDA, role: AccountRole.READONLY },
        { address: oraclePDA, role: AccountRole.WRITABLE },
        { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
        { address: systemProgram, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("set_oracle", {
        poster: new PublicKey(newPoster),
      }),
    };
  }

  async function createSurvivorPool(commissioner: Signer, nonce: number) {
    const pool = await poolPda(commissioner.address, new BN(nonce));
    const vault = await ata(pool, CANONICAL_USDC);
    const locks = lockSchedule(now);
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
        nonce: new BN(nonce),
        name: "Oracle Survivor",
        pool_type: POOL_SURVIVOR,
        buy_in: new BN(BUY_IN.toString()),
        max_members: 50,
        start_week: 1,
        lock_ts: locks,
        dues_deadline_ts: new BN(0),
        refund_deadline_ts: locks[WEEKS - 1].addn(86_400),
        prize_slots: [],
        weekly_pot_bps: 0,
        dispute_window_secs: DISPUTE_WINDOW,
      }),
    };
    await sendIx(ix, commissioner);
    return { pool, vault, lock: now + WEEK };
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
    return member;
  }

  async function pick(pool: Address, wallet: Signer, team: number) {
    const member = await memberPda(pool, wallet.address);
    await sendIx(
      {
        programAddress,
        accounts: [
          { address: pool, role: AccountRole.WRITABLE },
          { address: member, role: AccountRole.WRITABLE },
          { address: wallet.address, role: AccountRole.WRITABLE_SIGNER, signer: wallet },
        ],
        data: coder.instruction.encode("submit_pick", { team, note: "" }),
      },
      wallet,
    );
  }

  const resultsData = (week: number, winners: number, pushes: number, name: string) =>
    coder.instruction.encode(name, {
      week,
      winners,
      pushes,
      root: Array(32).fill(0),
    });

  /** The commissioner's door. Unchanged by this feature. */
  function postResultsIx(pool: Address, commissioner: Signer, winners: number) {
    return {
      programAddress,
      accounts: [
        { address: pool, role: AccountRole.WRITABLE },
        {
          address: commissioner.address,
          role: AccountRole.WRITABLE_SIGNER,
          signer: commissioner,
        },
      ],
      data: resultsData(1, winners, 0, "post_results"),
    };
  }

  /** The oracle's door. Whoever signs must be the key named in the account. */
  function oraclePostIx(pool: Address, signer: Signer, winners: number) {
    return {
      programAddress,
      accounts: [
        { address: pool, role: AccountRole.WRITABLE },
        { address: oraclePDA, role: AccountRole.READONLY },
        { address: signer.address, role: AccountRole.READONLY_SIGNER, signer },
      ],
      data: resultsData(1, winners, 0, "oracle_post_results"),
    };
  }

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

  const claimPotIx = async (pool: Address, member: Address, wallet: Signer, vault: Address) => ({
    programAddress,
    accounts: [
      { address: pool, role: AccountRole.WRITABLE },
      { address: member, role: AccountRole.WRITABLE },
      { address: wallet.address, role: AccountRole.READONLY_SIGNER, signer: wallet },
      { address: vault, role: AccountRole.WRITABLE },
      { address: await ata(wallet.address, CANONICAL_USDC), role: AccountRole.WRITABLE },
      { address: tokenProgram, role: AccountRole.READONLY },
    ],
    data: coder.instruction.encode("claim_pot", {}),
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

  /** LiteSVM reports a closed account three different ways. */
  const gone = (a: any) => !a || ("exists" in a && !a.exists) || a.data.length === 0;

  async function fundedSigner(): Promise<Signer> {
    const s = await generateKeyPairSigner();
    svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    return s;
  }

  /** A pool with two members whose picks are in and the week locked, standing
   *  at the moment results may first be posted. */
  async function lockedWeekOne(nonce: number) {
    const commissioner = await fundedSigner();
    const alice = await fundedSigner();
    const bob = await fundedSigner();
    const { pool, vault, lock } = await createSurvivorPool(commissioner, nonce);
    const members = [
      await join(pool, vault, alice, "Alice"),
      await join(pool, vault, bob, "Bob"),
    ];
    await pick(pool, alice, 5); // will win
    await pick(pool, bob, 9); // will lose
    setClock(lock + MIN_POST_DELAY + 1);
    return { commissioner, alice, bob, pool, vault, members, lock };
  }

  // ---------------------------------------------------------------- setup
  before(async () => {
    svm = new LiteSVM().withLogBytesLimit(256n * 1024n);
    svm.addProgramFromFile(programAddress, "target/deploy/commish.so");

    now = 1_800_000_000;
    setClock(now);

    admin = await fundedSigner();
    treasury = await fundedSigner();
    poster = await fundedSigner();

    configPDA = await pda([new TextEncoder().encode("config")]);
    oraclePDA = await pda([new TextEncoder().encode("oracle")]);

    putMint(CANONICAL_USDC, admin.address);
    treasuryAta = await ata(treasury.address, CANONICAL_USDC);
    putTokenAccount(treasuryAta, CANONICAL_USDC, treasury.address, 0n);

    await sendIx(initConfigIx(), admin);
  });

  afterEach(() => setClock(now));

  // ---------------------------------------------------------------- tests
  it("nobody but the admin can name the oracle", async () => {
    const stranger = await fundedSigner();
    await expectFailure(setOracleIx(stranger, stranger.address), stranger, HAS_ONE);
    expect(svm.getAccount(oraclePDA)).to.satisfy(
      (a: any) => !a || ("exists" in a && !a.exists) || a.data.length === 0,
      "a refused set_oracle must leave nothing behind",
    );
  });

  it("the admin names the oracle, and the account says who", async () => {
    await sendIx(setOracleIx(admin, poster.address), admin);
    const o = fetchAccount<any>("Oracle", oraclePDA);
    expect(toAddressString(o.poster)).to.equal(poster.address);
  });

  it("only the named key may post through the oracle door", async () => {
    const w = await lockedWeekOne(1);
    const winners = 1 << 5;

    // Not a stranger, and not the pool's own commissioner either: the oracle
    // door has exactly one key, and being in charge of the pool is not it.
    const stranger = await fundedSigner();
    await expectFailure(oraclePostIx(w.pool, stranger, winners), stranger, HAS_ONE);
    await expectFailure(
      oraclePostIx(w.pool, w.commissioner, winners),
      w.commissioner,
      HAS_ONE,
    );
    expect(fetchAccount<any>("Pool", w.pool).status).to.not.equal(STATUS_RESULTS_POSTED);

    await sendIx(oraclePostIx(w.pool, poster, winners), poster);

    const p = fetchAccount<any>("Pool", w.pool);
    expect(p.status).to.equal(STATUS_RESULTS_POSTED);
    expect(p.pending_week).to.equal(1);
    expect(p.pending_winners).to.equal(winners);
    expect(p.veto_epoch).to.equal(1);

    week1 = {
      pool: w.pool,
      vault: w.vault,
      members: w.members,
      lock: w.lock,
      alice: w.alice,
      bob: w.bob,
    };
  });

  it("is the same door: the oracle cannot post before the games could be over", async () => {
    const commissioner = await fundedSigner();
    const alice = await fundedSigner();
    const { pool, vault, lock } = await createSurvivorPool(commissioner, 2);
    await join(pool, vault, alice, "Alice");
    await pick(pool, alice, 5);

    setClock(lock + MIN_POST_DELAY - 1);
    await expectFailure(oraclePostIx(pool, poster, 1 << 5), poster, "TooEarly");
  });

  it("is the same door: overlapping masks are refused for the oracle too", async () => {
    const w = await lockedWeekOne(3);
    const ix = {
      ...oraclePostIx(w.pool, poster, 1 << 5),
      data: resultsData(1, 1 << 5, 1 << 5, "oracle_post_results"),
    };
    await expectFailure(ix, poster, "OverlappingMasks");
  });

  it("an oracle posting runs the whole week to settlement", async () => {
    // Continue the pool the oracle posted on. Two members, one wrong pick, so
    // the week ends with one survivor and the pool settles rather than rolls.
    const { pool, vault, members, lock } = week1;

    setClock(lock + MIN_POST_DELAY + 1 + DISPUTE_WINDOW + 1);
    await sendIx(crankIx("finalize_week", pool), admin);
    const finalized = fetchAccount<any>("Pool", pool);
    expect(finalized.status).to.equal(STATUS_FINALIZED);
    expect(finalized.alive_at_week_start).to.equal(2);

    for (const m of members) await sendIx(settleMemberIx(pool, m), admin);

    const [alice, bob] = members.map((m) => fetchAccount<any>("Member", m));
    expect(alice.eliminated_week).to.equal(0);
    expect(bob.eliminated_week).to.equal(1);

    await sendIx(advanceWeekIx(pool, vault), admin);
    const settled = fetchAccount<any>("Pool", pool);
    expect(settled.status).to.equal(STATUS_SETTLED);
    expect(settled.alive_count).to.equal(1);
    expect(settled.winners_count).to.equal(1);
  });

  it("once settled, a member who was knocked out can close their account", async () => {
    /* THE RENT LEAK THIS CLOSES. `close_member` used to require `claimed`,
     * and only the claim paths write it, so a member who lost could never
     * close: settled pool, nothing claimed, nothing to claim, rent locked
     * for good. Bob went out in week 1 of the pool above. */
    const { pool, vault, members, alice, bob } = week1;
    const [aliceMember, bobMember] = members;

    const bobBefore = svm.getBalance(bob.address) ?? 0n;
    await sendIx(closeMemberIx(pool, bobMember, bob), bob);
    expect(svm.getAccount(bobMember)).to.satisfy(gone, "Bob's Member account should be closed");
    expect(svm.getBalance(bob.address) ?? 0n).to.be.greaterThan(
      bobBefore,
      "the rent should come back to Bob",
    );

    // Alice won and has not claimed. Closing now would forfeit the pot, so
    // the program refuses until she is paid.
    await expectFailure(closeMemberIx(pool, aliceMember, alice), alice, "StillOwed");

    await sendIx(await claimPotIx(pool, aliceMember, alice, vault), alice);
    expect(fetchAccount<any>("Member", aliceMember).claimed).to.equal(true);
    await sendIx(closeMemberIx(pool, aliceMember, alice), alice);
    expect(svm.getAccount(aliceMember)).to.satisfy(gone, "a paid winner can close");
  });

  it("rotating the key locks the old one out and lets the new one in", async () => {
    const replacement = await fundedSigner();
    await sendIx(setOracleIx(admin, replacement.address), admin);
    expect(toAddressString(fetchAccount<any>("Oracle", oraclePDA).poster)).to.equal(
      replacement.address,
    );

    const w = await lockedWeekOne(4);
    await expectFailure(oraclePostIx(w.pool, poster, 1 << 5), poster, HAS_ONE);
    await sendIx(oraclePostIx(w.pool, replacement, 1 << 5), replacement);
    expect(fetchAccount<any>("Pool", w.pool).status).to.equal(STATUS_RESULTS_POSTED);

    // Put it back for anything that runs after this.
    await sendIx(setOracleIx(admin, poster.address), admin);
  });

  it("the commissioner's own door is untouched", async () => {
    const w = await lockedWeekOne(5);
    await sendIx(postResultsIx(w.pool, w.commissioner, 1 << 5), w.commissioner);
    const p = fetchAccount<any>("Pool", w.pool);
    expect(p.status).to.equal(STATUS_RESULTS_POSTED);
    expect(p.pending_winners).to.equal(1 << 5);
  });

  it("a week already proposed by one door cannot be proposed again by the other", async () => {
    const w = await lockedWeekOne(6);
    await sendIx(oraclePostIx(w.pool, poster, 1 << 5), poster);
    await expectFailure(
      postResultsIx(w.pool, w.commissioner, 1 << 9),
      w.commissioner,
      "ResultsPending",
    );
  });
});
