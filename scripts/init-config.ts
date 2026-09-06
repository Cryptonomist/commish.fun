/* One-time bootstrap: create the program's global Config account.
 *
 * Nothing can be created until this exists — `create_pool` reads Config for the
 * paused flag and the default fee, and Anchor will refuse with
 * AccountNotInitialized if it is missing. Run it once per cluster, immediately
 * after `anchor deploy`.
 *
 *   npx ts-node scripts/init-config.ts
 *
 * The signer is your Solana CLI keypair, which becomes the config admin. On
 * mainnet that key should be a multisig, not a file on a laptop.
 *
 * SEASON ONE TAKES NO FEE. fee_bps is 0 below, deliberately. The fee plumbing
 * is implemented and tested, but charging players in the first season while the
 * program has never been audited is not a trade worth making. Change this only
 * when you mean it — the value is copied onto every pool at creation and cannot
 * be raised on a pool that already exists.
 */

import fs from "fs";
import os from "os";
import path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { BorshCoder, type Idl } from "@coral-xyz/anchor";
import BN from "bn.js";

import { ataFor, createAtaIdempotentIx } from "@/lib/program";

const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";

/* Which dollar this cluster's program pins. The program compiles one mint in
 * per build feature and rejects any other at pool creation, so this has to
 * agree with how the binary was built. Devnet and localnet share one; mainnet
 * has its own. Override explicitly if you are doing something unusual. */
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ??
    (/localhost|127\.0\.0\.1|devnet/.test(RPC)
      ? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
      : "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
);
const FEE_BPS = 0;
const FEE_CAP = 50_000_000; // 50 USDC, only meaningful once FEE_BPS is non-zero
const CREATION_FEE = 0;

function loadKeypair(): Keypair {
  const file =
    process.env.KEYPAIR ?? path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const idl = JSON.parse(
    fs.readFileSync(
      path.resolve(process.cwd(), "target/idl/commish.json"),
      "utf8",
    ),
  ) as Idl & { address: string };

  const programId = new PublicKey(process.env.PROGRAM_ID ?? idl.address);
  const coder = new BorshCoder(idl);
  const admin = loadKeypair();
  const connection = new Connection(RPC, "confirmed");

  const [config] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("config")],
    programId,
  );

  // The treasury receives the platform fee. It is recorded on every pool at
  // creation, so pointing it somewhere wrong is not fixable for pools that
  // already exist.
  const treasury = new PublicKey(
    process.env.FEE_TREASURY ?? admin.publicKey.toBase58(),
  );

  /* THE TREASURY'S TOKEN ACCOUNT MUST EXIST OR NO POOL CAN EVER SETTLE.
   *
   * `advance_week` names `fee_treasury_ata` on every call, including the ones
   * that only roll the week forward and the ones where fee_bps is zero, because
   * an Anchor account list is static. Nothing is transferred at zero fee, but
   * the account is still deserialized — so a missing one fails the instruction
   * before any of the program's own checks run, with an error that mentions no
   * treasury at all.
   *
   * Season one runs at zero fee, which is exactly the season where nobody would
   * think to create it. So it is created here, where the treasury is chosen,
   * rather than left as a step in somebody's head. */
  const treasuryAta = ataFor(treasury, USDC_MINT);
  const ataIx = createAtaIdempotentIx(admin.publicKey, treasury, USDC_MINT);

  const existing = await connection.getAccountInfo(config);
  if (existing) {
    // Still worth running: this script is the only thing that knows about the
    // treasury, and an older run of it did not create the token account.
    if (await connection.getAccountInfo(treasuryAta)) {
      console.log(
        `Config exists at ${config.toBase58()} and its treasury account is in place — nothing to do.`,
      );
      return;
    }
    console.log(`Config exists at ${config.toBase58()}.`);
    console.log(`Treasury ${treasury.toBase58()} has no ${USDC_MINT.toBase58().slice(0, 6)}… account. Creating it.`);
    const sig = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(ataIx),
      [admin],
      { commitment: "confirmed" },
    );
    console.log(`\nTreasury account created at ${treasuryAta.toBase58()}`);
    console.log(`  ${sig}`);
    return;
  }

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: coder.instruction.encode("init_config", {
      fee_bps: FEE_BPS,
      fee_cap: new BN(FEE_CAP),
      creation_fee: new BN(CREATION_FEE),
    }),
  });

  console.log(`program  ${programId.toBase58()}`);
  console.log(`admin    ${admin.publicKey.toBase58()}`);
  console.log(`treasury ${treasury.toBase58()}`);
  console.log(`fee      ${FEE_BPS} bps`);

  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix).add(ataIx),
    [admin],
    { commitment: "confirmed" },
  );
  console.log(`\nConfig created at ${config.toBase58()}`);
  console.log(`Treasury account at ${treasuryAta.toBase58()}`);
  console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
