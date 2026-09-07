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
  bindIdentity,
  bindTextFor,
  burnNonce,
  isWallet,
  readNonce,
  verifySignature,
} from "@/lib/identity";
import { oauthCookie } from "@/lib/xauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const jar = request.headers.get("cookie") ?? "";
  const m = new RegExp(`(?:^|; )${NONCE_COOKIE}=([^;]*)`).exec(jar);
  if (!m) {
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

  const row = await readNonce(decodeURIComponent(m[1]));
  if (!row) {
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

  await bindIdentity({
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
  return res;
}
