/* Step one of two: send the browser to X and ask X who this is.
 *
 * X's OAuth 2 with PKCE. The verifier never leaves this server, the challenge
 * is what travels, and the callback proves it started here by producing the
 * verifier again. `state` is the CSRF check on top: a callback carrying a
 * state we did not mint is somebody else's flow being replayed into ours.
 *
 * Both live in httpOnly cookies rather than in a session store, because there
 * is no session store and this data is worthless in ninety seconds.
 */

import { NextResponse } from "next/server";
import crypto from "node:crypto";

import {
  PKCE_COOKIE,
  RETURN_COOKIE,
  STATE_COOKIE,
  randomToken,
} from "@/lib/identity";
import {
  oauthCookie,
  redirectUri,
  safeReturnPath,
  xClientId,
} from "@/lib/xauth";

/* This route mints secrets. Caching it would be catastrophic and Next has no
 * way to know that, so say so. */
export const dynamic = "force-dynamic";

const base64url = (b: Buffer): string =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function GET(request: Request) {
  const clientId = xClientId();
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "X sign-in is not configured. Set X_CLIENT_ID and X_CLIENT_SECRET " +
          "(or TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET) in the Vercel project.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);

  /* Where to land afterwards. Resolved and origin-checked rather than pattern
   * matched, because pattern matching this is how the backslash got through.
   * See `safeReturnPath`. */
  const from = safeReturnPath(url.searchParams.get("from") ?? "/", url.origin);

  const verifier = randomToken();
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest(),
  );
  const state = randomToken();

  const authorize = new URL("https://x.com/i/oauth2/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri(request));
  /* The narrowest scope that answers "who is this".
   *
   * No `offline.access`, so X never issues a refresh token: we ask one
   * question, once, and never speak to X on this person's behalf again. There
   * is nothing to store and nothing to leak. `tweet.read` is X's companion
   * requirement for reading a user object, not a licence to read anything. */
  authorize.searchParams.set("scope", "users.read tweet.read");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set(PKCE_COOKIE, verifier, oauthCookie(request));
  res.cookies.set(STATE_COOKIE, state, oauthCookie(request));
  res.cookies.set(RETURN_COOKIE, from, oauthCookie(request));
  return res;
}
