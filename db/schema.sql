-- Cloudflare D1, the only database this product has.
--
-- Nothing here is a source of truth. The chain holds the money, the picks and
-- the eliminations; this holds three things the chain cannot: who an address
-- says they are on X, whether they agreed to be named in public, and a cached
-- copy of standings so the leaderboard still renders when an RPC call fails.
-- Losing this file entirely would cost display names, not funds.
--
-- Apply with: npx wrangler d1 execute commish --remote --file db/schema.sql
-- Every statement is idempotent, so re-running it is safe.

-- One row per wallet that has proved it controls a social account.
--
-- The columns are exactly the five things the privacy page says we store, and
-- no more. There is no display name and no email because we do not ask for
-- one, and there is deliberately nowhere to put an OAuth token: the token is
-- used once, inside the callback, to ask X who just signed in, and is then
-- dropped on the floor. Adding a token column later is a privacy-policy
-- change, not a schema change, so it should feel like one.
--
-- `provider` is not hard-coded to X. The binding proof (OAuth, then a wallet
-- signature) is provider-shaped rather than X-shaped, so Google slots in by
-- writing a second start/callback pair, not by touching this table.
CREATE TABLE IF NOT EXISTS identity (
  wallet       TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,
  provider_id  TEXT NOT NULL,
  handle       TEXT NOT NULL,
  avatar_url   TEXT,
  -- The SECOND opt-in, and the reason it defaults to 0.
  --
  -- Linking is scoped to a league. Being listed publicly pairs a handle with
  -- an address forever, in the sense that anyone who sees the pairing can keep
  -- it and the ledger behind that address is complete and historical. A
  -- default of 1 would opt people into that by omission, which is exactly the
  -- decision the privacy page promises they get to make separately.
  listed       INTEGER NOT NULL DEFAULT 0,
  linked_at    INTEGER NOT NULL,
  -- One social account cannot be worn by two wallets. Without this, anyone
  -- could link a handle they control to a second address and appear twice.
  UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS identity_listed ON identity (listed);

-- A short-lived challenge, and the only place a verified-but-unbound identity
-- ever lives.
--
-- The flow deliberately has no login session. After X confirms who someone is,
-- the callback writes that answer here and hands the browser the row's key;
-- the browser signs a message containing that key with its wallet; the bind
-- route reads the identity back out of this row rather than trusting anything
-- the browser sent. So the client never gets to assert which X account it is
-- claiming. It can only present a nonce the server issued.
--
-- Rows are deleted the moment they are spent, which is what makes a captured
-- signature worthless the second time. `expires_at` covers the abandoned ones.
CREATE TABLE IF NOT EXISTS nonce (
  nonce        TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,
  provider_id  TEXT NOT NULL,
  handle       TEXT NOT NULL,
  avatar_url   TEXT,
  issued_at    INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS nonce_expires ON nonce (expires_at);

-- A cache of what the chain already says, keyed by wallet.
--
-- The leaderboard could read every Pool and Member account on every request,
-- and when the RPC answers it does exactly that. This table is what it falls
-- back to when the RPC is slow, rate-limited or down, so a public page never
-- turns into an error because a third party had a bad minute. It is written
-- through on every successful read, never edited by hand, and safe to drop.
--
-- `claimed_base` is a string because it is a u64 of base units and JSON
-- numbers are not.
CREATE TABLE IF NOT EXISTS standing (
  wallet       TEXT PRIMARY KEY,
  pools_joined INTEGER NOT NULL DEFAULT 0,
  pools_won    INTEGER NOT NULL DEFAULT 0,
  claimed_base TEXT NOT NULL DEFAULT '0',
  updated_at   INTEGER NOT NULL
);
