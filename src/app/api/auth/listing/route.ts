/* The second opt-in, on its own route, behind its own signature.
 *
 * This is the only thing in the product that makes a private pairing public,
 * so it is the one place worth being pedantic about consent. It cannot be
 * reached by linking, it cannot be reached by re-linking, and the signature it
 * accepts is over a sentence that says in words what will become visible.
 *
 * The direction is decided by the SIGNATURE, not by the flag in the body. The
 * server builds the text for whichever direction the caller claims and checks
 * that; a signature over "show me" therefore cannot be presented as consent to
 * "remove me", or the reverse, because neither verifies against the other's
 * text.
 */

import { NextResponse } from "next/server";

import {
  burnNonce,
  identityFor,
  isWallet,
  readNonce,
  setListed,
  verifySignature,
} from "@/lib/identity";
import { listMessage } from "@/lib/link";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    wallet?: unknown;
    nonce?: unknown;
    signature?: unknown;
    list?: unknown;
  } | null;

  const wallet = typeof body?.wallet === "string" ? body.wallet : "";
  const nonce = typeof body?.nonce === "string" ? body.nonce : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";
  const list = body?.list === true;

  if (!isWallet(wallet) || !nonce || !signature) {
    return NextResponse.json({ error: "Incomplete request." }, { status: 400 });
  }

  const row = await readNonce(nonce);
  if (!row || row.provider !== "self" || row.provider_id !== wallet) {
    return NextResponse.json(
      { error: "That request expired. Try again." },
      { status: 400 },
    );
  }

  await burnNonce(nonce);

  /* An address with nothing linked has no handle to publish, so there is
   * nothing this could mean. Checked after the nonce is spent so the failure
   * cannot be used to probe which addresses are linked. */
  const identity = await identityFor(wallet);
  if (!identity) {
    return NextResponse.json(
      { error: "That wallet has nothing linked to it." },
      { status: 404 },
    );
  }

  const message = listMessage({
    list,
    wallet,
    nonce,
    issuedAt: new Date(row.issued_at * 1000).toISOString(),
  });

  if (!verifySignature({ wallet, message, signatureBase64: signature })) {
    return NextResponse.json(
      { error: "That signature did not match the wallet. Nothing changed." },
      { status: 401 },
    );
  }

  await setListed(wallet, list);
  return NextResponse.json({ listed: list });
}
