/* The server half of linking: issuing challenges, spending them, and checking
 * that a wallet really signed one.
 *
 * The shape to keep in mind is that there is NO login session anywhere in this
 * product. Nothing sets a cookie that means "you are @somebody". The only
 * durable statement is the row in `identity`, and the only way to write one is
 * to present a nonce the server issued and a signature over it from the wallet
 * named inside the message. A stolen cookie buys nothing, because there is no
 * cookie that authorises anything on its own.
 *
 * Server-only, and the `server-only` import enforces it: the verification
 * below is worthless if a client ever gets to run its own copy.
 */

import "server-only";

import crypto from "node:crypto";
import { PublicKey } from "@solana/web3.js";

import { d1, d1One } from "./d1";
import { bindMessage, listMessage } from "./link";

/** How long a challenge is good for.
 *
 *  Long enough to read a wallet popup carefully, unlock a hardware device and
 *  think about it. Short enough that an abandoned tab is not a standing
 *  invitation. */
export const NONCE_TTL_SECS = 10 * 60;

/** The cookie that carries the in-flight nonce.
 *
 *  It is httpOnly, so the nonce is never in a URL, never in browser history,
 *  never in a Referer header and never readable by a script on the page. The
 *  browser still needs the nonce itself to build the message, and gets it from
 *  `/api/auth/pending`, which reads this cookie. Binding therefore requires
 *  both the cookie and the row, and a nonce lifted from one of them alone is
 *  not enough. */
export const NONCE_COOKIE = "commish_link";

/** Where to send the browser after the round trip to X. Set at `start`, read
 *  at `callback`, so linking from a pool page comes back to that pool page. */
export const RETURN_COOKIE = "commish_link_from";

export const PKCE_COOKIE = "commish_pkce";
export const STATE_COOKIE = "commish_state";

export type NonceRow = {
  nonce: string;
  provider: string;
  provider_id: string;
  handle: string;
  avatar_url: string | null;
  issued_at: number;
  expires_at: number;
};

export type IdentityRow = {
  wallet: string;
  provider: string;
  provider_id: string;
  handle: string;
  avatar_url: string | null;
  listed: number;
  linked_at: number;
};

export const nowSecs = (): number => Math.floor(Date.now() / 1000);

/** 32 bytes of CSPRNG, hex encoded. Not a UUID: a v4 UUID is 122 bits and this
 *  is the only thing standing between a stranger and someone else's handle. */
export const randomToken = (): string =>
  crypto.randomBytes(32).toString("hex");

/* Write a challenge and hand back its key.
 *
 * The identity is stored HERE rather than sent to the browser because the
 * browser must not be able to choose which account it is claiming. All it ever
 * holds is an opaque token; the provider, the id and the handle are read back
 * out of this row at bind time. */
export async function issueNonce(args: {
  provider: string;
  providerId: string;
  handle: string;
  avatarUrl: string | null;
}): Promise<NonceRow> {
  const issued = nowSecs();
  const row: NonceRow = {
    nonce: randomToken(),
    provider: args.provider,
    provider_id: args.providerId,
    handle: args.handle,
    avatar_url: args.avatarUrl,
    issued_at: issued,
    expires_at: issued + NONCE_TTL_SECS,
  };

  /* Sweep before inserting. There is no cron on this table and an expired
   * challenge is dead weight, so the cheapest place to clean up is the next
   * write. It is one indexed delete. */
  await d1("DELETE FROM nonce WHERE expires_at < ?", [issued]);

  await d1(
    `INSERT INTO nonce (nonce, provider, provider_id, handle, avatar_url, issued_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.nonce,
      row.provider,
      row.provider_id,
      row.handle,
      row.avatar_url ?? "",
      row.issued_at,
      row.expires_at,
    ],
  );

  return row;
}

/** Read a challenge without spending it. Returns null if it is unknown or
 *  expired, and the two are not distinguished on purpose. */
export async function readNonce(nonce: string): Promise<NonceRow | null> {
  if (!/^[0-9a-f]{64}$/.test(nonce)) return null;
  const row = await d1One<NonceRow>(
    "SELECT * FROM nonce WHERE nonce = ? AND expires_at >= ?",
    [nonce, nowSecs()],
  );
  return row ?? null;
}

/** Spend a challenge. Deleting it is what makes a captured signature useless
 *  the second time it is presented. */
export async function burnNonce(nonce: string): Promise<void> {
  await d1("DELETE FROM nonce WHERE nonce = ?", [nonce]);
}

/* Does this base58 address's key actually sign this text?
 *
 * Node has ed25519 natively, so there is no dependency here. It wants a key
 * object rather than 32 raw bytes, and the shortest honest way to get one is
 * to wrap the raw key in the twelve-byte DER prefix that says "SPKI, ed25519,
 * 32-byte bit string". That prefix is a constant, not a computation.
 *
 * Every failure path returns false rather than throwing. A malformed address,
 * a signature of the wrong length and a wrong signature are the same answer to
 * the caller, and telling them apart in a response would be a free oracle. */
export function verifySignature(args: {
  wallet: string;
  message: string;
  signatureBase64: string;
}): boolean {
  try {
    const raw = new PublicKey(args.wallet).toBytes();
    if (raw.length !== 32) return false;

    const sig = Buffer.from(args.signatureBase64, "base64");
    if (sig.length !== 64) return false;

    const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(raw)]),
      format: "der",
      type: "spki",
    });

    return crypto.verify(
      null,
      Buffer.from(args.message, "utf8"),
      key,
      sig,
    );
  } catch {
    return false;
  }
}

/** True if `wallet` is a syntactically valid Solana address. */
export function isWallet(wallet: string): boolean {
  try {
    return new PublicKey(wallet).toBytes().length === 32;
  } catch {
    return false;
  }
}

/* Bind a wallet to the identity a challenge is holding.
 *
 * The uniqueness rules are enforced here as well as by the schema, so the
 * caller gets a sentence rather than a constraint violation:
 *
 *   - a wallet holds one identity, and re-linking replaces it
 *   - a social account lives on one wallet, and moving it releases the old one
 *
 * The second is the interesting one. Someone who linked the wrong wallet has
 * to be able to move, or their handle is stranded on an address they may not
 * control any more. Moving deletes the old row, and deliberately does NOT
 * carry `listed` across: the new address has never agreed to be public, and
 * inheriting that consent from a different address is precisely the kind of
 * quiet opt-in the privacy page rules out. */
export async function bindIdentity(args: {
  wallet: string;
  provider: string;
  providerId: string;
  handle: string;
  avatarUrl: string | null;
}): Promise<void> {
  const at = nowSecs();

  await d1("DELETE FROM identity WHERE provider = ? AND provider_id = ?", [
    args.provider,
    args.providerId,
  ]);

  await d1(
    `INSERT INTO identity (wallet, provider, provider_id, handle, avatar_url, listed, linked_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(wallet) DO UPDATE SET
       provider    = excluded.provider,
       provider_id = excluded.provider_id,
       handle      = excluded.handle,
       avatar_url  = excluded.avatar_url,
       linked_at   = excluded.linked_at`,
    [
      args.wallet,
      args.provider,
      args.providerId,
      args.handle,
      args.avatarUrl ?? "",
      at,
    ],
  );
}

/* Note that the UPDATE branch leaves `listed` alone.
 *
 * Re-linking the same wallet, which is what someone does when their handle
 * changes, must not silently switch off a listing they chose. Only the
 * leaderboard route moves that column, and only against a signature that says
 * so in words. */

export async function identityFor(
  wallet: string,
): Promise<IdentityRow | null> {
  if (!isWallet(wallet)) return null;
  return d1One<IdentityRow>("SELECT * FROM identity WHERE wallet = ?", [
    wallet,
  ]);
}

export async function setListed(
  wallet: string,
  listed: boolean,
): Promise<void> {
  await d1("UPDATE identity SET listed = ? WHERE wallet = ?", [
    listed ? 1 : 0,
    wallet,
  ]);
}

/* The two messages, rebuilt server-side from the stored row.
 *
 * The client sends a wallet and a signature and nothing else. Everything else
 * in the signed text comes from the challenge row, so there is no field a
 * caller can vary to get a signature over one thing accepted as consent to
 * another. */
export const bindTextFor = (row: NonceRow, wallet: string): string =>
  bindMessage({
    handle: row.handle,
    wallet,
    nonce: row.nonce,
    issuedAt: new Date(row.issued_at * 1000).toISOString(),
  });

export const listTextFor = (
  row: NonceRow,
  wallet: string,
  list: boolean,
): string =>
  listMessage({
    list,
    wallet,
    nonce: row.nonce,
    issuedAt: new Date(row.issued_at * 1000).toISOString(),
  });
