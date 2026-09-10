/* Send a signed transaction, and find out honestly whether it landed.
 *
 * A BLOCKHASH EXPIRING IS NOT A FAILED TRANSACTION, and saying it is is the
 * worst thing a money screen can do. The blockhash is fetched before the wallet
 * popup opens and is good for about a minute. A hardware wallet, a phone that
 * switches to its wallet app and back, or somebody who reads the popup
 * carefully will routinely exceed that, and `confirmTransaction` then throws
 * TransactionExpiredBlockheightExceeded — while the transaction may well have
 * landed. Telling somebody their money did not move when it did is worse than
 * any other error, so an expiry asks the chain rather than assuming.
 *
 * This is the routine the pool page's join has used since the join path was
 * hardened, moved here so a second screen that spends money does not grow a
 * second copy of it. A transaction that landed WITH an error is still reported
 * as failed: `landed` requires the status to carry no error, not merely to
 * exist.
 */

import type { Connection, Transaction } from "@solana/web3.js";

export type Blockhash = { blockhash: string; lastValidBlockHeight: number };

export async function sendAndConfirm(
  connection: Connection,
  signed: Transaction,
  latest: Blockhash,
  /** Called once the transaction is on the wire, before it is confirmed. */
  onSent?: (signature: string) => void,
): Promise<string> {
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    preflightCommitment: "confirmed",
  });
  onSent?.(signature);

  try {
    const result = await connection.confirmTransaction(
      { signature, ...latest },
      "confirmed",
    );
    if (result.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
    }
    return signature;
  } catch (err) {
    const st = await connection
      .getSignatureStatus(signature, { searchTransactionHistory: true })
      .catch(() => null);
    const landed =
      !!st?.value &&
      !st.value.err &&
      (st.value.confirmationStatus === "confirmed" ||
        st.value.confirmationStatus === "finalized");
    if (!landed) throw err;
    return signature;
  }
}
