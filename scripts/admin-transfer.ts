/* Hand the admin key over, in two steps, and see where it stands.
 *
 *   npx tsx scripts/admin-transfer.ts status
 *   NEW_ADMIN=<pubkey> npx tsx scripts/admin-transfer.ts propose
 *   npx tsx scripts/admin-transfer.ts cancel
 *   npx tsx scripts/admin-transfer.ts accept              KEYPAIR is the proposed key
 *   npx tsx scripts/admin-transfer.ts accept --print      for a multisig: prints what to import
 *
 * RPC_URL selects the cluster and defaults to devnet, so mainnet is always a
 * deliberate `RPC_URL=<mainnet rpc>`. KEYPAIR is the signer and defaults to the
 * Solana CLI's key; `propose` and `cancel` need the current admin, `accept`
 * needs the proposed key.
 *
 * WHY TWO STEPS. `propose` writes the successor into a small account and
 * changes nothing else. `accept` is signed by the successor and is the moment
 * Config is rewritten. A wrong address can be proposed; it can never accept,
 * so a typo costs a `cancel` rather than the program.
 *
 * A MULTISIG VAULT cannot run `accept` from this script, because the vault is
 * a PDA that only its own program can sign for. `accept --print` builds the
 * exact instruction and prints it in two forms: the account list and data, for
 * any multisig's instruction builder, and a serialized unsigned transaction
 * with the vault as fee payer, for an "import transaction" screen. Propose the
 * result inside the multisig, approve it from two devices, execute, then run
 * `status` here to see the admin change.
 *
 * NOTHING HERE TOUCHES A VAULT OR A POOL. The admin key changes the default
 * fee (never above the program's ceiling), pauses creation, names the oracle,
 * and hands itself over. That is the whole of what is being moved.
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
import { utils } from "@coral-xyz/anchor";

import {
  adminTransferPda,
  buildAcceptAdmin,
  buildCancelAdminTransfer,
  buildProposeAdmin,
  configPda,
  decodeAdminTransfer,
  decodeConfig,
  PROGRAM_ID,
} from "@/lib/program";

const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";

function loadKeypair(): Keypair {
  const file =
    process.env.KEYPAIR ?? path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

type State = {
  admin: PublicKey;
  pending: PublicKey | null;
};

async function readState(connection: Connection): Promise<State> {
  const configInfo = await connection.getAccountInfo(configPda(), "confirmed");
  if (!configInfo) {
    throw new Error(`No Config account at ${configPda().toBase58()} on ${RPC}. Wrong cluster?`);
  }
  const transferInfo = await connection.getAccountInfo(adminTransferPda(), "confirmed");
  return {
    admin: decodeConfig(configInfo.data).admin,
    pending: transferInfo ? decodeAdminTransfer(transferInfo.data).pending : null,
  };
}

function banner(state: State) {
  console.log(`program   ${PROGRAM_ID.toBase58()}`);
  console.log(`rpc       ${RPC}`);
  console.log(`config    ${configPda().toBase58()}`);
  console.log(`transfer  ${adminTransferPda().toBase58()}`);
  console.log(`admin     ${state.admin.toBase58()}`);
  console.log(
    `pending   ${state.pending ? state.pending.toBase58() : "(no proposal open)"}`,
  );
}

async function send(connection: Connection, signer: Keypair, ix: ReturnType<typeof buildAcceptAdmin>) {
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
    commitment: "confirmed",
  });
  console.log(`sent      ${sig}`);
}

async function main() {
  const [command, flag] = process.argv.slice(2);
  const connection = new Connection(RPC, "confirmed");
  const state = await readState(connection);
  banner(state);

  switch (command) {
    case "status":
    case undefined:
      return;

    case "propose": {
      const arg = process.env.NEW_ADMIN;
      if (!arg) throw new Error("Set NEW_ADMIN to the successor's public key.");
      const newAdmin = new PublicKey(arg);
      const signer = loadKeypair();
      if (!signer.publicKey.equals(state.admin)) {
        throw new Error(
          `KEYPAIR is ${signer.publicKey.toBase58()}, and the admin is ${state.admin.toBase58()}. Only the admin proposes.`,
        );
      }
      if (newAdmin.equals(state.admin)) {
        throw new Error("That is already the admin.");
      }
      console.log(`proposing ${newAdmin.toBase58()}`);
      await send(connection, signer, buildProposeAdmin({ admin: signer.publicKey, newAdmin }));
      const after = await readState(connection);
      if (!after.pending?.equals(newAdmin)) {
        throw new Error("The proposal did not land as expected; read the state again.");
      }
      console.log(`now       proposal open for ${newAdmin.toBase58()}. Nothing has changed yet.`);
      console.log(`next      that key runs: npx tsx scripts/admin-transfer.ts accept`);
      return;
    }

    case "cancel": {
      if (!state.pending) throw new Error("There is no proposal to cancel.");
      const signer = loadKeypair();
      if (!signer.publicKey.equals(state.admin)) {
        throw new Error(`Only the admin ${state.admin.toBase58()} can cancel.`);
      }
      await send(connection, signer, buildCancelAdminTransfer({ admin: signer.publicKey }));
      console.log("now       proposal withdrawn");
      return;
    }

    case "accept": {
      if (!state.pending) throw new Error("There is no proposal to accept.");
      const ix = buildAcceptAdmin({ pending: state.pending });

      if (flag === "--print") {
        /* The instruction, in the two shapes a multisig might want. The
         * serialized transaction carries a blockhash that expires in about a
         * minute; a multisig rebuilds the message anyway, so the account list
         * is the durable form. */
        console.log("\ninstruction for a multisig builder:");
        console.log(`  program   ${ix.programId.toBase58()}`);
        for (const k of ix.keys) {
          console.log(
            `  account   ${k.pubkey.toBase58()}  ${k.isSigner ? "signer" : "      "}  ${k.isWritable ? "writable" : "readonly"}`,
          );
        }
        console.log(`  data(b58) ${utils.bytes.bs58.encode(ix.data)}`);
        console.log(`  data(hex) ${Buffer.from(ix.data).toString("hex")}`);

        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({ feePayer: state.pending, recentBlockhash: blockhash }).add(ix);
        const raw = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        console.log("\nunsigned transaction, fee payer = the proposed key (base58):");
        console.log(utils.bytes.bs58.encode(raw));
        console.log("\nThe signer must be the proposed key; a vault signs through its own program.");
        return;
      }

      const signer = loadKeypair();
      if (!signer.publicKey.equals(state.pending)) {
        throw new Error(
          `KEYPAIR is ${signer.publicKey.toBase58()}, and the proposal names ${state.pending.toBase58()}. Only that key accepts.`,
        );
      }
      await send(connection, signer, ix);
      const after = await readState(connection);
      if (!after.admin.equals(signer.publicKey)) {
        throw new Error("Config still names the old admin; read the state again.");
      }
      console.log(`now       admin is ${after.admin.toBase58()}`);
      return;
    }

    default:
      throw new Error(`Unknown command "${command}". One of: status, propose, cancel, accept [--print].`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
