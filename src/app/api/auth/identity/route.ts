/* Your own record: reading it, getting a challenge against it, deleting it.
 *
 * THE MISTAKE THIS FILE USED TO MAKE, because the fix only reads as fussy if
 * you do not know what it is for.
 *
 * GET took a `?wallet=` and answered with the handle for whatever address it
 * was given. The reasoning was that an address is public on the ledger anyway,
 * so returning a name for one is not a disclosure. That reasoning is wrong,
 * and the site's own privacy page is the thing that says so: the disclosure is
 * not the address and it is not the handle, it is the PAIRING, and publishing
 * the pairing is the entire subject of the second opt-in. Every member wallet
 * is enumerable with one `getProgramAccounts` call, so an endpoint that maps
 * address to handle for the asking is a complete directory of everyone who
 * linked, including everyone who looked at the leaderboard toggle and said no.
 *
 * So reads now need one of two things. Either the row is already public,
 * because its owner signed a sentence saying to publish it, or the caller
 * holds the capability cookie handed out when that wallet's signature was
 * accepted. A bare address gets nothing.
 */

import { NextResponse } from "next/server";

import { d1 } from "@/lib/d1";
import {
  READ_COOKIE,
  burnNonce,
  identityByToken,
  identityFor,
  isWallet,
  issueNonce,
  readCookie,
  readNonce,
  verifySignature,
} from "@/lib/identity";
import { unlinkMessage, type LinkedIdentity } from "@/lib/link";
import type { IdentityRow } from "@/lib/identity";

export const dynamic = "force-dynamic";

const view = (row: IdentityRow): LinkedIdentity => ({
  wallet: row.wallet,
  provider: row.provider,
  handle: row.handle,
  avatarUrl: row.avatar_url || null,
  listed: row.listed === 1,
  linkedAt: row.linked_at,
});

/* The row this request is entitled to see, or null.
 *
 * Order matters. The cookie is checked FIRST and its row returned whatever
 * `?wallet=` said, so the panel works for its owner without the address ever
 * being trusted as an identifier. The public fallback then serves a row only
 * when `listed = 1`, which is information the leaderboard prints anyway. */
async function permitted(request: Request): Promise<IdentityRow | null> {
  const token = readCookie(request, READ_COOKIE);
  if (token) {
    const mine = await identityByToken(token);
    if (mine) return mine;
  }

  const wallet = new URL(request.url).searchParams.get("wallet") ?? "";
  if (!isWallet(wallet)) return null;

  const row = await identityFor(wallet);
  return row && row.listed === 1 ? row : null;
}

export async function GET(request: Request) {
  const row = await permitted(request);
  return NextResponse.json(
    { identity: row ? view(row) : null },
    { headers: { "cache-control": "no-store" } },
  );
}

/* A challenge for an action on a record you already hold.
 *
 * The linking flow gets its challenge from the X callback, because that is
 * where the identity is established. These actions have one already, so the
 * challenge is minted here and pinned to the wallet: stored under provider
 * `self` with the address as the provider id, and the routes that spend it
 * check both. `/api/auth/bind` refuses a `self` nonce outright, so one cannot
 * be started as a listing and finished as a link.
 *
 * The capability cookie is required. Without it this was a second way to ask
 * "what handle owns this address" and get an answer, which would have left the
 * hole in GET exactly where it was. It also stops a stranger writing rows into
 * the nonce table by naming addresses off the chain. */
export async function POST(request: Request) {
  const token = readCookie(request, READ_COOKIE);
  const row = token ? await identityByToken(token) : null;

  if (!row) {
    return NextResponse.json(
      {
        error:
          "This browser has not proved it holds that wallet. Link it again to continue.",
      },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    wallet?: unknown;
  } | null;
  const wallet = typeof body?.wallet === "string" ? body.wallet : "";

  /* The caller has to name the same wallet the cookie belongs to. It cannot
   * pick a different one, and being told when it does not match costs nothing:
   * whoever holds the cookie already knows which address it is for. */
  if (wallet !== row.wallet) {
    return NextResponse.json(
      { error: "That is not the wallet this browser linked." },
      { status: 403 },
    );
  }

  const nonce = await issueNonce({
    provider: "self",
    providerId: row.wallet,
    handle: row.handle,
    avatarUrl: row.avatar_url,
  });

  /* No handle in the reply. The caller supplied nothing we did not already
   * hand them, and echoing it back would make this an oracle again for
   * anybody who ever gets hold of a cookie. */
  return NextResponse.json({
    nonce: nonce.nonce,
    issuedAt: new Date(nonce.issued_at * 1000).toISOString(),
  });
}

/* Unlink. The signed sentence is its own, so a listing signature cannot be
 * presented as a deletion. */
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

  /* And the capability, which now opens nothing. Clearing it means the panel
   * shows "not linked" on the next load rather than a stale record. */
  const res = NextResponse.json({ unlinked: true });
  res.cookies.set(READ_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 0,
  });
  return res;
}
