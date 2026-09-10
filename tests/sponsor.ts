/* THE SPONSORED SEAT: one person pays, somebody else owns it.
 *
 * `sponsor_join` has been on mainnet since the first deploy and until this file
 * nothing had ever sent it — no test, no script, no screen. It is the strongest
 * answer this product has to onboarding: a commissioner's friends are on phones
 * without wallets, and every route into USDC costs them an identity check, a
 * minimum and a second currency for rent. A sponsored seat skips all of it.
 *
 * Which makes the thing worth proving the opposite of convenience. A seat that
 * one wallet paid for and another wallet owns is exactly the shape where the
 * money could quietly flow back to the payer — and a commissioner holding the
 * pot is the one failure this whole program exists to remove. So these prove,
 * against the production binary:
 *
 *   - the buy-in leaves the commissioner and the seat belongs to the friend,
 *     who needs no SOL and no USDC and need never have transacted at all;
 *   - only the pool's commissioner can sponsor, so a roster cannot be stuffed
 *     from outside;
 *   - the friend, and never the sponsor, picks for the seat;
 *   - a sponsored winner is paid into THEIR OWN token account, and the sponsor
 *     can neither claim it nor redirect it;
 *   - the deadman refunds the seat's owner, not whoever paid for it;
 *   - a seat cannot be sponsored twice, joined on top of, or bought after the
 *     pool has locked or filled.
 *
 * Self-contained, like deadman.ts and oracle.ts. Production timing throughout.
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

describe("commish sponsored seats - LiteSVM", () => {
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
  const STATUS_OPEN = 0;
  const STATUS_SETTLED = 4;
  const STATUS_ABANDONED = 5;

  const HOUR = 3_600;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MIN_POST_DELAY = 3 * HOUR;
  const DISPUTE_WINDOW = 48 * HOUR;
  const REFUND_MARGIN = DAY;
  const SETTLE_ROOM = MIN_POST_DELAY + DISPUTE_WINDOW + REFUND_MARGIN;
  const BUY_IN = 10_000_000n;
  const COMMISSIONER_FUNDS = 100_000_000n;

  type Signer = Awaited<ReturnType<typeof generateKeyPairSigner>>;

  let svm: LiteSVM;
  let admin: Signer;
  let treasury: Signer;
  let configPDA: Address;
  let treasuryAta: Address;
  let now: number;
  let nonce = 300;

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

  /** SOL held by an address, and 0 for one that has never been funded. */
  function solOf(addr: Address): bigint {
    const acc = svm.getAccount(addr);
    if (!acc || ("exists" in acc && !(acc as any).exists)) return 0n;
    return BigInt((acc as any).lamports ?? 0);
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

  const b58 = (v: any): string =>
    typeof v === "string" ? v : new PublicKey(v).toBase58();

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

  async function createPool(
    commissioner: Signer,
    opts: { buyIn?: bigint; startWeek?: number; maxMembers?: number } = {},
  ) {
    const n = new BN(nonce++);
    const pool = await poolPda(commissioner.address, n);
    const vault = await ata(pool, CANONICAL_USDC);
    await sendIx(
      {
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
          name: "Sponsored Survivor",
          pool_type: POOL_SURVIVOR,
          buy_in: new BN((opts.buyIn ?? BUY_IN).toString()),
          max_members: opts.maxMembers ?? 50,
          start_week: opts.startWeek ?? WEEKS,
          lock_ts: lockSchedule(now),
          dues_deadline_ts: new BN(0),
          refund_deadline_ts: new BN(lastLock() + SETTLE_ROOM),
          prize_slots: [],
          weekly_pot_bps: 0,
          dispute_window_secs: DISPUTE_WINDOW,
        }),
      },
      commissioner,
    );
    // The commissioner holds the USDC that will buy the seats.
    const commissionerAta = await ata(commissioner.address, CANONICAL_USDC);
    putTokenAccount(commissionerAta, CANONICAL_USDC, commissioner.address, COMMISSIONER_FUNDS);
    return { pool, vault, commissionerAta, refundDeadline: lastLock() + SETTLE_ROOM };
  }

  /* The instruction under test. `signer` is whoever claims to be the
   * commissioner; `payerAta` defaults to theirs. Both are parameters so the
   * refusals can be built by changing exactly one thing. */
  async function sponsorIx(opts: {
    pool: Address;
    vault: Address;
    signer: Signer;
    friend: Address;
    name?: string;
    payerAta?: Address;
  }) {
    const member = await memberPda(opts.pool, opts.friend);
    const payerAta = opts.payerAta ?? (await ata(opts.signer.address, CANONICAL_USDC));
    return {
      member,
      ix: {
        programAddress,
        accounts: [
          { address: opts.pool, role: AccountRole.WRITABLE },
          { address: member, role: AccountRole.WRITABLE },
          {
            address: opts.signer.address,
            role: AccountRole.WRITABLE_SIGNER,
            signer: opts.signer,
          },
          { address: payerAta, role: AccountRole.WRITABLE },
          { address: opts.vault, role: AccountRole.WRITABLE },
          { address: tokenProgram, role: AccountRole.READONLY },
          { address: systemProgram, role: AccountRole.READONLY },
        ],
        data: coder.instruction.encode("sponsor_join", {
          wallet: new PublicKey(opts.friend),
          display_name: opts.name ?? "Friend",
        }),
      },
    };
  }

  async function join(pool: Address, vault: Address, wallet: Signer, name: string) {
    const walletAta = await ata(wallet.address, CANONICAL_USDC);
    putTokenAccount(walletAta, CANONICAL_USDC, wallet.address, 100_000_000n);
    const member = await memberPda(pool, wallet.address);
    return {
      member,
      walletAta,
      ix: {
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
    };
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

  afterEach(() => {
    setClock(now);
    svm.expireBlockhash();
  });

  // ---------------------------------------------------------------- tests
  it("the buy-in leaves the commissioner and the seat belongs to the friend", async () => {
    const commissioner = await fundedSigner();
    const { pool, vault, commissionerAta } = await createPool(commissioner);

    /* A wallet that has never transacted: no SOL, no USDC, no token account,
     * no account of any kind. This is the person the instruction is for. */
    const friend = await generateKeyPairSigner();
    expect(solOf(friend.address)).to.equal(0n);

    const { ix, member } = await sponsorIx({
      pool,
      vault,
      signer: commissioner,
      friend: friend.address,
      name: "Dave",
    });
    await sendIx(ix, commissioner);

    // The money moved from the commissioner into the vault, and only there.
    expect(tokenAmount(commissionerAta)).to.equal(COMMISSIONER_FUNDS - BUY_IN);
    expect(tokenAmount(vault)).to.equal(BUY_IN);

    // The seat is the friend's, and it records who paid for it.
    const seat = fetchAccount<any>("Member", member);
    expect(b58(seat.wallet)).to.equal(friend.address);
    expect(b58(seat.sponsored_by)).to.equal(commissioner.address);
    expect(seat.paid).to.equal(true);
    expect(seat.claimed).to.equal(false);

    // The pool counts it as a paid member exactly like a normal join.
    const p = fetchAccount<any>("Pool", pool);
    expect(p.member_count).to.equal(1);
    expect(p.paid_members).to.equal(1);
    expect(p.total_dues.toString()).to.equal(BUY_IN.toString());
    expect(p.status).to.equal(STATUS_OPEN);

    // And the friend paid nothing at all, not even the rent on their own seat.
    expect(solOf(friend.address)).to.equal(0n);
  });

  it("only the pool's commissioner can sponsor a seat", async () => {
    const commissioner = await fundedSigner();
    const { pool, vault } = await createPool(commissioner);
    const stranger = await fundedSigner();
    const strangerAta = await ata(stranger.address, CANONICAL_USDC);
    putTokenAccount(strangerAta, CANONICAL_USDC, stranger.address, COMMISSIONER_FUNDS);
    const friend = await generateKeyPairSigner();

    /* A stranger with plenty of USDC, trying to buy a third party into
     * somebody else's pool. `has_one = commissioner` refuses it, which is what
     * keeps a roster from being stuffed from outside. */
    const { ix } = await sponsorIx({ pool, vault, signer: stranger, friend: friend.address });
    await expectFailure(ix, stranger, "ConstraintHasOne");
    expect(fetchAccount<any>("Pool", pool).member_count).to.equal(0);
  });

  it("the friend picks for the seat, and the sponsor cannot", async () => {
    const commissioner = await fundedSigner();
    const { pool, vault } = await createPool(commissioner);
    const friend = await generateKeyPairSigner();
    const { ix, member } = await sponsorIx({
      pool,
      vault,
      signer: commissioner,
      friend: friend.address,
    });
    await sendIx(ix, commissioner);

    /* The friend still holds no SOL. The commissioner pays the network fee and
     * the friend signs the pick — so a sponsored member can play the whole
     * season without ever buying a token, provided somebody covers the fee. */
    await sendIx(pickIx(pool, member, friend, 7), commissioner);
    expect(fetchAccount<any>("Member", member).current_pick).to.equal(7);
    expect(solOf(friend.address)).to.equal(0n);

    // The sponsor paid for the seat and still cannot touch it. The Member PDA
    // is derived from the friend's key, so a pick signed by anyone else
    // resolves to a different account and is refused.
    await expectFailure(pickIx(pool, member, commissioner, 9), commissioner, "ConstraintSeeds");
    expect(fetchAccount<any>("Member", member).current_pick).to.equal(7);
  });

  /* THE ONE THAT MATTERS. Removing the commissioner from custody is the whole
   * product, and a sponsored seat is where custody could leak back in. */
  it("a sponsored winner is paid into their own wallet, and the sponsor cannot claim it", async () => {
    const commissioner = await fundedSigner();
    const { pool, vault, commissionerAta } = await createPool(commissioner);

    const friend = await generateKeyPairSigner();
    const sponsored = await sponsorIx({ pool, vault, signer: commissioner, friend: friend.address });
    await sendIx(sponsored.ix, commissioner);

    // A second member who paid their own way, and who will lose.
    const bob = await fundedSigner();
    const b = await join(pool, vault, bob, "Bob");
    await sendIx(b.ix, bob);

    await sendIx(pickIx(pool, sponsored.member, friend, 5), commissioner);
    await sendIx(pickIx(pool, b.member, bob, 9), bob);

    const commissionerAfterBuying = tokenAmount(commissionerAta);
    expect(tokenAmount(vault)).to.equal(BUY_IN * 2n);

    // Week 18 is the only week this pool plays. Team 5 wins.
    setClock(lastLock() + MIN_POST_DELAY + 1);
    await sendIx(postResultsIx(pool, commissioner, WEEKS, 1 << 5), commissioner);
    setClock(lastLock() + MIN_POST_DELAY + DISPUTE_WINDOW + 2);
    await sendIx(crankIx("finalize_week", pool), commissioner);
    await sendIx(settleMemberIx(pool, sponsored.member), commissioner);
    await sendIx(settleMemberIx(pool, b.member), commissioner);
    await sendIx(advanceWeekIx(pool, vault), commissioner);
    expect(fetchAccount<any>("Pool", pool).status).to.equal(STATUS_SETTLED);

    /* The sponsor tries to take the pot for the seat they paid for. They
     * cannot sign for it: the Member PDA derives from the friend's key. */
    await expectFailure(
      moneyOutIx("claim_pot", pool, sponsored.member, commissioner, vault, commissionerAta),
      commissioner,
      "ConstraintSeeds",
    );

    /* Nor can they redirect it. The friend signs, but names the commissioner's
     * token account as the destination: `member_ata.owner == wallet` refuses a
     * payout into anybody's account but the winner's own. */
    await expectFailure(
      moneyOutIx("claim_pot", pool, sponsored.member, friend, vault, commissionerAta),
      commissioner,
      "NotAMember",
    );

    /* The friend never held USDC, so the client creates their token account
     * before claiming, the way ClaimPot.tsx does. Then the pot is theirs. */
    const friendAta = await ata(friend.address, CANONICAL_USDC);
    putTokenAccount(friendAta, CANONICAL_USDC, friend.address, 0n);
    await sendIx(
      moneyOutIx("claim_pot", pool, sponsored.member, friend, vault, friendAta),
      commissioner,
    );

    expect(tokenAmount(friendAta)).to.equal(BUY_IN * 2n);
    expect(tokenAmount(vault)).to.equal(0n);
    // The commissioner paid for a seat and got nothing back from the pot.
    expect(tokenAmount(commissionerAta)).to.equal(commissionerAfterBuying);
    expect(fetchAccount<any>("Member", sponsored.member).claimed).to.equal(true);
  });

  /* The consequence worth saying out loud in the interface: a sponsor who
   * fronts a seat is repaid by their friend or not at all. The program returns
   * an abandoned pool's money to the seat's owner. */
  it("the deadman refunds the seat's owner, not whoever paid for it", async () => {
    const commissioner = await fundedSigner();
    const { pool, vault, commissionerAta, refundDeadline } = await createPool(commissioner);
    const friend = await generateKeyPairSigner();
    const sponsored = await sponsorIx({ pool, vault, signer: commissioner, friend: friend.address });
    await sendIx(sponsored.ix, commissioner);
    const commissionerAfterBuying = tokenAmount(commissionerAta);

    // Nobody ever posts a result. The deadline passes.
    setClock(refundDeadline);

    // The sponsor cannot reclaim the share for a seat they do not own.
    await expectFailure(
      moneyOutIx("reclaim_dues", pool, sponsored.member, commissioner, vault, commissionerAta),
      commissioner,
      "ConstraintSeeds",
    );

    const friendAta = await ata(friend.address, CANONICAL_USDC);
    putTokenAccount(friendAta, CANONICAL_USDC, friend.address, 0n);
    await sendIx(
      moneyOutIx("reclaim_dues", pool, sponsored.member, friend, vault, friendAta),
      commissioner,
    );

    expect(fetchAccount<any>("Pool", pool).status).to.equal(STATUS_ABANDONED);
    expect(tokenAmount(friendAta)).to.equal(BUY_IN);
    expect(tokenAmount(commissionerAta)).to.equal(commissionerAfterBuying);
  });

  it("a seat cannot be sponsored twice, nor joined on top of", async () => {
    const commissioner = await fundedSigner();
    const { pool, vault, commissionerAta } = await createPool(commissioner);
    const friend = await fundedSigner();
    const first = await sponsorIx({ pool, vault, signer: commissioner, friend: friend.address });
    await sendIx(first.ix, commissioner);
    svm.expireBlockhash();

    // Paying for the same seat again would take a second buy-in for one seat.
    const again = await sponsorIx({ pool, vault, signer: commissioner, friend: friend.address });
    await expectFailure(again.ix, commissioner, "already in use");

    // And the friend cannot join in their own right on top of it.
    const own = await join(pool, vault, friend, "Friend again");
    await expectFailure(own.ix, friend, "already in use");

    // One seat, one buy-in, however many ways it was attempted.
    expect(tokenAmount(vault)).to.equal(BUY_IN);
    expect(tokenAmount(commissionerAta)).to.equal(COMMISSIONER_FUNDS - BUY_IN);
    expect(fetchAccount<any>("Pool", pool).member_count).to.equal(1);
  });

  it("a seat cannot be bought after the pool locks, or once it is full", async () => {
    const commissioner = await fundedSigner();

    // Locked: the same gate join_pool uses, and the same error.
    const late = await createPool(commissioner);
    setClock(lastLock());
    const afterLock = await sponsorIx({
      pool: late.pool,
      vault: late.vault,
      signer: commissioner,
      friend: (await generateKeyPairSigner()).address,
    });
    await expectFailure(afterLock.ix, commissioner, "JoinClosed");
    setClock(now);

    // Full: max_members is a ceiling for sponsored seats too. The program's
    // floor is two, so fill two and refuse the third.
    const small = await createPool(commissioner, { maxMembers: 2 });
    for (let i = 0; i < 2; i++) {
      const s = await sponsorIx({
        pool: small.pool,
        vault: small.vault,
        signer: commissioner,
        friend: (await generateKeyPairSigner()).address,
      });
      await sendIx(s.ix, commissioner);
    }
    const third = await sponsorIx({
      pool: small.pool,
      vault: small.vault,
      signer: commissioner,
      friend: (await generateKeyPairSigner()).address,
    });
    await expectFailure(third.ix, commissioner, "PoolFull");
    expect(tokenAmount(small.vault)).to.equal(BUY_IN * 2n);
  });

  /* A zero-buy-in pool, like the first one on mainnet. There is no USDC to
   * move, so the only thing the commissioner pays for is the seat's rent. */
  it("in a free pool the sponsor pays only the rent on the seat", async () => {
    const commissioner = await fundedSigner();
    const { pool, vault, commissionerAta } = await createPool(commissioner, { buyIn: 0n });
    const friend = await generateKeyPairSigner();
    const solBefore = solOf(commissioner.address);

    const { ix, member } = await sponsorIx({ pool, vault, signer: commissioner, friend: friend.address });
    await sendIx(ix, commissioner);

    expect(tokenAmount(commissionerAta)).to.equal(COMMISSIONER_FUNDS);
    expect(tokenAmount(vault)).to.equal(0n);
    expect(fetchAccount<any>("Member", member).paid).to.equal(true);
    // Rent plus a fee came out of the commissioner's SOL, and none of the friend's.
    expect(solOf(commissioner.address) < solBefore).to.equal(true);
    expect(solOf(friend.address)).to.equal(0n);
  });
});
