/* Supabase, browser side.
 *
 * This client carries the ANON key and every table it touches is governed by
 * RLS. That is the whole security model: the key is public by design (it ships
 * in the bundle), and what a visitor may read or write is decided by policies
 * in the database, never by the client asking nicely.
 *
 * The SERVICE ROLE key must never appear in this file, in any NEXT_PUBLIC_
 * variable, or anywhere in `src/` that is not a route handler. It bypasses RLS
 * entirely. Server-only code reads it from process.env inside app/api/*.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* Fail loudly at import time in development, and only there. A missing env var
 * that silently produces a client pointing at nothing costs an hour of
 * debugging "why does nothing load"; a build that dies on Vercel because a
 * preview branch lacks the var costs a deploy. */
if (process.env.NODE_ENV === "development" && (!url || !anonKey)) {
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are not set. Copy .env.example to .env.local",
  );
}

export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder",
  { auth: { persistSession: true, autoRefreshToken: true } },
);
