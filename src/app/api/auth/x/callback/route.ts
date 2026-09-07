/* Step two: X has answered, and the answer is put somewhere the browser
 * cannot edit.
 *
 * What does NOT happen here is a login. Nothing this route sets means "you are
 * @somebody". It writes a challenge row holding what X said, hands the browser
 * an opaque key to that row, and stops. The wallet signature is what turns it
 * into a record, and that is a separate request the person has to approve in
 * their wallet.
 *
 * So a stolen `commish_link` cookie is worth one thing: the chance to bind
 * that X account to a wallet the thief controls, within ten minutes, which
 * gains them a handle next to an address nobody has heard of. There is no
 * amount of it that reaches anyone's money, because nothing in this product
 * spends from a wallet on the strength of who you are.
 */

import { NextResponse } from "next/server";

import {
  NONCE_COOKIE,
  NONCE_TTL_SECS,
  PKCE_COOKIE,
  RETURN_COOKIE,
  STATE_COOKIE,
  issueNonce,
} from "@/lib/identity";
import {
  biggerAvatar,
  exchangeCode,
  fetchXUser,
  oauthCookie,
  redirectUri,
} from "@/lib/xauth";

export const dynamic = "force-dynamic";

/** Send them back where they started with a message, rather than rendering an
 *  error page from an API route. The page reads `?link=` and says something
 *  human. */
function back(request: Request, to: string, status: string) {
  const dest = new URL(to, new URL(request.url).origin);
  dest.searchParams.set("link", status);
  const res = NextResponse.redirect(dest.toString());
  // These are spent either way. Clear them on every path out of here.
  for (const c of [PKCE_COOKIE, STATE_COOKIE, RETURN_COOKIE]) {
    res.cookies.set(c, "", { ...oauthCookie(request), maxAge: 0 });
  }
  return res;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = request.headers.get("cookie") ?? "";
  const read = (name: string): string | null => {
    const m = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(jar);
    return m ? decodeURIComponent(m[1]) : null;
  };

  const from = read(RETURN_COOKIE) ?? "/";
  const to = from.startsWith("/") && !from.startsWith("//") ? from : "/";

  /* The person pressed cancel on X's screen. Not an error, and it should not
   * read like one. */
  if (url.searchParams.get("error")) return back(request, to, "cancelled");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = read(STATE_COOKIE);
  const verifier = read(PKCE_COOKIE);

  /* Compare in constant time out of habit rather than necessity. The state is
   * ours, single use and short lived, but a timing-safe compare costs nothing
   * and means nobody has to reason about whether it mattered here. */
  const stateOk =
    Boolean(state && expected) &&
    state!.length === expected!.length &&
    Buffer.from(state!).equals(Buffer.from(expected!));

  if (!code || !verifier || !stateOk) return back(request, to, "expired");

  try {
    const token = await exchangeCode({
      code,
      verifier,
      redirectUri: redirectUri(request),
    });
    const user = await fetchXUser(token);
    // The token is now finished with. It is a local const and dies here.

    const nonce = await issueNonce({
      provider: "x",
      providerId: user.id,
      handle: user.username,
      avatarUrl: biggerAvatar(user.profile_image_url),
    });

    const res = back(request, to, "signed");
    res.cookies.set(NONCE_COOKIE, nonce.nonce, {
      ...oauthCookie(request),
      maxAge: NONCE_TTL_SECS,
    });
    return res;
  } catch (err) {
    /* Log the real reason for us, tell the browser nothing.
     *
     * The failures here are a mistyped callback URL in the X app, a revoked
     * secret and a rate limit, all of which are our problem to read in the
     * Vercel logs and none of which a visitor can act on. */
    console.error("[auth/x/callback]", err);
    return back(request, to, "failed");
  }
}
