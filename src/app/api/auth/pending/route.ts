/* What is waiting for a signature, if anything.
 *
 * The nonce cookie is httpOnly, so the page cannot read it. This route is how
 * the page gets the nonce back in order to build the message: it proves it
 * holds the cookie by asking a server that can see it. That is the whole
 * reason the cookie is httpOnly rather than readable, and the whole reason
 * this route exists.
 *
 * Returning the handle here is deliberate. Nobody should be asked to sign a
 * message naming an account without seeing which account it names first.
 */

import { NextResponse } from "next/server";

import { NONCE_COOKIE, readCookie, readNonce } from "@/lib/identity";
import type { PendingLink } from "@/lib/link";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  /* `readCookie` rather than a local regex and a bare decodeURIComponent. A
   * stray percent sign in that value threw a URIError before any validation
   * and came back as an empty 500, which is a strange answer from a route
   * whose honest reply to almost everything is "nothing pending". */
  const carried = readCookie(request, NONCE_COOKIE);
  if (!carried) return NextResponse.json({ pending: null });

  const row = await readNonce(carried);
  if (!row) return NextResponse.json({ pending: null });

  const pending: PendingLink = {
    provider: row.provider,
    handle: row.handle,
    avatarUrl: row.avatar_url || null,
    nonce: row.nonce,
    issuedAt: new Date(row.issued_at * 1000).toISOString(),
  };

  return NextResponse.json(
    { pending },
    { headers: { "cache-control": "no-store" } },
  );
}
