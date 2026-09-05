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

const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";
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

  const existing = await connection.getAccountInfo(config);
  if (existing) {
    console.log(`Config already exists at ${config.toBase58()} — nothing to do.`);
    return;
  }

  // The treasury receives the platform fee. It is recorded on every pool at
  // creation, so pointing it somewhere wrong is not fixable for pools that
  // already exist.
  const treasury = new PublicKey(
    process.env.FEE_TREASURY ?? admin.publicKey.toBase58(),
  );

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
    new Transaction().add(ix),
    [admin],
    { commitment: "confirmed" },
  );
  console.log(`\nConfig created at ${config.toBase58()}`);
  console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
