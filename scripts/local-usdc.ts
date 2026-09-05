/* Devnet USDC you can actually mint, for local testing.
 *
 * THE PROBLEM. The program pins one USDC mint per cluster and rejects any
 * other, so a local validator has to serve USDC at exactly the devnet address
 * `4zMMC9…ncDU`. Cloning the real one gets the address right but not the
 * authority — Circle holds that — so nobody can mint themselves test dollars
 * and `join_pool` fails at the transfer with an empty balance.
 *
 * THE FIX. Hand the validator a mint account at that address whose authority is
 * your own keypair. It is the same 82 bytes the token program expects, so
 * everything downstream — associated token accounts, transfers, the program's
 * `usdc_mint == CANONICAL_USDC` check — behaves exactly as it does on devnet.
 *
 *   npx tsx scripts/local-usdc.ts dump         # writes local-usdc.json
 *   solana-test-validator --reset --account 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU local-usdc.json
 *   npx tsx scripts/local-usdc.ts mint <address> 500
 *
 * LOCALNET ONLY. This is a counterfeit of a real mint. It exists so a test can
 * move dollars that are not dollars; it must never be pointed at a cluster
 * anyone else uses, and the script refuses anything but a localhost RPC.
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

const DEVNET_USDC = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
const TOKEN_PROGRAM = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ATA_PROGRAM = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const DECIMALS = 6;
const RPC = process.env.RPC_URL ?? "http://localhost:8899";

function loadKeypair(): Keypair {
  const file =
    process.env.KEYPAIR ?? path.join(os.homedir(), ".config/solana/id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")) as number[]),
  );
}

function ataFor(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM.toBytes(), mint.toBytes()],
    ATA_PROGRAM,
  )[0];
}

/* The SPL Mint layout, all 82 bytes of it. Written by hand because pulling in
 * @solana/spl-token for one struct is not worth the dependency. */
function mintAccountData(authority: PublicKey): Buffer {
  const data = Buffer.alloc(82);
  data.writeUInt32LE(1, 0); // COption::Some for the mint authority
  Buffer.from(authority.toBytes()).copy(data, 4);
  data.writeBigUInt64LE(BigInt(0), 36); // supply
  data.writeUInt8(DECIMALS, 44);
  data.writeUInt8(1, 45); // is_initialized
  data.writeUInt32LE(0, 46); // COption::None for the freeze authority
  return data;
}

function dump() {
  const authority = loadKeypair().publicKey;
  const account = {
    pubkey: DEVNET_USDC.toBase58(),
    account: {
      lamports: 1_461_600,
      data: [mintAccountData(authority).toString("base64"), "base64"],
      owner: TOKEN_PROGRAM.toBase58(),
      executable: false,
      rentEpoch: 0,
      space: 82,
    },
  };
  fs.writeFileSync("local-usdc.json", JSON.stringify(account, null, 2));
  console.log(`local-usdc.json written. Mint authority: ${authority.toBase58()}`);
  console.log("\nRestart the validator with:");
  console.log(
    `  solana-test-validator --reset --account ${DEVNET_USDC.toBase58()} local-usdc.json`,
  );
  console.log("\nThat wipes the ledger, so redeploy afterwards:");
  console.log("  anchor deploy --provider.cluster localnet");
  console.log("  npx tsx scripts/init-config.ts");
}

async function mint(toRaw: string, dollars: string) {
  if (!/localhost|127\.0\.0\.1/.test(RPC)) {
    throw new Error(`Refusing to run against ${RPC}. Localnet only.`);
  }
  const payer = loadKeypair();
  const owner = new PublicKey(toRaw);
  const amount = BigInt(Math.round(Number(dollars) * 10 ** DECIMALS));
  const connection = new Connection(RPC, "confirmed");

  const mintInfo = await connection.getAccountInfo(DEVNET_USDC);
  if (!mintInfo) {
    throw new Error(
      "No mint at the devnet USDC address. Run `dump` and restart the validator with --account.",
    );
  }
  const authority = new PublicKey(mintInfo.data.subarray(4, 36));
  if (!authority.equals(payer.publicKey)) {
    throw new Error(
      `This mint's authority is ${authority.toBase58()}, not you. It is probably a --clone of the real one.`,
    );
  }

  const ata = ataFor(owner, DEVNET_USDC);

  // CreateIdempotent, then MintTo. One transaction so a fresh wallet works.
  const createAta = new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: DEVNET_USDC, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });

  const mintTo = Buffer.alloc(9);
  mintTo.writeUInt8(7, 0); // TokenInstruction::MintTo
  mintTo.writeBigUInt64LE(amount, 1);

  const mintIx = new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: DEVNET_USDC, isSigner: false, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    ],
    data: mintTo,
  });

  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(createAta, mintIx),
    [payer],
    { commitment: "confirmed" },
  );

  const balance = await connection.getTokenAccountBalance(ata);
  console.log(`Minted ${dollars} USDC to ${owner.toBase58()}`);
  console.log(`Token account ${ata.toBase58()} now holds ${balance.value.uiAmountString}`);
  console.log(`tx ${sig}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "dump") {
  dump();
} else if (cmd === "mint" && rest.length === 2) {
  mint(rest[0], rest[1]).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
} else {
  console.log("usage:");
  console.log("  npx tsx scripts/local-usdc.ts dump");
  console.log("  npx tsx scripts/local-usdc.ts mint <address> <dollars>");
  process.exit(1);
}
