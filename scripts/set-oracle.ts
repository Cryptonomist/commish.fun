/* Name, or rotate, the results oracle: the key the automated poster signs with.
 *
 *   ORACLE_POSTER=<pubkey> RPC_URL=<rpc> KEYPAIR=<admin keypair> npx tsx scripts/set-oracle.ts
 *
 * The signer has to be the Config admin: the program checks `has_one = admin`
 * on Config before it will touch the Oracle account. Since 2026-09-09 that is
 * the cold key on the USB stick, so KEYPAIR points at the stick; the CLI's
 * everyday key pays the fee whenever it is not the signer (FEE_PAYER
 * overrides), so the cold key never has to hold SOL. Run this whenever the
 * poster's key is rotated. The same instruction creates the account on its
 * first call.
 *
 * THE POSTER IS NOT THE ADMIN AND MUST NEVER BE. The admin key can change the
 * fee and the treasury and pause the program. The poster can propose results
 * and nothing else, and it lives in a Cloudflare Worker secret where it can be
 * reached by anything that reaches the Worker. Naming the admin as the poster
 * would put the admin's powers behind the Worker's security, which is the
 * wrong way round. This script refuses that.
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
  buildSetOracle,
  configPda,
  decodeOracle,
  oraclePda,
  PROGRAM_ID,
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

/** Who pays. The CLI's key when it is not the signer, so a cold admin key
 *  can stay empty. Same rule as scripts/admin-transfer.ts, for the same
 *  reason: the first cold-key transaction on mainnet failed with empty logs
 *  because the signer was also the payer and held nothing. */
function loadPayer(signer: Keypair): Keypair {
  const file = process.env.FEE_PAYER ?? CLI_KEY;
  if (!fs.existsSync(file)) return signer;
  const payer = loadKeypairFrom(file);
  return payer.publicKey.equals(signer.publicKey) ? signer : payer;
}

async function main() {
  const posterArg = process.env.ORACLE_POSTER;
  if (!posterArg) {
    throw new Error("Set ORACLE_POSTER to the poster's public key.");
  }
  const poster = new PublicKey(posterArg);
  const admin = loadKeypair();

  if (poster.equals(admin.publicKey)) {
    throw new Error(
      "Refusing: the poster must not be the admin key. Generate a separate keypair for the Worker.",
    );
  }

  const connection = new Connection(RPC, "confirmed");
  const config = configPda();
  const oracle = oraclePda();

  console.log(`program   ${PROGRAM_ID.toBase58()}`);
  console.log(`rpc       ${RPC}`);
  console.log(`config    ${config.toBase58()}`);
  console.log(`oracle    ${oracle.toBase58()}`);
  console.log(`admin     ${admin.publicKey.toBase58()}`);
  console.log(`poster    ${poster.toBase58()}`);

  const before = await connection.getAccountInfo(oracle);
  if (before) {
    console.log(`currently ${decodeOracle(before.data).poster.toBase58()}`);
  } else {
    console.log("currently (no oracle account yet; this call creates it)");
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
    buildSetOracle({ admin: admin.publicKey, poster }),
  );
  const signers = payer === admin ? [admin] : [payer, admin];
  const sig = await sendAndConfirmTransaction(connection, tx, signers, {
    commitment: "confirmed",
  });
  console.log(`sent      ${sig}`);
  if (payer !== admin) console.log(`fee paid  ${payer.publicKey.toBase58()}`);

  const after = await connection.getAccountInfo(oracle, "confirmed");
  if (!after) throw new Error("The oracle account is still missing after the transaction.");
  const view = decodeOracle(after.data);
  if (!view.poster.equals(poster)) {
    throw new Error(`Oracle says ${view.poster.toBase58()}, expected ${poster.toBase58()}`);
  }
  console.log(`now       ${view.poster.toBase58()}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
