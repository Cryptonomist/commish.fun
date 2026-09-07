/* X's half of the OAuth dance, and the settings both ends of it share.
 *
 * Kept out of the route files so `start` and `callback` cannot disagree about
 * the redirect URI. X compares that string byte for byte against the one
 * registered in the developer app and rejects the exchange if it differs by a
 * trailing slash, so two copies of it is a bug waiting for a deploy.
 */

import "server-only";

/* Read the first of several names that is set.
 *
 * The Vercel project was configured before this code was written, so which
 * spelling is in there is not knowable from here. Both plausible ones are
 * accepted and the error message names both. */
const pick = (...names: string[]): string | undefined => {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
};

export const xClientId = () => pick("X_CLIENT_ID", "TWITTER_CLIENT_ID");
export const xClientSecret = () =>
  pick("X_CLIENT_SECRET", "TWITTER_CLIENT_SECRET");

/** Where X sends the browser back to.
 *
 *  `NEXT_PUBLIC_SITE_URL` wins when it is set, because that is the value that
 *  matches the developer app. Falling back to the request's own origin keeps
 *  localhost working without a second app registration; it is not a security
 *  decision, since X refuses any redirect URI that is not on its own list
 *  regardless of what we send. */
export function redirectUri(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const origin = configured?.replace(/\/+$/, "") ?? new URL(request.url).origin;
  return `${origin}/api/auth/x/callback`;
}

/** Cookie options for the short-lived OAuth crumbs.
 *
 *  `lax` rather than `strict`: the browser arrives back from x.com as a
 *  top-level navigation, and `strict` would withhold the cookies on exactly
 *  that request, which is the one that needs them. `secure` is off only on
 *  plain-http localhost, where the browser would otherwise drop it. */
export function oauthCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 10 * 60,
  };
}

/* Where it is safe to send the browser after the round trip.
 *
 * The first version tested `startsWith("/") && !startsWith("//")`, which looks
 * like it covers it and does not. A BACKSLASH defeats it: the URL parser
 * treats `\` as a path separator for http and https, so `new URL("/\\evil.example",
 * origin)` resolves to `https://evil.example/` and the redirect leaves the
 * site entirely. That was live, and it fired on every exit path out of the
 * callback, so a victim did not even have to finish signing in to X.
 *
 * Guessing at the character classes a parser treats as special is how that bug
 * gets rewritten. So this does not guess. It resolves the candidate exactly
 * the way the redirect will, then insists the result landed on the same
 * origin. Whatever the parser thinks `\` or `%2f` or anything else means, the
 * answer has to still be us. */
export function safeReturnPath(candidate: string, origin: string): string {
  try {
    const resolved = new URL(candidate, origin);
    if (resolved.origin !== new URL(origin).origin) return "/";
    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return "/";
  }
}

export type XUser = {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
};

/* Trade the authorization code for a token.
 *
 * X wants the client id and secret as HTTP Basic auth for a confidential
 * client, and the code verifier in the form body. Sending the secret in the
 * body instead is the classic X-specific failure and returns an opaque 401. */
export async function exchangeCode(args: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<string> {
  const id = xClientId();
  const secret = xClientSecret();
  if (!id || !secret) throw new Error("X client credentials are not set");

  const res = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: args.redirectUri,
      code_verifier: args.verifier,
    }),
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  } | null;

  if (!res.ok || !body?.access_token) {
    throw new Error(
      `X rejected the token exchange: ${
        body?.error_description ?? body?.error ?? `HTTP ${res.status}`
      }`,
    );
  }

  return body.access_token;
}

/* Ask X who just signed in, then forget the token.
 *
 * This is the only call the token is ever used for. It is a local variable in
 * the callback, it is never written to a cookie, a log line or the database,
 * and it expires on X's side regardless. That is what lets the privacy page
 * say we do not store tokens without an asterisk. */
export async function fetchXUser(accessToken: string): Promise<XUser> {
  const res = await fetch(
    "https://api.x.com/2/users/me?user.fields=profile_image_url",
    {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  const body = (await res.json().catch(() => null)) as {
    data?: XUser;
    detail?: string;
  } | null;

  if (!res.ok || !body?.data?.id) {
    throw new Error(
      `X would not say who this is: ${body?.detail ?? `HTTP ${res.status}`}`,
    );
  }

  return body.data;
}

/** X serves a 48px avatar by default. `_normal` is in the filename, and
 *  swapping it for `_400x400` is the documented way to a usable one. */
export const biggerAvatar = (url: string | undefined): string | null =>
  url ? url.replace("_normal.", "_400x400.") : null;
