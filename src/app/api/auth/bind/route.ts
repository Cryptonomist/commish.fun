/* The wallet's half of the proof, and the only route that writes an identity.
 *
 * The client sends two things: an address, and a signature. It does not send
 * the handle, the provider, the X id or the message. All of those are rebuilt
 * here from the challenge row, so there is no field a caller can vary in order
 * to have a signature over one statement accepted as consent to another.
 *
 * The nonce is spent whatever happens after it is read. A challenge that has
 * been presented once is finished, successfully or not, which is what stops a
 * captured signature being replayed and stops the route being used to grind
 * signatures against a nonce that stays valid.
 */

import { NextResponse } from "next/server";

import {
  NONCE_COOKIE,
  READ_COOKIE,
  READ_COOKIE_MAX_AGE,
  bindIdentity,
  bindTextFor,
  burnNonce,
  isWallet,
  readCookie,
  readNonce,
  verifySignature,
} from "@/lib/identity";
import { oauthCookie } from "@/lib/xauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const carried = readCookie(request, NONCE_COOKIE);
  if (!carried) {
    return NextResponse.json(
      { error: "Nothing is waiting to be linked. Start with Connect X." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    wallet?: unknown;
    signature?: unknown;
  } | null;

  const wallet = typeof body?.wallet === "string" ? body.wallet : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";

  if (!isWallet(wallet) || !signature) {
    return NextResponse.json(
      { error: "That request was missing a wallet or a signature." },
      { status: 400 },
    );
  }

  const row = await readNonce(carried);

  /* The nonce must be one a PROVIDER callback minted, not one this route's
   * neighbours hand out.
   *
   * Two kinds share the table. A `provider: "x"` row is written by the X
   * callback and carries an account X just vouched for. A `provider: "self"`
   * row is written by POST /api/auth/identity for a wallet that is already
   * linked, and it carries THAT wallet's handle.
   *
   * Without this check the two are interchangeable here, and the second kind
   * is minted with no signature and no cookie by anyone who knows an address.
   * So: ask for a self nonce naming somebody else's wallet, receive their
   * handle and the issue time in the reply, sign the resulting sentence with
   * your OWN key, present it here, and walk away with a record putting their
   * handle against your address. The listing and unlink routes both check the
   * provider. This one did not, which made them the careful exceptions rather
   * than the rule. */
  if (!row || row.provider === "self") {
    return NextResponse.json(
      { error: "That link request expired. Connect X again." },
      { status: 400 },
    );
  }

  // Spent on sight, before the answer is known.
  await burnNonce(row.nonce);

  const ok = verifySignature({
    wallet,
    message: bindTextFor(row, wallet),
    signatureBase64: signature,
  });

  if (!ok) {
    /* One message for a wrong signature, a wrong wallet and a mangled one.
     * Which of the three it was is not a visitor's business and telling them
     * would be a free oracle. */
    return NextResponse.json(
      { error: "That signature did not match the wallet. Nothing was linked." },
      { status: 401 },
    );
  }

  const readToken = await bindIdentity({
    wallet,
    provider: row.provider,
    providerId: row.provider_id,
    handle: row.handle,
    avatarUrl: row.avatar_url || null,
  });

  const res = NextResponse.json({
    wallet,
    provider: row.provider,
    handle: row.handle,
    avatarUrl: row.avatar_url || null,
    /* Say it out loud in the response, because the UI says it too: linking is
     * not listing, and this route never sets `listed`. */
    listed: false,
  });
  res.cookies.set(NONCE_COOKIE, "", { ...oauthCookie(request), maxAge: 0 });

  /* The capability to read this record back.
   *
   * The wallet has just proved itself, and this is the moment to hand over the
   * only thing that will open an unlisted row afterwards. It authorises one
   * read; listing, unlisting and unlinking each still cost a fresh signature
   * over a sentence that says what they do. */
  res.cookies.set(READ_COOKIE, readToken, {
    ...oauthCookie(request),
    maxAge: READ_COOKIE_MAX_AGE,
  });
  return res;
}
