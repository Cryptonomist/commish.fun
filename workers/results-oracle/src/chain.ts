/* The chain, from a worker: read pools and members, send one instruction at
 * a time, and know whether it landed.
 *
 * ONE INSTRUCTION PER TRANSACTION, on purpose. A week's crank is a handful of
 * sends, and when one of them is refused the program's error names exactly
 * which one and why. Batching them would save a few cents of fees and cost
 * that clarity, and the refusals are the interesting part: `AlreadyProcessed`
 * and `ResultsAlreadyPosted` are how a re-run or an overlapping tick turns out
 * harmless rather than double-acting.
 *
 * NO WEBSOCKETS. `sendAndConfirmTransaction` subscribes for the confirmation,
 * which is the wrong tool inside a scheduled worker with no long-lived
 * connection. This sends the raw transaction and polls the signature, which
 * is what "confirmed" means anyway, and gives up when the blockhash it was
 * signed against can no longer be valid.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";

import {
  decodeMember,
  decodePool,
  discriminatorFilter,
  memberAccountFilters,
  PROGRAM_ID,
  type MemberView,
  type PoolView,
} from "@/lib/program";

export function rpcUrl(cluster: "devnet" | "mainnet", apiKey: string): string {
  return `https://${cluster}.helius-rpc.com/?api-key=${apiKey}`;
}

/* THE CHAIN'S CLOCK, NOT THIS MACHINE'S.
 *
 * Every "not before" rule the program enforces is judged against the Clock
 * sysvar, so a worker that decides "is it time yet" from its own wall clock is
 * comparing against the wrong clock. That is not theoretical: the devnet drill
 * slept past the posting floor on a monotonic timer and then read a wall clock
 * that had been stepped backwards under it, and refused to post a week the
 * program would have accepted. Reading the sysvar makes the precondition here
 * the same test the program applies, to the second, on every cluster.
 *
 * The Clock sysvar is forty bytes: slot, epoch start, epoch, leader schedule
 * epoch, then unix_timestamp as an i64 at offset 32. */
export async function chainNow(connection: Connection): Promise<number> {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, "processed");
  if (!info || info.data.length < 40) throw new Error("could not read the Clock sysvar");
  return Number(Buffer.from(info.data).readBigInt64LE(32));
}

/** The poster, from the JSON byte array the Solana CLI writes. */
export function posterFromSecret(json: string): Keypair {
  const bytes = JSON.parse(json) as unknown;
  if (!Array.isArray(bytes) || bytes.length !== 64) {
    throw new Error("ORACLE_KEYPAIR must be the 64-byte JSON array a keypair file holds");
  }
  return Keypair.fromSecretKey(Uint8Array.from(bytes as number[]));
}

export type PoolAt = { address: PublicKey; pool: PoolView };
export type MemberAt = { address: PublicKey; member: MemberView };

export async function allPools(connection: Connection): Promise<PoolAt[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: discriminatorFilter("Pool"),
  });
  return accounts.map((a) => ({ address: a.pubkey, pool: decodePool(a.account.data) }));
}

export async function membersOf(connection: Connection, pool: PublicKey): Promise<MemberAt[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: memberAccountFilters(pool),
  });
  return accounts.map((a) => ({ address: a.pubkey, member: decodeMember(a.account.data) }));
}

export async function poolAt(connection: Connection, address: PublicKey): Promise<PoolView> {
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) throw new Error(`pool ${address.toBase58()} vanished`);
  return decodePool(info.data);
}

const POLL_MS = 1_500;
const POLL_TRIES = 30;

/**
 * Sign, send, and wait for "confirmed". Throws with the program's own message
 * when the transaction is refused, so the caller can tell a real failure from
 * an "already done".
 */
export async function sendOne(
  connection: Connection,
  ix: TransactionInstruction,
  payer: Keypair,
): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight });
  tx.add(ix);
  tx.sign(payer);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  for (let i = 0; i < POLL_TRIES; i++) {
    const { value } = await connection.getSignatureStatuses([sig]);
    const s = value[0];
    if (s?.err) throw new Error(`${sig} failed: ${JSON.stringify(s.err)}`);
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") {
      return sig;
    }
    const height = await connection.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight) {
      throw new Error(`${sig} expired before it was confirmed`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`${sig} not confirmed after ${(POLL_TRIES * POLL_MS) / 1000}s`);
}
