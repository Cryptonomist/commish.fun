/* Point the fee of every FUTURE pool at a new treasury.
 *
 *   FEE_TREASURY=<pubkey> RPC_URL=<rpc> KEYPAIR=<admin keypair> npx tsx scripts/set-fee-treasury.ts
 *
 * The signer has to be the Config admin — since 2026-09-09 the cold key on
 * the USB stick, so KEYPAIR points at the stick. The CLI's everyday key pays
 * the fee whenever it is not the signer (FEE_PAYER overrides), so the cold key
 * never has to hold SOL.
 *
 * NOTHING RUNNING IS TOUCHED. A pool copies the treasury at creation and pays
 * the copy, the same rule that stops the fee itself changing under a member.
 * This changes where pools created from now on send theirs.
 *
 * THE NEW TREASURY NEEDS A USDC TOKEN ACCOUNT before any pool created after
 * this settles: `advance_week` deserializes the treasury's token account on
 * every call, fee or no fee, so a treasury with no USDC account stops those
 * pools from settling. This script says so if it cannot find one, and goes
 * ahead anyway, because creating the account is the treasury owner's job and
 * may happen later; it just must happen before the first settlement.
 */

import fs from "fs";
import os from "os";
import path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  ataFor,
  buildSetFeeTreasury,
  configPda,
  decodeConfig,
  PROGRAM_ID,
  USDC_MINT,
} from "@/lib/program";

const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const CLI_KEY = path.join(os.homedir(), ".config/solana/id.json");

function loadKeypairFrom(file: string): Keypair {
  const secret = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function loadKeypair(): Keypair {
  return loadKeypairFrom(process.env.KEYPAIR ?? CLI_KEY);
}

/** The CLI's key pays when it is not the signer. Same rule as the other
 *  admin scripts, for the same reason: a cold key holds nothing. */
function loadPayer(signer: Keypair): Keypair {
  const file = process.env.FEE_PAYER ?? CLI_KEY;
  if (!fs.existsSync(file)) return signer;
  const payer = loadKeypairFrom(file);
  return payer.publicKey.equals(signer.publicKey) ? signer : payer;
}

async function main() {
  const arg = process.env.FEE_TREASURY;
  if (!arg) throw new Error("Set FEE_TREASURY to the new treasury's public key.");
  const treasury = new PublicKey(arg);
  const admin = loadKeypair();
  const connection = new Connection(RPC, "confirmed");

  const configInfo = await connection.getAccountInfo(configPda(), "confirmed");
  if (!configInfo) throw new Error(`No Config at ${configPda().toBase58()} on ${RPC}. Wrong cluster?`);
  const config = decodeConfig(configInfo.data);

  console.log(`program   ${PROGRAM_ID.toBase58()}`);
  console.log(`rpc       ${RPC}`);
  console.log(`admin     ${config.admin.toBase58()}`);
  console.log(`currently ${config.feeTreasury.toBase58()}`);
  console.log(`proposed  ${treasury.toBase58()}`);

  if (!admin.publicKey.equals(config.admin)) {
    throw new Error(
      `KEYPAIR is ${admin.publicKey.toBase58()}, and the admin is ${config.admin.toBase58()}. Only the admin changes the treasury.`,
    );
  }
  if (treasury.equals(config.feeTreasury)) {
    throw new Error("That is already the treasury.");
  }

  const ata = ataFor(treasury, USDC_MINT);
  const ataInfo = await connection.getAccountInfo(ata, "confirmed");
  if (!ataInfo) {
    console.log(
      `warning   ${treasury.toBase58()} has no USDC token account (${ata.toBase58()}). ` +
        "Create one before a pool created after this settles, or advance_week will refuse.",
    );
  }

  const payer = loadPayer(admin);
  const balance = await connection.getBalance(payer.publicKey, "confirmed");
  if (balance < 50_000) {
    throw new Error(
      `${payer.publicKey.toBase58()} would pay the fee and holds ${balance} lamports. ` +
        "Fund it, or set FEE_PAYER to a keypair file that has SOL.",
    );
  }

  const tx = new Transaction({ feePayer: payer.publicKey }).add(
    buildSetFeeTreasury({ admin: admin.publicKey, treasury }),
  );
  const signers = payer === admin ? [admin] : [payer, admin];
  const sig = await sendAndConfirmTransaction(connection, tx, signers, {
    commitment: "confirmed",
  });
  console.log(`sent      ${sig}`);
  if (payer !== admin) console.log(`fee paid  ${payer.publicKey.toBase58()}`);

  const after = await connection.getAccountInfo(configPda(), "confirmed");
  if (!after) throw new Error("Config vanished after the transaction, which cannot happen.");
  const now = decodeConfig(after.data);
  if (!now.feeTreasury.equals(treasury)) {
    throw new Error(`Config says ${now.feeTreasury.toBase58()}, expected ${treasury.toBase58()}`);
  }
  console.log(`now       ${now.feeTreasury.toBase58()}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
