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

import { NONCE_COOKIE, readNonce } from "@/lib/identity";
import type { PendingLink } from "@/lib/link";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const jar = request.headers.get("cookie") ?? "";
  const m = new RegExp(`(?:^|; )${NONCE_COOKIE}=([^;]*)`).exec(jar);
  if (!m) return NextResponse.json({ pending: null });

  const row = await readNonce(decodeURIComponent(m[1]));
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
