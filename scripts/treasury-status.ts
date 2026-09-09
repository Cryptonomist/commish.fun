/* Where the platform fee goes, and how much has arrived.
 *
 *   RPC_URL=<rpc> npx tsx scripts/treasury-status.ts
 *
 * Reads Config for the treasury, then that treasury's USDC token account.
 * Read-only; no key is loaded.
 */

import { Connection } from "@solana/web3.js";

import { ataFor, configPda, decodeConfig, PROGRAM_ID, USDC_MINT } from "@/lib/program";

const RPC = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const info = await connection.getAccountInfo(configPda(), "confirmed");
  if (!info) throw new Error(`No Config at ${configPda().toBase58()} on ${RPC}`);
  const config = decodeConfig(info.data);
  const ata = ataFor(config.feeTreasury, USDC_MINT);

  console.log(`program    ${PROGRAM_ID.toBase58()}`);
  console.log(`admin      ${config.admin.toBase58()}`);
  console.log(`treasury   ${config.feeTreasury.toBase58()}`);
  console.log(`fee        ${config.defaultFeeBps} bps, cap ${Number(config.defaultFeeCap) / 1e6} USDC, paused=${config.paused}`);
  console.log(`usdc ata   ${ata.toBase58()}`);

  const bal = await connection.getTokenAccountBalance(ata, "confirmed").catch(() => null);
  console.log(`balance    ${bal ? bal.value.uiAmountString : "(no USDC account yet)"} USDC`);

  const sol = await connection.getBalance(config.feeTreasury, "confirmed");
  console.log(`treasury   ${sol / 1e9} SOL`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
