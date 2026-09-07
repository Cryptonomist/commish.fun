/* Who is this address, if anyone, and have they agreed to be public.
 *
 * Reads only. A wallet address is already public on the ledger and a link is
 * already visible inside a league, so returning a handle for an address that
 * asked for one is not a disclosure. `listed` is returned because the owner's
 * own UI needs to render the toggle in the right position.
 *
 * DELETE removes the record. It takes a signature like everything else that
 * writes: nobody unlinks somebody else.
 */

import { NextResponse } from "next/server";

import { d1 } from "@/lib/d1";
import {
  burnNonce,
  identityFor,
  isWallet,
  issueNonce,
  readNonce,
  verifySignature,
} from "@/lib/identity";
import { unlinkMessage, type LinkedIdentity } from "@/lib/link";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet") ?? "";
  if (!isWallet(wallet)) {
    return NextResponse.json({ identity: null });
  }

  const row = await identityFor(wallet);
  if (!row) return NextResponse.json({ identity: null });

  const identity: LinkedIdentity = {
    wallet: row.wallet,
    provider: row.provider,
    handle: row.handle,
    avatarUrl: row.avatar_url || null,
    listed: row.listed === 1,
    linkedAt: row.linked_at,
  };

  return NextResponse.json(
    { identity },
    { headers: { "cache-control": "no-store" } },
  );
}

/* Issue a challenge for an action on an EXISTING identity: unlinking, or
 * changing the leaderboard setting.
 *
 * The linking flow gets its challenge from the X callback, because that is
 * where the identity is established. These actions already have an identity,
 * so the challenge is minted here instead and pinned to the wallet: it is
 * stored under provider `self` with the address as the provider id, and the
 * routes that spend it check that the address in the signed message is the
 * same one. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    wallet?: unknown;
  } | null;
  const wallet = typeof body?.wallet === "string" ? body.wallet : "";

  if (!isWallet(wallet)) {
    return NextResponse.json({ error: "Not a wallet address." }, { status: 400 });
  }

  const row = await identityFor(wallet);
  if (!row) {
    return NextResponse.json(
      { error: "That wallet has nothing linked to it." },
      { status: 404 },
    );
  }

  const nonce = await issueNonce({
    provider: "self",
    providerId: wallet,
    handle: row.handle,
    avatarUrl: row.avatar_url,
  });

  return NextResponse.json({
    nonce: nonce.nonce,
    issuedAt: new Date(nonce.issued_at * 1000).toISOString(),
    handle: row.handle,
  });
}

/* Unlink. The signed text is the listing message with `list: false` plus the
 * word that makes it an unlink, so a listing signature cannot be replayed as a
 * deletion. */
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    wallet?: unknown;
    nonce?: unknown;
    signature?: unknown;
  } | null;

  const wallet = typeof body?.wallet === "string" ? body.wallet : "";
  const nonce = typeof body?.nonce === "string" ? body.nonce : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";

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

  const message = unlinkMessage({
    wallet,
    nonce,
    issuedAt: new Date(row.issued_at * 1000).toISOString(),
  });

  if (!verifySignature({ wallet, message, signatureBase64: signature })) {
    return NextResponse.json(
      { error: "That signature did not match the wallet." },
      { status: 401 },
    );
  }

  await d1("DELETE FROM identity WHERE wallet = ?", [wallet]);
  /* The cached standing row goes too. It is keyed by wallet and its only
   * purpose is feeding a leaderboard this address is no longer on. */
  await d1("DELETE FROM standing WHERE wallet = ?", [wallet]);

  return NextResponse.json({ unlinked: true });
}
