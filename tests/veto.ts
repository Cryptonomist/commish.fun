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
import fs from "fs";
import path from "path";

describe("commish veto epochs - LiteSVM", () => {
  const idl = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "target/idl/commish.json"), "utf8")
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
  const STATUS_LOCKED = 1;
  const STATUS_RESULTS_POSTED = 2;
  const MIN_POST_DELAY = 3 * 60 * 60;
  const DISPUTE_WINDOW = 48 * 60 * 60;
  const WEEK_NONE = 0;
  const BUY_IN = 10_000_000n;

  let svm: LiteSVM;
  let admin: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  let treasury: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  let configPDA: Address;
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

  function fetchAccount<T>(name: string, addr: Address): T {
    const acc = svm.getAccount(addr);
    if (!acc || ("exists" in acc && !acc.exists)) {
      throw new Error(`Missing account ${name} at ${addr}`);
    }
    return coder.accounts.decode(name, Buffer.from(acc.data)) as T;
  }

  function setClock(ts: number) {
    const clock = svm.getClock();
    clock.unixTimestamp = BigInt(ts);
    svm.setClock(clock);
  }

  function lockSchedule(base: number, spacing: number): BN[] {
    return Array.from({ length: WEEKS }, (_, i) => new BN(base + (i + 1) * spacing));
  }

  async function createPoolIx(opts: {
    commissioner: any;
    nonce: BN;
    spacing: number;
    disputeWindow?: number;
  }) {
    const pool = await poolPda(opts.commissioner.address, opts.nonce);
    const vault = await ata(pool, CANONICAL_USDC);
    const locks = lockSchedule(now, opts.spacing);

    const data = coder.instruction.encode("create_pool", {
      nonce: opts.nonce,
      name: "Veto Survivor",
      pool_type: POOL_SURVIVOR,
      buy_in: new BN(BUY_IN.toString()),
      max_members: 50,
      start_week: 1,
      lock_ts: locks,
      dues_deadline_ts: new BN(0),
      refund_deadline_ts: locks[WEEKS - 1].addn(86_400),
      prize_slots: [],
      weekly_pot_bps: 0,
      dispute_window_secs: opts.disputeWindow ?? DISPUTE_WINDOW,
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

  async function joinPool(pool: Address, vault: Address, wallet: any, displayName: string) {
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
        data: coder.instruction.encode("join_pool", { display_name: displayName }),
      },
      wallet
    );

    return { member, walletAta };
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

  function crankIx(name: string, pool: Address) {
    return {
      programAddress,
      accounts: [{ address: pool, role: AccountRole.WRITABLE }],
      data: coder.instruction.encode(name, {}),
    };
  }

  before(async () => {
    svm = new LiteSVM()
      .withSysvars()
      .withBuiltins()
      .withTransactionHistory(0n)
      .withLogBytesLimit(256n * 1024n);

    svm.addProgramFromFile(programAddress, "target/deploy/commish.so");

    now = Math.floor(Date.now() / 1000);
    setClock(now);

    admin = await generateKeyPairSigner();
    treasury = await generateKeyPairSigner();
    svm.airdrop(admin.address, lamports(500n * 1_000_000_000n));
    putMint(CANONICAL_USDC, admin.address);

    [configPDA] = await getProgramDerivedAddress({
      programAddress,
      seeds: [new TextEncoder().encode("config")],
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
        data: coder.instruction.encode("init_config", {
          fee_bps: 250,
          fee_cap: new BN(50_000_000),
          creation_fee: new BN(0),
        }),
      },
      admin
    );
  });

  it("the same electorate can veto a replacement posting", async () => {
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
      nonce: new BN(101),
      spacing: WEEK,
    });
    await sendIx(createIx, commissioner);

    const a = await joinPool(pool, vault, alice, "Alice");
    const b = await joinPool(pool, vault, bob, "Bob");
    const c = await joinPool(pool, vault, carol, "Carol");
    await joinPool(pool, vault, dave, "Dave");

    const lock = now + WEEK;
    setClock(lock + MIN_POST_DELAY + 1);

    const bad = postResultsIx({
      pool,
      commissioner,
      week: 1,
      winners: 1 << 30,
      pushes: 0,
    });

    // First posting: epoch 1, struck down 3 of 4.
    await sendIx(bad, commissioner);
    expect(Number(fetchAccount<any>("Pool", pool).veto_epoch)).to.equal(1);

    await sendIx(vetoResultsIx(pool, a.member, alice), alice);
    await sendIx(vetoResultsIx(pool, b.member, bob), bob);
    await sendIx(vetoResultsIx(pool, c.member, carol), carol);
    expect(fetchAccount<any>("Pool", pool).status).to.equal(STATUS_LOCKED);
    for (const m of [a.member, b.member, c.member]) {
      expect(Number(fetchAccount<any>("Member", m).vetoed_epoch)).to.equal(1);
    }

    // The commissioner re-posts the identical bad results. Under the old
    // week-based marker every one of those three was refused with
    // AlreadyVetoed, leaving Dave alone and no majority reachable.
    setClock(lock + MIN_POST_DELAY + 600);
    await sendIx(bad, commissioner);

    const reposted = fetchAccount<any>("Pool", pool);
    expect(reposted.status).to.equal(STATUS_RESULTS_POSTED);
    expect(Number(reposted.veto_epoch)).to.equal(2);
    expect(Number(reposted.veto_count)).to.equal(0);

    await sendIx(vetoResultsIx(pool, a.member, alice), alice);
    await sendIx(vetoResultsIx(pool, b.member, bob), bob);
    expect(Number(fetchAccount<any>("Pool", pool).veto_count)).to.equal(2);
    expect(fetchAccount<any>("Pool", pool).status).to.equal(STATUS_RESULTS_POSTED);

    await sendIx(vetoResultsIx(pool, c.member, carol), carol);
    const cleared = fetchAccount<any>("Pool", pool);
    expect(cleared.status).to.equal(STATUS_LOCKED);
    expect(cleared.pending_week).to.equal(WEEK_NONE);
    expect(cleared.pending_winners).to.equal(0);
    expect(cleared.results_posted[0]).to.be.false;
    expect(Number(cleared.veto_count)).to.equal(0);
    for (const m of [a.member, b.member, c.member]) {
      expect(Number(fetchAccount<any>("Member", m).vetoed_epoch)).to.equal(2);
    }

    // Still one vote per member within an epoch.
    setClock(lock + MIN_POST_DELAY + 1200);
    await sendIx(bad, commissioner);
    await sendIx(vetoResultsIx(pool, a.member, alice), alice);
    await expectFailure(
      vetoResultsIx(pool, a.member, alice),
      alice,
      "You have already vetoed this posting"
    );
    expect(Number(fetchAccount<any>("Pool", pool).veto_count)).to.equal(1);

    setClock(now);
  });

  it("a corrected posting finalizes once the window closes", async () => {
    const commissioner = await generateKeyPairSigner();
    const alice = await generateKeyPairSigner();
    const bob = await generateKeyPairSigner();
    for (const s of [commissioner, alice, bob]) {
      svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    }

    const WEEK = 7 * 86_400;
    const { ix: createIx, pool, vault } = await createPoolIx({
      commissioner,
      nonce: new BN(102),
      spacing: WEEK,
    });
    await sendIx(createIx, commissioner);

    const a = await joinPool(pool, vault, alice, "Alice");
    const b = await joinPool(pool, vault, bob, "Bob");

    const lock = now + WEEK;
    setClock(lock + MIN_POST_DELAY + 1);

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

    setClock(lock + MIN_POST_DELAY + 600 + DISPUTE_WINDOW + 1);
    await sendIx(crankIx("finalize_week", pool), commissioner);

    const finalized = fetchAccount<any>("Pool", pool);
    expect(finalized.finalized_week).to.equal(1);
    expect(finalized.winners[0]).to.equal((1 << 5) | (1 << 7));
    expect(finalized.pushes[0]).to.equal(1 << 9);
    expect(finalized.results_posted[0]).to.be.true;
    expect(Number(finalized.veto_count)).to.equal(0);

    setClock(now);
  });

  it("a schedule too tight for the dispute window names the window", async () => {
    const commissioner = await generateKeyPairSigner();
    svm.airdrop(commissioner.address, lamports(500n * 1_000_000_000n));

    // 50h apart, under the 3h + 48h a week needs to post and finalize.
    const { ix } = await createPoolIx({
      commissioner,
      nonce: new BN(103),
      spacing: 50 * 60 * 60,
    });
    await expectFailure(ix, commissioner, "dispute window");
  });
});
