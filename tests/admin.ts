/* THE ADMIN HANDOVER, and the fee ceiling that ships with it.
 *
 * `Config.admin` was written once, at init, and could never move. The key
 * that can change the fee, pause creation and name the oracle therefore had
 * to stay wherever it was first generated. These prove the two-step transfer
 * that fixes that: only the admin proposes, only the proposed key accepts,
 * nothing changes in between, a proposal can be replaced or withdrawn, and
 * the old key is locked out the moment the new one is in.
 *
 * The fee ceiling is here too because it is the other half of "a compromised
 * admin key cannot make a new pool confiscatory": the cap is enforced at init
 * and on every update, whoever signs.
 *
 * Self-contained, like oracle.ts: every helper it needs is here.
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

describe("commish admin handover - LiteSVM", () => {
  const idl = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "target/idl/commish.json"), "utf8"),
  );
  const coder = new anchor.BorshCoder(idl);
  const addressCodec = getAddressCodec();

  const programAddress = address("Adb5CFrY4vYiGQnTQ5qsaPPMUAWKyxwVAQtFHWcshjPa");
  const systemProgram = address("11111111111111111111111111111111");
  const HAS_ONE = "A has one constraint was violated";
  const MAX_FEE_BPS = 1_000;

  type Signer = Awaited<ReturnType<typeof generateKeyPairSigner>>;

  let svm: LiteSVM;
  let admin: Signer;
  let treasury: Signer;
  let successor: Signer;
  let configPDA: Address;
  let transferPDA: Address;

  // --------------------------------------------------------- transactions
  async function pda(seeds: Uint8Array[]): Promise<Address> {
    const [addr] = await getProgramDerivedAddress({ programAddress, seeds });
    return addr;
  }

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

  /** LiteSVM reports a closed account three different ways. */
  const gone = (a: any) => !a || ("exists" in a && !a.exists) || a.data.length === 0;

  async function fundedSigner(): Promise<Signer> {
    const s = await generateKeyPairSigner();
    svm.airdrop(s.address, lamports(500n * 1_000_000_000n));
    return s;
  }

  const currentAdmin = () => toAddressString(fetchAccount<any>("Config", configPDA).admin);

  // --------------------------------------------------------- instructions
  const CAP = 50_000_000; // 50 USDC, the mainnet value

  const initConfigIx = (feeBps: number, feeCap = CAP) => ({
    programAddress,
    accounts: [
      { address: configPDA, role: AccountRole.WRITABLE },
      { address: admin.address, role: AccountRole.WRITABLE_SIGNER, signer: admin },
      { address: treasury.address, role: AccountRole.READONLY },
      { address: systemProgram, role: AccountRole.READONLY },
    ],
    data: coder.instruction.encode("init_config", {
      fee_bps: feeBps,
      fee_cap: new BN(feeCap),
      creation_fee: new BN(0),
    }),
  });

  const updateConfigIx = (signer: Signer, feeBps: number, feeCap = CAP) => ({
    programAddress,
    accounts: [
      { address: configPDA, role: AccountRole.WRITABLE },
      { address: signer.address, role: AccountRole.READONLY_SIGNER, signer },
    ],
    data: coder.instruction.encode("update_config", {
      fee_bps: feeBps,
      fee_cap: new BN(feeCap),
      creation_fee: new BN(0),
      paused: false,
    }),
  });

  const setFeeTreasuryIx = (signer: Signer, treasuryAddr: Address) => ({
    programAddress,
    accounts: [
      { address: configPDA, role: AccountRole.WRITABLE },
      { address: signer.address, role: AccountRole.READONLY_SIGNER, signer },
      { address: treasuryAddr, role: AccountRole.READONLY },
    ],
    data: coder.instruction.encode("set_fee_treasury", {}),
  });

  const proposeIx = (signer: Signer, newAdmin: PublicKey) => ({
    programAddress,
    accounts: [
      { address: configPDA, role: AccountRole.READONLY },
      { address: transferPDA, role: AccountRole.WRITABLE },
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: systemProgram, role: AccountRole.READONLY },
    ],
    data: coder.instruction.encode("propose_admin", { new_admin: newAdmin }),
  });

  const acceptIx = (signer: Signer) => ({
    programAddress,
    accounts: [
      { address: configPDA, role: AccountRole.WRITABLE },
      { address: transferPDA, role: AccountRole.WRITABLE },
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
    ],
    data: coder.instruction.encode("accept_admin", {}),
  });

  const cancelIx = (signer: Signer) => ({
    programAddress,
    accounts: [
      { address: configPDA, role: AccountRole.READONLY },
      { address: transferPDA, role: AccountRole.WRITABLE },
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
    ],
    data: coder.instruction.encode("cancel_admin_transfer", {}),
  });

  const pk = (a: Address) => new PublicKey(a);

  // ---------------------------------------------------------------- setup
  before(async () => {
    svm = new LiteSVM().withLogBytesLimit(256n * 1024n);
    svm.addProgramFromFile(programAddress, "target/deploy/commish.so");

    admin = await fundedSigner();
    treasury = await fundedSigner();
    successor = await fundedSigner();

    configPDA = await pda([new TextEncoder().encode("config")]);
    transferPDA = await pda([new TextEncoder().encode("admin_transfer")]);
  });

  // ------------------------------------------------------------ the fee cap
  it("refuses a fee above the ceiling at init, and takes one at it", async () => {
    await expectFailure(initConfigIx(MAX_FEE_BPS + 1), admin, "FeeTooHigh");
    /* A cap of zero with a fee above zero is "no fee", not "no cap", and it
     * used to be accepted silently. */
    await expectFailure(initConfigIx(300, 0), admin, "FeeCapZero");
    await sendIx(initConfigIx(MAX_FEE_BPS), admin);
    expect(fetchAccount<any>("Config", configPDA).default_fee_bps).to.equal(MAX_FEE_BPS);
  });

  it("refuses a fee above the ceiling on update, whoever the admin is", async () => {
    await expectFailure(updateConfigIx(admin, MAX_FEE_BPS + 1), admin, "FeeTooHigh");
    await expectFailure(updateConfigIx(admin, 300, 0), admin, "FeeCapZero");
    // No fee at all is fine with no cap: there is nothing for the cap to hide.
    await sendIx(updateConfigIx(admin, 0, 0), admin);
    await sendIx(updateConfigIx(admin, 300), admin);
    expect(fetchAccount<any>("Config", configPDA).default_fee_bps).to.equal(300);
  });

  // ---------------------------------------------------------- the handover
  it("nobody but the admin can propose a successor", async () => {
    const stranger = await fundedSigner();
    await expectFailure(proposeIx(stranger, pk(stranger.address)), stranger, HAS_ONE);
    expect(svm.getAccount(transferPDA)).to.satisfy(gone, "a refused proposal leaves nothing behind");
  });

  it("the admin cannot propose nobody, or themselves", async () => {
    await expectFailure(proposeIx(admin, PublicKey.default), admin, "BadAdmin");
    await expectFailure(proposeIx(admin, pk(admin.address)), admin, "BadAdmin");
    expect(svm.getAccount(transferPDA)).to.satisfy(gone);
  });

  it("a proposal names the successor and changes nothing yet", async () => {
    await sendIx(proposeIx(admin, pk(successor.address)), admin);

    const t = fetchAccount<any>("AdminTransfer", transferPDA);
    expect(toAddressString(t.pending)).to.equal(successor.address);
    expect(currentAdmin()).to.equal(admin.address);

    // Proposed is not admin. The successor cannot administer anything yet, and
    // the admin still can.
    await expectFailure(updateConfigIx(successor, 300), successor, HAS_ONE);
    await sendIx(updateConfigIx(admin, 250), admin);
  });

  it("only the proposed key may accept", async () => {
    const stranger = await fundedSigner();
    await expectFailure(acceptIx(stranger), stranger, "BadAdmin");
    await expectFailure(acceptIx(admin), admin, "BadAdmin");
    expect(currentAdmin()).to.equal(admin.address);
  });

  it("accepting rewrites Config, closes the proposal and locks the old key out", async () => {
    const before = svm.getBalance(successor.address) ?? 0n;
    await sendIx(acceptIx(successor), successor);

    expect(currentAdmin()).to.equal(successor.address);
    expect(svm.getAccount(transferPDA)).to.satisfy(gone, "the proposal account should close");
    // The proposal's rent went to the new admin, less one transaction fee.
    expect(svm.getBalance(successor.address) ?? 0n).to.be.greaterThan(before - 10_000n);

    /* 275, not 300: LiteSVM's blockhash does not move between tests, so an
     * update identical to one already sent would be refused as a duplicate
     * before the program ever ran, with no logs to match against. */
    await expectFailure(updateConfigIx(admin, 275), admin, HAS_ONE);
    await sendIx(updateConfigIx(successor, 275), successor);
    expect(fetchAccount<any>("Config", configPDA).default_fee_bps).to.equal(275);
  });

  it("a proposal can be replaced, and withdrawn, and a withdrawn one cannot be accepted", async () => {
    const third = await fundedSigner();
    const fourth = await fundedSigner();

    await sendIx(proposeIx(successor, pk(third.address)), successor);
    await sendIx(proposeIx(successor, pk(fourth.address)), successor);
    expect(toAddressString(fetchAccount<any>("AdminTransfer", transferPDA).pending)).to.equal(
      fourth.address,
    );
    // Replaced means replaced: the earlier name no longer opens the door.
    await expectFailure(acceptIx(third), third, "BadAdmin");

    // Only the admin withdraws, and the old admin is not the admin.
    await expectFailure(cancelIx(admin), admin, HAS_ONE);
    await sendIx(cancelIx(successor), successor);
    expect(svm.getAccount(transferPDA)).to.satisfy(gone, "a cancelled proposal closes");

    await expectFailure(acceptIx(fourth), fourth, "AccountNotInitialized");
    expect(currentAdmin()).to.equal(successor.address);
  });

  it("the oracle follows the admin: the new key names it, the old one cannot", async () => {
    const oraclePDA = await pda([new TextEncoder().encode("oracle")]);
    const poster = await fundedSigner();
    const setOracleIx = (signer: Signer) => ({
      programAddress,
      accounts: [
        { address: configPDA, role: AccountRole.READONLY },
        { address: oraclePDA, role: AccountRole.WRITABLE },
        { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
        { address: systemProgram, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("set_oracle", { poster: pk(poster.address) }),
    });
    await expectFailure(setOracleIx(admin), admin, HAS_ONE);
    await sendIx(setOracleIx(successor), successor);
    expect(toAddressString(fetchAccount<any>("Oracle", oraclePDA).poster)).to.equal(poster.address);
  });

  it("the treasury follows the admin too, and cannot be pointed at nobody", async () => {
    const newTreasury = await fundedSigner();
    await expectFailure(setFeeTreasuryIx(admin, newTreasury.address), admin, HAS_ONE);
    await expectFailure(
      setFeeTreasuryIx(successor, address("11111111111111111111111111111111")),
      successor,
      "BadTreasury",
    );
    expect(toAddressString(fetchAccount<any>("Config", configPDA).fee_treasury)).to.equal(
      treasury.address,
    );

    await sendIx(setFeeTreasuryIx(successor, newTreasury.address), successor);
    expect(toAddressString(fetchAccount<any>("Config", configPDA).fee_treasury)).to.equal(
      newTreasury.address,
    );
  });
});
