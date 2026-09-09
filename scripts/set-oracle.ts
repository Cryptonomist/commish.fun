/* Name, or rotate, the results oracle: the key the automated poster signs with.
 *
 *   ORACLE_POSTER=<pubkey> RPC_URL=<rpc> npx tsx scripts/set-oracle.ts
 *
 * The signer is your Solana CLI keypair and it has to be the Config admin: the
 * program checks `has_one = admin` on Config before it will touch the Oracle
 * account. Run it once after the upgrade that introduced the oracle, and again
 * whenever the poster's key is rotated. The same instruction does both; the
 * first call creates the account.
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

function loadKeypair(): Keypair {
  const file =
    process.env.KEYPAIR ?? path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
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

  const tx = new Transaction().add(
    buildSetOracle({ admin: admin.publicKey, poster }),
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
    commitment: "confirmed",
  });
  console.log(`sent      ${sig}`);

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
