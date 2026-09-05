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

describe("commish - LiteSVM", () => {
  const idl = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "target/idl/commish.json"), "utf8")
  );
  const coder = new anchor.BorshCoder(idl);
  const addressCodec = getAddressCodec();

  const programAddress = address("6tkTECTeN6GSwPPCh1SyNnkw3hZWhejXfaNcYX1Z3J2A");
  const systemProgram = address("11111111111111111111111111111111");
  const tokenProgram = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const ataProgram = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  const rentSysvar = address("SysvarRent111111111111111111111111111111111");

  const CANONICAL_USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const WRONG_MINT = address("So11111111111111111111111111111111111111112");

  const WEEKS = 18;
  const POOL_SURVIVOR = 0;
  const POOL_LEAGUE = 8;
  const MIN_DISPUTE_WINDOW = 60 * 60;
  const STATUS_OPEN = 0;
  const STATUS_LOCKED = 1;
  const STATUS_RESULTS_POSTED = 2;
  const STATUS_FINALIZED = 3;
  const MIN_POST_DELAY = 3 * 60 * 60;
  const DISPUTE_WINDOW = 48 * 60 * 60;
  const STATUS_ABANDONED = 5;
  const STATUS_SETTLED = 4;
  const WEEK_NONE = 0;
  const FEE_BPS = 250n;
  const PRIZE_CLAIM_GRACE = 30 * 24 * 60 * 60;
  const STATUS_SHEET_POSTED = 6;
  const STATUS_SHEET_FINALIZED = 7;
  const SLOT_FINALIZED = 2;
  const SLOT_CLAIMED = 3;
  const POOL_LEN = 1616;
  const MEMBER_LEN = 201;
  const CONFIG_LEN = 92;
  const BUY_IN = 10_000_000n;

  let svm: LiteSVM;
  let admin: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  let treasury: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  let configPDA: Address;
  let treasuryAta: Address;
  let now: number;

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

  function encodeTokenAccount(
    mint: Address,
    owner: Address,
    amount: bigint
  ): Uint8Array {
    const data = new Uint8Array(165);
    const view = new DataView(data.buffer);
    data.set(addressCodec.encode(mint), 0);
    data.set(addressCodec.encode(owner), 32);
    view.setBigUint64(64, amount, true);
    data[108] = 1;
    return data;
  }

  function tokenAmount(addr: Address): bigint {
    const acc = svm.getAccount(addr);
    if (!acc) throw new Error(`Missing token account ${addr}`);
    const data = Uint8Array.from(acc.data);
    return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(
      64,
      true
    );
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

  async function poolPda(commissioner: Address, nonce: BN): Promise<Address> {
    const [addr] = await getProgramDerivedAddress({
      programAddress,
      seeds: [
        new TextEncoder().encode("pool"),
        addressCodec.encode(commissioner),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
    });
    return addr;
  }

  async function memberPda(pool: Address, wallet: Address): Promise<Address> {
    const [addr] = await getProgramDerivedAddress({
      programAddress,
      seeds: [
        new TextEncoder().encode("member"),
        addressCodec.encode(pool),
        addressCodec.encode(wallet),
      ],
    });
    return addr;
  }

  async function buildTx(ix: any, feePayerSigner: any) {
    const msg = appendTransactionMessageInstruction(
      ix as Instruction & InstructionWithSigners,
      setTransactionMessageFeePayerSigner(
        feePayerSigner,
        createTransactionMessage({ version: 0 })
      )
    );
    const withLifetime = svm.setTransactionMessageLifetimeUsingLatestBlockhash(msg);
    return signTransactionMessageWithSigners(withLifetime, { abortSignal: undefined });
  }

  async function sendIx(ix: any, feePayerSigner: any) {
    const tx = await buildTx(ix, feePayerSigner);
    const res = svm.sendTransaction(tx);
    if (res instanceof FailedTransactionMetadata) {
      throw new Error(res.meta().prettyLogs());
    }
    return res;
  }

  async function expectFailure(ix: any, feePayerSigner: any, includes: string) {
    const tx = await buildTx(ix, feePayerSigner);
    const res = svm.simulateTransaction(tx);
    expect(res).to.be.instanceOf(FailedTransactionMetadata);
    const logText = (res as FailedTransactionMetadata).meta().logs().join("\n");
    expect(logText).to.include(includes);
  }

  async function expectSimOk(ix: any, feePayer: any) {
    const res = svm.simulateTransaction(await buildTx(ix, feePayer));
    if (res instanceof FailedTransactionMetadata) {
      throw new Error(res.meta().prettyLogs());
    }
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
    if (value instanceof Uint8Array) return addressCodec.decode(value);
    if (value && typeof value.toBase58 === "function") return value.toBase58();
    if (value && typeof value.length === "number") {
      return addressCodec.decode(Uint8Array.from(value));
    }
    throw new Error("Unable to decode address");
  }

  function lockSchedule(base: number, spacing = 7 * 86_400): BN[] {
    return Array.from({ length: WEEKS }, (_, i) => new BN(base + (i + 1) * spacing));
  }

  async function createPoolIx(opts: {
    commissioner: any;
    nonce: BN;
    mint: Address;
    buyIn: bigint;
    spacing?: number;
  }) {
    const pool = await poolPda(opts.commissioner.address, opts.nonce);
    const vault = await ata(pool, opts.mint);
    const locks = lockSchedule(now, opts.spacing ?? 7 * 86_400);

    const data = coder.instruction.encode("create_pool", {
      nonce: opts.nonce,
      name: "Week One Survivor",
      pool_type: POOL_SURVIVOR,
      buy_in: new BN(opts.buyIn.toString()),
      max_members: 50,
      start_week: 1,
      lock_ts: locks,
      dues_deadline_ts: new BN(0),
      refund_deadline_ts: locks[WEEKS - 1].addn(86_400),
      prize_slots: [],
      weekly_pot_bps: 0,
      dispute_window_secs: 48 * 60 * 60,
    });

    const ix = {
      programAddress,
      accounts: [
        { address: configPDA, role: AccountRole.READONLY },
        { address: pool, role: AccountRole.WRITABLE },
        {
          address: opts.commissioner.address,
          role: AccountRole.WRITABLE_SIGNER,
          signer: opts.commissioner,
        },
        { address: opts.mint, role: AccountRole.READONLY },
        { address: vault, role: AccountRole.WRITABLE },
        { address: tokenProgram, role: AccountRole.READONLY },
        { address: ataProgram, role: AccountRole.READONLY },
        { address: systemProgram, role: AccountRole.READONLY },
        { address: rentSysvar, role: AccountRole.READONLY },
      ],
      data,
    };
    return { ix, pool, vault };
  }

  function setClock(ts: number) {
    const clock = svm.getClock();
    clock.unixTimestamp = BigInt(ts);
    svm.setClock(clock);
  }

  async function joinPool(
    pool: Address,
    vault: Address,
    wallet: any,
    displayName: string,
    funding: bigint
  ) {
    const walletAta = await ata(wallet.address, CANONICAL_USDC);
    putTokenAccount(walletAta, CANONICAL_USDC, wallet.address, funding);

    const member = await memberPda(pool, wallet.address);
    const data = coder.instruction.encode("join_pool", { display_name: displayName });

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
        data,
      },
      wallet
    );

    return { member, walletAta };
  }

  function reclaimDuesIx(opts: {
    pool: Address;
    member: Address;
    wallet: any;
    vault: Address;
    memberAta: Address;
  }) {
    return {
      programAddress,
      accounts: [
        { address: opts.pool, role: AccountRole.WRITABLE },
        { address: opts.member, role: AccountRole.WRITABLE },
        {
          address: opts.wallet.address,
          role: AccountRole.WRITABLE_SIGNER,
          signer: opts.wallet,
        },
        { address: opts.vault, role: AccountRole.WRITABLE },
        { address: opts.memberAta, role: AccountRole.WRITABLE },
        { address: tokenProgram, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("reclaim_dues", {}),
    };
  }

  async function createLeaguePoolIx(opts: {
    commissioner: any;
    nonce: BN;
    buyIn: bigint;
    duesDeadline: number;
    refundDeadline: number;
  }) {
    const pool = await poolPda(opts.commissioner.address, opts.nonce);
    const vault = await ata(pool, CANONICAL_USDC);

    const data = coder.instruction.encode("create_pool", {
      nonce: opts.nonce,
      name: "Sunday League",
      pool_type: POOL_LEAGUE,
      buy_in: new BN(opts.buyIn.toString()),
      max_members: 50,
      start_week: 1,
      lock_ts: lockSchedule(now),
      dues_deadline_ts: new BN(opts.duesDeadline),
      refund_deadline_ts: new BN(opts.refundDeadline),
      prize_slots: [{ label: "Champion", bps: 10_000 }],
      weekly_pot_bps: 0,
      dispute_window_secs: MIN_DISPUTE_WINDOW,
    });

    const ix = {
      programAddress,
      accounts: [
        { address: configPDA, role: AccountRole.READONLY },
        { address: pool, role: AccountRole.WRITABLE },
        {
          address: opts.commissioner.address,
          role: AccountRole.WRITABLE_SIGNER,
          signer: opts.commissioner,
        },
        { address: CANONICAL_USDC, role: AccountRole.READONLY },
        { address: vault, role: AccountRole.WRITABLE },
        { address: tokenProgram, role: AccountRole.READONLY },
        { address: ataProgram, role: AccountRole.READONLY },
        { address: systemProgram, role: AccountRole.READONLY },
        { address: rentSysvar, role: AccountRole.READONLY },
      ],
      data,
    };
    return { ix, pool, vault };
  }

  function vetoResultsIx(pool: Address, member: Address, wallet: any) {
    return {
      programAddress,
      accounts: [
        { address: pool, role: AccountRole.WRITABLE },
        { address: member, role: AccountRole.WRITABLE },
        { address: wallet.address, role: AccountRole.WRITABLE_SIGNER, signer: wallet },
      ],
      data: coder.instruction.encode("veto_results", {}),
    };
  }

  function crankIx(
    name: "lock_dues" | "finalize_sheet" | "finalize_week",
    pool: Address
  ) {
    return {
      programAddress,
      accounts: [{ address: pool, role: AccountRole.WRITABLE }],
      data: coder.instruction.encode(name, {}),
    };
  }

  function postPayoutSheetIx(opts: {
    pool: Address;
    commissioner: any;
    assignments: { slot_idx: number; member: Address }[];
    memberPdas: Address[];
  }) {
    return {
      programAddress,
      accounts: [
        { address: opts.pool, role: AccountRole.WRITABLE },
        {
          address: opts.commissioner.address,
          role: AccountRole.WRITABLE_SIGNER,
          signer: opts.commissioner,
        },
        ...opts.memberPdas.map((m) => ({ address: m, role: AccountRole.READONLY })),
      ],
      data: coder.instruction.encode("post_payout_sheet", {
        assignments: opts.assignments.map((a) => ({
          slot_idx: a.slot_idx,
          member: new PublicKey(a.member),
        })),
      }),
    };
  }

  function claimPrizeIx(opts: {
    pool: Address;
    wallet: any;
    vault: Address;
    walletAta: Address;
    slotIdx: number;
  }) {
    return {
      programAddress,
      accounts: [
        { address: opts.pool, role: AccountRole.WRITABLE },
        {
          address: opts.wallet.address,
          role: AccountRole.WRITABLE_SIGNER,
          signer: opts.wallet,
        },
        { address: opts.vault, role: AccountRole.WRITABLE },
        { address: opts.walletAta, role: AccountRole.WRITABLE },
        { address: tokenProgram, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("claim_prize", { slot_idx: opts.slotIdx }),
    };
  }

  function submitPickIx(opts: {
    pool: Address;
    member: Address;
    wallet: any;
    team: number;
    note?: string;
  }) {
    return {
      programAddress,
      accounts: [
        { address: opts.pool, role: AccountRole.READONLY },
        { address: opts.member, role: AccountRole.WRITABLE },
        {
          address: opts.wallet.address,
          role: AccountRole.WRITABLE_SIGNER,
          signer: opts.wallet,
        },
      ],
      data: coder.instruction.encode("submit_pick", {
        team: opts.team,
        note: opts.note ?? "",
      }),
    };
  }

  function postResultsIx(opts: {
    pool: Address;
    commissioner: any;
    week: number;
    winners: number;
    pushes: number;
  }) {
    return {
      programAddress,
      accounts: [
        { address: opts.pool, role: AccountRole.WRITABLE },
        {
          address: opts.commissioner.address,
          role: AccountRole.WRITABLE_SIGNER,
          signer: opts.commissioner,
        },
      ],
      data: coder.instruction.encode("post_results", {
        week: opts.week,
        winners: opts.winners,
        pushes: opts.pushes,
        root: Array(32).fill(0),
      }),
    };
  }

  function settleMemberIx(pool: Address, member: Address) {
    return {
      programAddress,
      accounts: [
        { address: pool, role: AccountRole.WRITABLE },
        { address: member, role: AccountRole.WRITABLE },
      ],
      data: coder.instruction.encode("settle_member", { _points: 0 }),
    };
  }

  function advanceWeekIx(pool: Address, vault: Address) {
    return {
      programAddress,
      accounts: [
        { address: pool, role: AccountRole.WRITABLE },
        { address: vault, role: AccountRole.WRITABLE },
        { address: treasuryAta, role: AccountRole.WRITABLE },
        { address: tokenProgram, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("advance_week", {}),
    };
  }

  function claimPotIx(opts: {
    pool: Address;
    member: Address;
    wallet: any;
    vault: Address;
    memberAta: Address;
  }) {
    return {
      programAddress,
      accounts: [
        { address: opts.pool, role: AccountRole.WRITABLE },
        { address: opts.member, role: AccountRole.WRITABLE },
        {
          address: opts.wallet.address,
          role: AccountRole.WRITABLE_SIGNER,
          signer: opts.wallet,
        },
        { address: opts.vault, role: AccountRole.WRITABLE },
        { address: opts.memberAta, role: AccountRole.WRITABLE },
        { address: tokenProgram, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("claim_pot", {}),
    };
  }

  before(async () => {
    svm = new LiteSVM()
      .withSysvars()
      .withBuiltins()
      .withTransactionHistory(0n)
      .withLogBytesLimit(256n * 1024n);

    svm.addProgramFromFile(programAddress, "target/deploy/workspace.so");

    now = Math.floor(Date.now() / 1000);
    const clock = svm.getClock();
    clock.unixTimestamp = BigInt(now);
    svm.setClock(clock);

    admin = await generateKeyPairSigner();
    treasury = await generateKeyPairSigner();
    svm.airdrop(admin.address, lamports(500n * 1_000_000_000n));

    putMint(CANONICAL_USDC, admin.address);
    putMint(WRONG_MINT, admin.address);
    treasuryAta = await ata(treasury.address, CANONICAL_USDC);
    putTokenAccount(treasuryAta, CANONICAL_USDC, treasury.address, 0n);

    [configPDA] = await getProgramDerivedAddress({
      programAddress,
      seeds: [new TextEncoder().encode("config")],
    });

    const data = coder.instruction.encode("init_config", {
      fee_bps: 250,
      fee_cap: new BN(50_000_000),
      creation_fee: new BN(0),
    });

    await sendIx(
      {
        programAddress,
        accounts: [
          { address: configPDA, role: AccountRole.WRITABLE },
          { address: admin.address, role: AccountRole.WRITABLE_SIGNER, signer: admin },
          { address: treasury.address, role: AccountRole.READONLY },
          { address: systemProgram, role: AccountRole.READONLY },
        ],
        data,
      },
      admin
    );
  });

  it("init_config seeds the global config", () => {
    const config = fetchAccount<any>("Config", configPDA);
    expect(config.default_fee_bps).to.equal(250);
    expect(Number(config.default_fee_cap)).to.equal(50_000_000);
    expect(config.paused).to.be.false;
    expect(toAddressString(config.admin)).to.equal(admin.address);
    expect(toAddressString(config.fee_treasury)).to.equal(treasury.address);

    const raw = svm.getAccount(configPDA);
    expect(raw!.data.length).to.equal(CONFIG_LEN);
  });

  it("create_pool opens a survivor pool and its vault", async () => {
    const commissioner = await generateKeyPairSigner();
    svm.airdrop(commissioner.address, lamports(500n * 1_000_000_000n));

    const { ix, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(1),
      mint: CANONICAL_USDC,
      buyIn: BUY_IN,
    });
    await sendIx(ix, commissioner);

    const decoded = fetchAccount<any>("Pool", pool);
    expect(decoded.status).to.equal(0);
    expect(decoded.pool_type).to.equal(POOL_SURVIVOR);
    expect(decoded.max_members).to.equal(50);
    expect(decoded.start_week).to.equal(1);
    expect(decoded.current_week).to.equal(1);
    expect(decoded.member_count).to.equal(0);
    expect(decoded.buy_in.toString()).to.equal(BUY_IN.toString());
    expect(decoded.fee_bps).to.equal(250);
    expect(toAddressString(decoded.commissioner)).to.equal(commissioner.address);
    expect(toAddressString(decoded.usdc_mint)).to.equal(CANONICAL_USDC);
    expect(toAddressString(decoded.vault)).to.equal(vault);
    expect(tokenAmount(vault)).to.equal(0n);
  });

  it("Pool occupies exactly 1616 bytes on chain", async () => {
    const commissioner = await generateKeyPairSigner();
    svm.airdrop(commissioner.address, lamports(500n * 1_000_000_000n));

    const { ix, pool } = await createPoolIx({
      commissioner,
      nonce: new BN(2),
      mint: CANONICAL_USDC,
      buyIn: 0n,
    });
    await sendIx(ix, commissioner);

    const acc = svm.getAccount(pool);
    expect(acc).to.not.be.null;
    expect(acc!.data.length).to.equal(POOL_LEN);
  });

  it("join_pool enrols a member and moves the buy-in into the vault", async () => {
    const commissioner = await generateKeyPairSigner();
    const wallet = await generateKeyPairSigner();
    svm.airdrop(commissioner.address, lamports(500n * 1_000_000_000n));
    svm.airdrop(wallet.address, lamports(500n * 1_000_000_000n));

    const { ix: createIx, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(3),
      mint: CANONICAL_USDC,
      buyIn: BUY_IN,
    });
    await sendIx(createIx, commissioner);

    const payerAta = await ata(wallet.address, CANONICAL_USDC);
    putTokenAccount(payerAta, CANONICAL_USDC, wallet.address, 100_000_000n);

    const member = await memberPda(pool, wallet.address);
    const data = coder.instruction.encode("join_pool", { display_name: "Dana" });

    await sendIx(
      {
        programAddress,
        accounts: [
          { address: pool, role: AccountRole.WRITABLE },
          { address: member, role: AccountRole.WRITABLE },
          { address: wallet.address, role: AccountRole.WRITABLE_SIGNER, signer: wallet },
          { address: payerAta, role: AccountRole.WRITABLE },
          { address: vault, role: AccountRole.WRITABLE },
          { address: tokenProgram, role: AccountRole.READONLY },
          { address: systemProgram, role: AccountRole.READONLY },
        ],
        data,
      },
      wallet
    );

    const decodedPool = fetchAccount<any>("Pool", pool);
    expect(decodedPool.member_count).to.equal(1);
    expect(decodedPool.paid_members).to.equal(1);
    expect(decodedPool.alive_count).to.equal(1);
    expect(decodedPool.total_dues.toString()).to.equal(BUY_IN.toString());

    const decodedMember = fetchAccount<any>("Member", member);
    expect(decodedMember.paid).to.be.true;
    expect(decodedMember.current_pick).to.equal(255);
    expect(toAddressString(decodedMember.wallet)).to.equal(wallet.address);
    expect(toAddressString(decodedMember.pool)).to.equal(pool);
    expect(svm.getAccount(member)!.data.length).to.equal(MEMBER_LEN);

    expect(tokenAmount(vault)).to.equal(BUY_IN);
    expect(tokenAmount(payerAta)).to.equal(100_000_000n - BUY_IN);
  });

  it("create_pool rejects a mint that is not canonical USDC", async () => {
    const commissioner = await generateKeyPairSigner();
    svm.airdrop(commissioner.address, lamports(500n * 1_000_000_000n));

    const { ix } = await createPoolIx({
      commissioner,
      nonce: new BN(4),
      mint: WRONG_MINT,
      buyIn: BUY_IN,
    });

    await expectFailure(ix, commissioner, "not the USDC mint");
  });

  it("reclaim_dues refuses to refund before the deadline", async () => {
    const commissioner = await generateKeyPairSigner();
    const wallet = await generateKeyPairSigner();
    svm.airdrop(commissioner.address, lamports(500n * 1_000_000_000n));
    svm.airdrop(wallet.address, lamports(500n * 1_000_000_000n));

    const { ix: createIx, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(5),
      mint: CANONICAL_USDC,
      buyIn: BUY_IN,
    });
    await sendIx(createIx, commissioner);

    const { member, walletAta } = await joinPool(
      pool,
      vault,
      wallet,
      "Early",
      100_000_000n
    );

    const deadline = Number(fetchAccount<any>("Pool", pool).refund_deadline_ts);
    expect(Number(svm.getClock().unixTimestamp)).to.be.lessThan(deadline);

    await expectFailure(
      reclaimDuesIx({ pool, member, wallet, vault, memberAta: walletAta }),
      wallet,
      "Refunds are not available yet"
    );

    expect(tokenAmount(vault)).to.equal(BUY_IN);
    expect(fetchAccount<any>("Pool", pool).status).to.equal(0);
  });

  it("reclaim_dues refunds every paid member once the deadline passes", async () => {
    const commissioner = await generateKeyPairSigner();
    const alice = await generateKeyPairSigner();
    const bob = await generateKeyPairSigner();
    for (const s of [commissioner, alice, bob]) {
      svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    }

    const { ix: createIx, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(6),
      mint: CANONICAL_USDC,
      buyIn: BUY_IN,
    });
    await sendIx(createIx, commissioner);

    const a = await joinPool(pool, vault, alice, "Alice", 100_000_000n);
    const b = await joinPool(pool, vault, bob, "Bob", 100_000_000n);

    expect(tokenAmount(vault)).to.equal(BUY_IN * 2n);

    const deadline = Number(fetchAccount<any>("Pool", pool).refund_deadline_ts);
    setClock(deadline + 1);

    try {
      await sendIx(
        reclaimDuesIx({ pool, member: a.member, wallet: alice, vault, memberAta: a.walletAta }),
        alice
      );

      const afterFirst = fetchAccount<any>("Pool", pool);
      expect(afterFirst.status).to.equal(5);
      expect(afterFirst.refund_per_member.toString()).to.equal(BUY_IN.toString());
      expect(tokenAmount(a.walletAta)).to.equal(100_000_000n);
      expect(tokenAmount(vault)).to.equal(BUY_IN);

      await sendIx(
        reclaimDuesIx({ pool, member: b.member, wallet: bob, vault, memberAta: b.walletAta }),
        bob
      );

      expect(tokenAmount(b.walletAta)).to.equal(100_000_000n);
      expect(tokenAmount(vault)).to.equal(0n);
      expect(fetchAccount<any>("Member", a.member).claimed).to.be.true;
      expect(fetchAccount<any>("Member", b.member).claimed).to.be.true;

      await expectFailure(
        reclaimDuesIx({ pool, member: a.member, wallet: alice, vault, memberAta: a.walletAta }),
        alice,
        "Already claimed"
      );
    } finally {
      setClock(now);
    }
  });

  it("claim_pot and member seeds are rejected on an unsettled pool", async () => {
    const commissioner = await generateKeyPairSigner();
    const alice = await generateKeyPairSigner();
    const bob = await generateKeyPairSigner();
    for (const s of [commissioner, alice, bob]) {
      svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    }

    const { ix: createIx, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(7),
      mint: CANONICAL_USDC,
      buyIn: BUY_IN,
    });
    await sendIx(createIx, commissioner);

    const a = await joinPool(pool, vault, alice, "Alice", 100_000_000n);
    const b = await joinPool(pool, vault, bob, "Bob", 100_000_000n);

    await expectFailure(
      claimPotIx({ pool, member: a.member, wallet: alice, vault, memberAta: a.walletAta }),
      alice,
      "This pool is not settled"
    );

    await expectFailure(
      claimPotIx({ pool, member: b.member, wallet: alice, vault, memberAta: a.walletAta }),
      alice,
      "ConstraintSeeds"
    );

    expect(tokenAmount(vault)).to.equal(BUY_IN * 2n);
  });

  // Fixed: reclaim_dues now refuses while a slot is PENDING or FINALIZED, and
  // the block lifts PRIZE_CLAIM_GRACE_SECS after the refund deadline.
  it("reclaim_dues must not drain a League vault that still owes a finalized prize", async () => {
    const commissioner = await generateKeyPairSigner();
    const alice = await generateKeyPairSigner();
    const bob = await generateKeyPairSigner();
    for (const s of [commissioner, alice, bob]) {
      svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    }

    const duesDeadline = now + 3_600;
    const refundDeadline = now + 200_000;

    const { ix: createIx, pool, vault } = await createLeaguePoolIx({
      commissioner,
      nonce: new BN(8),
      buyIn: BUY_IN,
      duesDeadline,
      refundDeadline,
    });
    await sendIx(createIx, commissioner);

    const a = await joinPool(pool, vault, alice, "Alice", 100_000_000n);
    const b = await joinPool(pool, vault, bob, "Bob", 100_000_000n);
    expect(tokenAmount(vault)).to.equal(BUY_IN * 2n);

    try {
      setClock(duesDeadline + 1);
      await sendIx(crankIx("lock_dues", pool), commissioner);
      expect(fetchAccount<any>("Pool", pool).status).to.equal(STATUS_LOCKED);

      await sendIx(
        postPayoutSheetIx({
          pool,
          commissioner,
          assignments: [{ slot_idx: 0, member: alice.address }],
          memberPdas: [a.member],
        }),
        commissioner
      );
      expect(fetchAccount<any>("Pool", pool).status).to.equal(STATUS_SHEET_POSTED);

      setClock(duesDeadline + 1 + MIN_DISPUTE_WINDOW + 1);
      await sendIx(crankIx("finalize_sheet", pool), commissioner);

      const finalized = fetchAccount<any>("Pool", pool);
      expect(finalized.status).to.equal(STATUS_SHEET_FINALIZED);
      expect(finalized.prize_slots[0].state).to.equal(SLOT_FINALIZED);
      expect(toAddressString(finalized.prize_slots[0].assignee)).to.equal(alice.address);

      setClock(refundDeadline + 1);

      await expectFailure(
        reclaimDuesIx({ pool, member: b.member, wallet: bob, vault, memberAta: b.walletAta }),
        bob,
        "Refunds are not available yet"
      );

      // Nothing moved, and the pool did not flip to Abandoned.
      expect(tokenAmount(vault)).to.equal(BUY_IN * 2n);
      expect(tokenAmount(b.walletAta)).to.equal(100_000_000n - BUY_IN);
      const untouched = fetchAccount<any>("Pool", pool);
      expect(untouched.status).to.equal(STATUS_SHEET_FINALIZED);
      expect(untouched.refund_per_member.toString()).to.equal("0");

      // The block lifts 30 days after the deadline, so an unclaimed prize
      // cannot strand the vault. Simulated, not sent, to keep the fixture.
      setClock(refundDeadline + PRIZE_CLAIM_GRACE + 1);
      await expectSimOk(
        reclaimDuesIx({ pool, member: b.member, wallet: bob, vault, memberAta: b.walletAta }),
        bob
      );
      setClock(refundDeadline + 1);

      // The assignee is paid in full.
      await sendIx(
        claimPrizeIx({ pool, wallet: alice, vault, walletAta: a.walletAta, slotIdx: 0 }),
        alice
      );

      expect(tokenAmount(a.walletAta)).to.equal(100_000_000n - BUY_IN + BUY_IN * 2n);
      expect(tokenAmount(vault)).to.equal(0n);
      const claimed = fetchAccount<any>("Pool", pool);
      expect(claimed.prize_slots[0].state).to.equal(SLOT_CLAIMED);
      expect(claimed.claimed_bps).to.equal(10_000);
    } finally {
      setClock(now);
    }
  });

  it("submit_pick records a pick, and rejects bad teams and locked weeks", async () => {
    const commissioner = await generateKeyPairSigner();
    const alice = await generateKeyPairSigner();
    for (const s of [commissioner, alice]) {
      svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    }

    const { ix: createIx, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(9),
      mint: CANONICAL_USDC,
      buyIn: BUY_IN,
    });
    await sendIx(createIx, commissioner);

    const a = await joinPool(pool, vault, alice, "Alice", 100_000_000n);

    await sendIx(
      submitPickIx({ pool, member: a.member, wallet: alice, team: 5, note: "gut call" }),
      alice
    );

    const picked = fetchAccount<any>("Member", a.member);
    expect(picked.current_pick).to.equal(5);
    expect(picked.pick_week).to.equal(1);
    expect(picked.used_mask).to.equal(0);

    await expectFailure(
      submitPickIx({ pool, member: a.member, wallet: alice, team: 32 }),
      alice,
      "That is not a valid team"
    );

    const week1Lock = Number(fetchAccount<any>("Pool", pool).lock_ts[0]);
    try {
      setClock(week1Lock + 1);
      await expectFailure(
        submitPickIx({ pool, member: a.member, wallet: alice, team: 6 }),
        alice,
        "Picks are locked for this week"
      );
    } finally {
      setClock(now);
    }

    expect(fetchAccount<any>("Member", a.member).current_pick).to.equal(5);
  });

  it("survivor week 1 eliminates the wrong pick and advances the pool to week 2", async () => {
    const commissioner = await generateKeyPairSigner();
    const alice = await generateKeyPairSigner();
    const bob = await generateKeyPairSigner();
    const carol = await generateKeyPairSigner();
    for (const s of [commissioner, alice, bob, carol]) {
      svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    }

    // A 48h dispute window does not fit inside a 7-day gap by accident: with the
    // default 1-day spacing, finalizing week 1 lands past week 2's lock.
    const WEEK = 7 * 86_400;
    const { ix: createIx, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(10),
      mint: CANONICAL_USDC,
      buyIn: BUY_IN,
      spacing: WEEK,
    });
    await sendIx(createIx, commissioner);

    const a = await joinPool(pool, vault, alice, "Alice", 100_000_000n);
    const b = await joinPool(pool, vault, bob, "Bob", 100_000_000n);
    const c = await joinPool(pool, vault, carol, "Carol", 100_000_000n);
    expect(tokenAmount(vault)).to.equal(BUY_IN * 3n);

    try {
      await sendIx(submitPickIx({ pool, member: a.member, wallet: alice, team: 5 }), alice);
      await sendIx(submitPickIx({ pool, member: b.member, wallet: bob, team: 9 }), bob);
      await sendIx(submitPickIx({ pool, member: c.member, wallet: carol, team: 7 }), carol);

      const week1Lock = now + WEEK;
      setClock(week1Lock + 3 * 3_600 + 1);
      await sendIx(
        postResultsIx({
          pool,
          commissioner,
          week: 1,
          winners: (1 << 5) | (1 << 7),
          pushes: 0,
        }),
        commissioner
      );
      expect(fetchAccount<any>("Pool", pool).status).to.equal(2);

      setClock(week1Lock + 3 * 3_600 + 1 + 48 * 3_600 + 1);
      await sendIx(crankIx("finalize_week", pool), commissioner);

      const finalized = fetchAccount<any>("Pool", pool);
      expect(finalized.status).to.equal(3);
      expect(finalized.finalized_week).to.equal(1);
      expect(finalized.alive_at_week_start).to.equal(3);
      expect(finalized.processed_this_week).to.equal(0);

      for (const m of [a.member, b.member, c.member]) {
        await sendIx(settleMemberIx(pool, m), commissioner);
      }

      const aliceAfter = fetchAccount<any>("Member", a.member);
      expect(aliceAfter.eliminated_week).to.equal(0);
      expect(aliceAfter.used_mask).to.equal(1 << 5);
      expect(aliceAfter.current_pick).to.equal(255);
      expect(aliceAfter.processed_week).to.equal(1);

      const bobAfter = fetchAccount<any>("Member", b.member);
      expect(bobAfter.eliminated_week).to.equal(1);
      expect(bobAfter.used_mask).to.equal(0);

      expect(fetchAccount<any>("Member", c.member).used_mask).to.equal(1 << 7);

      const settled = fetchAccount<any>("Pool", pool);
      expect(settled.alive_count).to.equal(2);
      expect(settled.processed_this_week).to.equal(3);

      await sendIx(advanceWeekIx(pool, vault), commissioner);
      const advanced = fetchAccount<any>("Pool", pool);
      expect(advanced.status).to.equal(STATUS_LOCKED);
      expect(advanced.current_week).to.equal(2);
      expect(tokenAmount(vault)).to.equal(BUY_IN * 3n);

      // Week 2 is open for picks, but team 5 is spent for Alice.
      await expectFailure(
        submitPickIx({ pool, member: a.member, wallet: alice, team: 5 }),
        alice,
        "You have already used that team this season"
      );

      await sendIx(submitPickIx({ pool, member: a.member, wallet: alice, team: 6 }), alice);
      const week2 = fetchAccount<any>("Member", a.member);
      expect(week2.current_pick).to.equal(6);
      expect(week2.pick_week).to.equal(2);

      await expectFailure(
        submitPickIx({ pool, member: b.member, wallet: bob, team: 3 }),
        bob,
        "You are out of this pool"
      );
    } finally {
      setClock(now);
    }
  });

  it("a last survivor settles the pool and claim_pot pays the whole net pot", async () => {
    const commissioner = await generateKeyPairSigner();
    const alice = await generateKeyPairSigner();
    const bob = await generateKeyPairSigner();
    for (const s of [commissioner, alice, bob]) {
      svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    }

    const WEEK = 7 * 86_400;
    const { ix: createIx, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(11),
      mint: CANONICAL_USDC,
      buyIn: BUY_IN,
      spacing: WEEK,
    });
    await sendIx(createIx, commissioner);

    const a = await joinPool(pool, vault, alice, "Alice", 100_000_000n);
    const b = await joinPool(pool, vault, bob, "Bob", 100_000_000n);

    const gross = BUY_IN * 2n;
    const fee = (gross * FEE_BPS) / 10_000n;
    const net = gross - fee;
    expect(tokenAmount(vault)).to.equal(gross);

    try {
      await sendIx(submitPickIx({ pool, member: a.member, wallet: alice, team: 5 }), alice);
      await sendIx(submitPickIx({ pool, member: b.member, wallet: bob, team: 9 }), bob);

      const lock = now + WEEK;
      setClock(lock + 3 * 3_600 + 1);
      await sendIx(
        postResultsIx({ pool, commissioner, week: 1, winners: 1 << 5, pushes: 0 }),
        commissioner
      );

      setClock(lock + 3 * 3_600 + 1 + 48 * 3_600 + 1);
      await sendIx(crankIx("finalize_week", pool), commissioner);

      for (const m of [a.member, b.member]) {
        await sendIx(settleMemberIx(pool, m), commissioner);
      }

      const beforeAdvance = fetchAccount<any>("Pool", pool);
      expect(beforeAdvance.alive_count).to.equal(1);
      expect(beforeAdvance.processed_this_week).to.equal(2);
      const tBefore = tokenAmount(treasuryAta);

      await sendIx(advanceWeekIx(pool, vault), commissioner);

      const settled = fetchAccount<any>("Pool", pool);
      expect(settled.status).to.equal(STATUS_SETTLED);
      expect(settled.winners_week).to.equal(WEEK_NONE);
      expect(settled.winners_count).to.equal(1);
      expect(settled.pot_per_winner.toString()).to.equal(net.toString());
      expect(tokenAmount(treasuryAta) - tBefore).to.equal(fee);

      await sendIx(
        claimPotIx({ pool, member: a.member, wallet: alice, vault, memberAta: a.walletAta }),
        alice
      );

      expect(tokenAmount(a.walletAta)).to.equal(100_000_000n - BUY_IN + net);
      expect(fetchAccount<any>("Member", a.member).claimed).to.be.true;

      expect(tokenAmount(vault)).to.equal(0n);

      await expectFailure(
        claimPotIx({ pool, member: b.member, wallet: bob, vault, memberAta: b.walletAta }),
        bob,
        "You did not win this pool"
      );

      await expectFailure(
        claimPotIx({ pool, member: a.member, wallet: alice, vault, memberAta: a.walletAta }),
        alice,
        "Already claimed"
      );

      expect(tokenAmount(vault)).to.equal(0n);
    } finally {
      setClock(now);
    }
  });

  it("a wipeout week makes co-winners of everyone alive at week start", async () => {
    const commissioner = await generateKeyPairSigner();
    const alice = await generateKeyPairSigner();
    const bob = await generateKeyPairSigner();
    for (const s of [commissioner, alice, bob]) {
      svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    }

    const WEEK = 7 * 86_400;
    const { ix: createIx, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(12),
      mint: CANONICAL_USDC,
      buyIn: BUY_IN,
      spacing: WEEK,
    });
    await sendIx(createIx, commissioner);

    const a = await joinPool(pool, vault, alice, "Alice", 100_000_000n);
    const b = await joinPool(pool, vault, bob, "Bob", 100_000_000n);

    const gross = BUY_IN * 2n;
    const fee = (gross * FEE_BPS) / 10_000n;
    const share = (gross - fee) / 2n;

    try {
      await sendIx(submitPickIx({ pool, member: a.member, wallet: alice, team: 5 }), alice);
      await sendIx(submitPickIx({ pool, member: b.member, wallet: bob, team: 9 }), bob);

      const lock = now + WEEK;
      setClock(lock + 3 * 3_600 + 1);
      await sendIx(
        postResultsIx({ pool, commissioner, week: 1, winners: 1 << 7, pushes: 0 }),
        commissioner
      );

      setClock(lock + 3 * 3_600 + 1 + 48 * 3_600 + 1);
      await sendIx(crankIx("finalize_week", pool), commissioner);

      const finalized = fetchAccount<any>("Pool", pool);
      expect(finalized.alive_at_week_start).to.equal(2);

      for (const m of [a.member, b.member]) {
        await sendIx(settleMemberIx(pool, m), commissioner);
      }

      const wiped = fetchAccount<any>("Pool", pool);
      expect(wiped.alive_count).to.equal(0);
      expect(fetchAccount<any>("Member", a.member).eliminated_week).to.equal(1);
      expect(fetchAccount<any>("Member", b.member).eliminated_week).to.equal(1);
      const tBefore = tokenAmount(treasuryAta);

      await sendIx(advanceWeekIx(pool, vault), commissioner);

      const settled = fetchAccount<any>("Pool", pool);
      expect(settled.status).to.equal(STATUS_SETTLED);
      expect(settled.winners_week).to.equal(1);
      expect(settled.winners_count).to.equal(2);
      expect(settled.pot_per_winner.toString()).to.equal(share.toString());

      await sendIx(
        claimPotIx({ pool, member: a.member, wallet: alice, vault, memberAta: a.walletAta }),
        alice
      );
      await sendIx(
        claimPotIx({ pool, member: b.member, wallet: bob, vault, memberAta: b.walletAta }),
        bob
      );

      expect(tokenAmount(a.walletAta)).to.equal(100_000_000n - BUY_IN + share);
      expect(tokenAmount(b.walletAta)).to.equal(100_000_000n - BUY_IN + share);
      expect(tokenAmount(vault)).to.equal(0n);
      expect(tokenAmount(treasuryAta) - tBefore).to.equal(fee);
    } finally {
      setClock(now);
    }
  });

  it("post_results and finalize_week hold their timing windows to the second", async () => {
    const commissioner = await generateKeyPairSigner();
    const alice = await generateKeyPairSigner();
    for (const s of [commissioner, alice]) {
      svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    }

    const WEEK = 7 * 86_400;
    const { ix: createIx, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(13),
      mint: CANONICAL_USDC,
      buyIn: BUY_IN,
      spacing: WEEK,
    });
    await sendIx(createIx, commissioner);

    const a = await joinPool(pool, vault, alice, "Alice", 100_000_000n);

    try {
      await sendIx(submitPickIx({ pool, member: a.member, wallet: alice, team: 5 }), alice);

      const lock = now + WEEK;
      const results = postResultsIx({
        pool,
        commissioner,
        week: 1,
        winners: 1 << 5,
        pushes: 0,
      });

      // One second short of lock + 3h.
      setClock(lock + MIN_POST_DELAY - 1);
      await expectFailure(results, commissioner, "Too early");
      expect(fetchAccount<any>("Pool", pool).status).to.equal(STATUS_OPEN);

      // Exactly on the boundary is allowed - the guard is >=, not >.
      setClock(lock + MIN_POST_DELAY);
      await sendIx(results, commissioner);

      const posted = fetchAccount<any>("Pool", pool);
      expect(posted.status).to.equal(STATUS_RESULTS_POSTED);
      expect(posted.pending_week).to.equal(1);
      expect(Number(posted.pending_posted_ts)).to.equal(lock + MIN_POST_DELAY);

      // Same boundary behaviour on the dispute window.
      setClock(lock + MIN_POST_DELAY + DISPUTE_WINDOW - 1);
      await expectFailure(
        crankIx("finalize_week", pool),
        commissioner,
        "The dispute window is still open"
      );
      expect(fetchAccount<any>("Pool", pool).status).to.equal(STATUS_RESULTS_POSTED);

      setClock(lock + MIN_POST_DELAY + DISPUTE_WINDOW);
      await sendIx(crankIx("finalize_week", pool), commissioner);

      const finalized = fetchAccount<any>("Pool", pool);
      expect(finalized.status).to.equal(STATUS_FINALIZED);
      expect(finalized.finalized_week).to.equal(1);
      expect(finalized.results_posted[0]).to.be.true;
    } finally {
      setClock(now);
    }
  });

  it("a veto needs a strict majority, and each member gets exactly one vote", async () => {
    const commissioner = await generateKeyPairSigner();
    const alice = await generateKeyPairSigner();
    const bob = await generateKeyPairSigner();
    const carol = await generateKeyPairSigner();
    const dave = await generateKeyPairSigner();
    for (const s of [commissioner, alice, bob, carol, dave]) {
      svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    }

    const WEEK = 7 * 86_400;
    const { ix: createIx, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(14),
      mint: CANONICAL_USDC,
      buyIn: BUY_IN,
      spacing: WEEK,
    });
    await sendIx(createIx, commissioner);

    const a = await joinPool(pool, vault, alice, "Alice", 100_000_000n);
    const b = await joinPool(pool, vault, bob, "Bob", 100_000_000n);
    const c = await joinPool(pool, vault, carol, "Carol", 100_000_000n);
    await joinPool(pool, vault, dave, "Dave", 100_000_000n);

    expect(fetchAccount<any>("Pool", pool).alive_count).to.equal(4);

    try {
      const lock = now + WEEK;
      setClock(lock + MIN_POST_DELAY + 1);

      // A dishonest posting: team 5 did not actually win.
      await sendIx(
        postResultsIx({ pool, commissioner, week: 1, winners: 1 << 5, pushes: 0 }),
        commissioner
      );

      // 1 of 4.
      await sendIx(vetoResultsIx(pool, a.member, alice), alice);
      let state = fetchAccount<any>("Pool", pool);
      expect(state.status).to.equal(STATUS_RESULTS_POSTED);
      expect(Number(state.veto_count)).to.equal(1);
      expect(fetchAccount<any>("Member", a.member).vetoed_epoch).to.equal(1);

      // One vote each - a second attempt does not stack.
      await expectFailure(
        vetoResultsIx(pool, a.member, alice),
        alice,
        "You have already vetoed this posting"
      );
      expect(Number(fetchAccount<any>("Pool", pool).veto_count)).to.equal(1);

      // 2 of 4 is exactly half. The guard is 2 * votes > electorate, so a tie
      // leaves the posting standing - this is the off-by-one that matters.
      await sendIx(vetoResultsIx(pool, b.member, bob), bob);
      state = fetchAccount<any>("Pool", pool);
      expect(Number(state.veto_count)).to.equal(2);
      expect(state.status).to.equal(STATUS_RESULTS_POSTED);
      expect(state.pending_week).to.equal(1);
      expect(state.pending_winners).to.equal(1 << 5);

      // 3 of 4 clears it.
      await sendIx(vetoResultsIx(pool, c.member, carol), carol);
      const cleared = fetchAccount<any>("Pool", pool);
      expect(cleared.status).to.equal(STATUS_LOCKED);
      expect(Number(cleared.veto_count)).to.equal(0);
      expect(cleared.pending_week).to.equal(WEEK_NONE);
      expect(cleared.pending_winners).to.equal(0);
      expect(cleared.pending_pushes).to.equal(0);
      expect(cleared.results_posted[0]).to.be.false;
      expect(cleared.finalized_week).to.equal(WEEK_NONE);

      // Nothing survives for finalize_week to act on.
      setClock(lock + MIN_POST_DELAY + DISPUTE_WINDOW + 1);
      await expectFailure(
        crankIx("finalize_week", pool),
        commissioner,
        "There are no pending results"
      );
    } finally {
      setClock(now);
    }
  });

  it("a vetoed week can be re-posted", async () => {
    const commissioner = await generateKeyPairSigner();
    const alice = await generateKeyPairSigner();
    const bob = await generateKeyPairSigner();
    for (const s of [commissioner, alice, bob]) {
      svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    }

    const WEEK = 7 * 86_400;
    const { ix: createIx, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(15),
      mint: CANONICAL_USDC,
      buyIn: BUY_IN,
      spacing: WEEK,
    });
    await sendIx(createIx, commissioner);

    const a = await joinPool(pool, vault, alice, "Alice", 100_000_000n);
    const b = await joinPool(pool, vault, bob, "Bob", 100_000_000n);

    try {
      const lock = now + WEEK;
      setClock(lock + MIN_POST_DELAY + 1);

      // Bad posting, cleared 2 of 2.
      await sendIx(
        postResultsIx({ pool, commissioner, week: 1, winners: 1 << 30, pushes: 0 }),
        commissioner
      );
      await sendIx(vetoResultsIx(pool, a.member, alice), alice);
      await sendIx(vetoResultsIx(pool, b.member, bob), bob);
      expect(fetchAccount<any>("Pool", pool).status).to.equal(STATUS_LOCKED);

      setClock(lock + MIN_POST_DELAY + 600);
      await sendIx(
        postResultsIx({
          pool,
          commissioner,
          week: 1,
          winners: (1 << 5) | (1 << 7),
          pushes: 1 << 9,
        }),
        commissioner
      );
      const rp = fetchAccount<any>("Pool", pool);
      expect(rp.status).to.equal(STATUS_RESULTS_POSTED);
    } finally {
      setClock(now);
    }
  });
});
