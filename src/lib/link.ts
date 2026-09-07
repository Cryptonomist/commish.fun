/* The exact words a wallet is asked to sign.
 *
 * This file is imported by the browser AND by the route that verifies the
 * signature, which is the entire point of it existing separately. Ed25519 has
 * no forgiveness: one different space, one different line break, one locale
 * formatting a date differently, and a correct signature over a correct intent
 * verifies as false. Building the string in two places is how that bug gets
 * written, so it is built in one.
 *
 * It must stay free of server-only imports for the same reason.
 *
 * The wording is aimed at whoever is reading a wallet popup, not at us. People
 * have been trained to expect a signature request to be an attack, and they
 * are usually right. So the message says what it is for in the first line,
 * names the account and the wallet it is joining, and says plainly that it
 * moves nothing. A signature request that cannot be read is one that gets
 * approved by habit, which is the behaviour we would rather not teach.
 */

/** The literal string signed to bind a wallet to a social account. */
export function bindMessage(args: {
  handle: string;
  wallet: string;
  nonce: string;
  issuedAt: string;
}): string {
  return [
    "commish.fun",
    "",
    `Link this wallet to @${args.handle} on X.`,
    "",
    `Wallet: ${args.wallet}`,
    `Nonce: ${args.nonce}`,
    `Issued: ${args.issuedAt}`,
    "",
    "This proves you control both. It is not a transaction, it moves no money,",
    "and it gives nobody permission to spend anything.",
  ].join("\n");
}

/** The literal string signed to join or leave the public leaderboard.
 *
 *  Listing is a separate signature from linking because it is a separate
 *  decision with a much longer shadow: a link is visible to a league, a
 *  listing pairs a handle with an address in public and cannot be recalled
 *  from anyone who already saw it. Reusing the bind signature for it would
 *  mean one click did both, which is the thing the privacy page promises does
 *  not happen. */
export function listMessage(args: {
  list: boolean;
  wallet: string;
  nonce: string;
  issuedAt: string;
}): string {
  return [
    "commish.fun",
    "",
    args.list
      ? "Show this wallet and my X handle on the public leaderboard."
      : "Remove this wallet from the public leaderboard.",
    "",
    `Wallet: ${args.wallet}`,
    `Nonce: ${args.nonce}`,
    `Issued: ${args.issuedAt}`,
    "",
    args.list
      ? "Anyone will be able to see that this handle owns this address, and the"
      : "This removes the pairing from our page. It cannot remove it from anyone",
    args.list
      ? "ledger behind it. That cannot be undone once seen."
      : "who already saw it, or from the blockchain.",
  ].join("\n");
}

/** The literal string signed to delete the record entirely.
 *
 *  Separate wording again, for the same reason: a signature is consent to the
 *  sentence it was shown over and nothing else, so listing, unlisting and
 *  deleting cannot be substituted for one another after the fact. */
export function unlinkMessage(args: {
  wallet: string;
  nonce: string;
  issuedAt: string;
}): string {
  return [
    "commish.fun",
    "",
    "Unlink my X account from this wallet.",
    "",
    `Wallet: ${args.wallet}`,
    `Nonce: ${args.nonce}`,
    `Issued: ${args.issuedAt}`,
    "",
    "This removes our record. It does not remove anything from the blockchain,",
    "and it cannot remove a pairing anyone has already seen.",
  ].join("\n");
}

/** What `/api/auth/pending` returns once X has confirmed who someone is and
 *  before their wallet has agreed. Null when there is nothing in flight. */
export type PendingLink = {
  provider: string;
  handle: string;
  avatarUrl: string | null;
  nonce: string;
  issuedAt: string;
};

/** What `/api/auth/identity` returns for a wallet. */
export type LinkedIdentity = {
  wallet: string;
  provider: string;
  handle: string;
  avatarUrl: string | null;
  listed: boolean;
  linkedAt: number;
};
