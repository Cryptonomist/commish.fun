/* Cloudflare D1 over HTTP, because this app runs on Vercel.
 *
 * D1's ergonomic API is a Worker binding, and there are no Worker bindings
 * here. The REST endpoint is the supported way in from outside Cloudflare and
 * it is a plain POST, so the whole client is one function. Do not reach for
 * `wrangler` or `@cloudflare/workers-types` to make this look nicer: neither
 * runs in a Vercel route handler.
 *
 * Everything in this file is server-only. The API token can create, drop and
 * read every table in the account's databases, so a single stray import from a
 * client component would end the game. The `server-only` import below is what
 * makes that a build error instead of a leak.
 */

import "server-only";

/* Two names for each variable, and both are read.
 *
 * The Vercel project was configured before this code existed, so the names
 * that are already set there are not knowable from here. These are the two
 * spellings anyone would plausibly have used. If neither is present the error
 * names both, which is more useful than "undefined". */
const pick = (...names: string[]): string | undefined => {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
};

const ACCOUNT = () => pick("CF_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID");
const DATABASE = () => pick("CF_D1_DATABASE_ID", "D1_DATABASE_ID");
const TOKEN = () => pick("CF_API_TOKEN", "CLOUDFLARE_API_TOKEN");

/** Whether D1 is configured at all. Routes check this so a missing variable
 *  produces one clear sentence rather than a stack trace per request. */
export const d1Configured = (): boolean => d1Missing().length === 0;

/* WHICH variables are missing, not just whether any are.
 *
 * "D1 is not available" is the same message whether nothing was set or one of
 * three things was set under the wrong name, and those have opposite fixes.
 * Naming the empty ones is the difference between a five-minute fix and an
 * afternoon. Only NAMES are ever returned here, never values. */
export function d1Missing(): string[] {
  const missing: string[] = [];
  if (!ACCOUNT()) missing.push("CF_ACCOUNT_ID");
  if (!DATABASE()) missing.push("CF_D1_DATABASE_ID");
  if (!TOKEN()) missing.push("CF_API_TOKEN");
  return missing;
}

export class D1Error extends Error {}

type D1Response<T> = {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: { results?: T[]; success?: boolean }[];
};

/* Run one statement.
 *
 * `params` are bound, never interpolated. That is not a style preference: the
 * only values that reach this layer are an X handle, an avatar URL and a
 * wallet address, and the first two come from a third party's JSON.
 *
 * Returns the rows. A statement that returns nothing returns an empty array,
 * so callers can ignore the result without a special case. */
export async function d1<T = Record<string, unknown>>(
  sql: string,
  params: (string | number)[] = [],
): Promise<T[]> {
  const account = ACCOUNT();
  const database = DATABASE();
  const token = TOKEN();

  if (!account || !database || !token) {
    throw new D1Error(
      "D1 is not configured. Set CF_ACCOUNT_ID, CF_D1_DATABASE_ID and CF_API_TOKEN " +
        "(or CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID and CLOUDFLARE_API_TOKEN) in the Vercel project.",
    );
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      /* D1 binds parameters positionally and wants them as strings or numbers.
       * Anything else (a bigint, a Date) has to be converted by the caller,
       * deliberately, so the storage format is never an accident. */
      body: JSON.stringify({ sql, params }),
      // Never let Next cache a database read.
      cache: "no-store",
    },
  );

  const body = (await res.json().catch(() => null)) as D1Response<T> | null;

  if (!res.ok || !body?.success) {
    /* Cloudflare puts the useful part in `errors[]` and the HTTP status is
     * often just 400. Surface the first message; swallowing it turns every
     * schema mistake into an unexplained 500. */
    const detail =
      body?.errors?.map((e) => `${e.code} ${e.message}`).join("; ") ??
      `HTTP ${res.status}`;
    throw new D1Error(`D1 query failed: ${detail}`);
  }

  return body.result?.[0]?.results ?? [];
}

/** One row or null, for the common case of a primary-key lookup. */
export async function d1One<T = Record<string, unknown>>(
  sql: string,
  params: (string | number)[] = [],
): Promise<T | null> {
  const rows = await d1<T>(sql, params);
  return rows[0] ?? null;
}
