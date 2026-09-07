/* Building the leaderboard, in one place, for the page and the API both.
 *
 * Two sources, and they are not equals. The chain decides who survived what;
 * D1 only decides whose handle may be printed next to an address. If the two
 * ever disagree about a score the chain is right, which is why nothing here
 * writes a standing that did not come from a decoded account.
 *
 * Only addresses with `listed = 1` are read. That is not a display filter, it
 * is the consent boundary: an address that linked but did not opt in never
 * enters the query, so there is nothing for a caller to reveal.
 *
 * Standings are computed live and written back to D1 on the way out. The cache
 * is not an optimisation. It is what stops a public page turning into an error
 * because an RPC provider had a bad minute.
 */

import "server-only";

import { Connection } from "@solana/web3.js";

import { d1, d1Missing } from "./d1";
import {
  PROGRAM_ID,
  STATUS_SETTLED,
  decodeMember,
  decodePool,
  discriminatorFilter,
  isLeague,
  isPotWinner,
} from "./program";

export type LeaderRow = {
  wallet: string;
  handle: string;
  avatarUrl: string | null;
  poolsJoined: number;
  poolsWon: number;
  /** Base units as a decimal string, because JSON has no u64. */
  claimedBase: string;
};

export type Leaderboard = {
  rows: LeaderRow[];
  /** False when the chain could not be reached and these are cached numbers. */
  live: boolean;
};

/* Why the leaderboard could not be built.
 *
 * Two failures look identical from outside and have completely different
 * fixes: nobody set the credentials, versus the credentials were rejected.
 * Collapsing both into "unavailable" cost an hour the first time, so the
 * distinction is now part of the return type rather than something to be
 * reconstructed from logs.
 *
 * The KIND is safe to publish and the DETAIL is not. Cloudflare's error 7003
 * quotes the request path back, and that path carries the account id and the
 * database id, so `detail` goes to the log and only `kind` reaches a caller.
 * The route is what enforces that; this type only carries both. */
export type LeaderboardProblem =
  | { kind: "unconfigured"; missing: string[] }
  | { kind: "rejected"; detail: string };

export type LeaderboardResult =
  | { ok: true; board: Leaderboard }
  | { ok: false; problem: LeaderboardProblem };

type IdentityRow = { wallet: string; handle: string; avatar_url: string | null };
type StandingRow = {
  wallet: string;
  pools_joined: number;
  pools_won: number;
  claimed_base: string;
};
type Tally = { poolsJoined: number; poolsWon: number; claimedBase: string };

/* The RPC to use from a server, which is not the browser's once a proxy is in
 * front of the browser's.
 *
 * `RPC_URL` is the right answer and should always be set: it holds a direct
 * key, it is read inside a route handler, and it never reaches a browser, so
 * there is no reason to send a server's reads the long way round through a
 * proxy that exists to hide a credential from clients.
 *
 * The fallback to `NEXT_PUBLIC_RPC_URL` keeps local development working with
 * one variable, and it has one sharp edge worth heading off. That variable
 * becomes the CORS-locked worker, and the worker refuses any request without
 * an allowed `Origin`, on the grounds that browsers always send one and
 * therefore its absence means the caller is not a browser. A Vercel function
 * is not a browser and sends none, so the fallback would 403 and the
 * leaderboard would quietly start serving cached standings forever with
 * nothing but a log line to say why.
 *
 * So the headers name the site explicitly. It is our own server identifying
 * itself to our own proxy, which is exactly the case both were written for. */
function connection(): Connection {
  const direct = process.env.RPC_URL;
  const url = direct ?? process.env.NEXT_PUBLIC_RPC_URL;
  if (!url) throw new Error("No RPC URL is configured");

  const site = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://commish.fun"
  ).replace(/\/+$/, "");

  return new Connection(url, {
    commitment: "confirmed",
    httpHeaders: { origin: site, referer: `${site}/` },
  });
}

/* Walk every Pool and every Member once.
 *
 * Two `getProgramAccounts` calls for the whole product, rather than one per
 * listed wallet. The cost is a function of how much has been played, not of
 * how many people opted in, so the page does not get slower as it gets more
 * useful.
 *
 * Winners are identified with the same predicate the claim button uses, so the
 * leaderboard cannot congratulate somebody the program would refuse to pay. */
async function fromChain(): Promise<Map<string, Tally>> {
  const conn = connection();

  const [poolAccounts, memberAccounts] = await Promise.all([
    conn.getProgramAccounts(PROGRAM_ID, {
      filters: discriminatorFilter("Pool"),
    }),
    conn.getProgramAccounts(PROGRAM_ID, {
      filters: discriminatorFilter("Member"),
    }),
  ]);

  const pools = new Map(
    poolAccounts.map((a) => [
      a.pubkey.toBase58(),
      decodePool(new Uint8Array(a.account.data)),
    ]),
  );

  const out = new Map<string, Tally>();

  for (const account of memberAccounts) {
    const member = decodeMember(new Uint8Array(account.account.data));
    const pool = pools.get(member.pool.toBase58());
    if (!pool) continue;

    /* Unpaid members are not entrants. Somebody who opened a Member account
     * and never sent the dues has joined nothing, and counting them would let
     * anyone inflate a number for free. */
    if (!member.paid) continue;

    const wallet = member.wallet.toBase58();
    const row = out.get(wallet) ?? {
      poolsJoined: 0,
      poolsWon: 0,
      claimedBase: "0",
    };

    row.poolsJoined += 1;

    /* THE POOL HAS TO HAVE SETTLED. This is not belt and braces.
     *
     * `isPotWinner` is only half the program's rule. `claim_pot` requires
     * `pool.status == STATUS_SETTLED` first and applies the winners_week test
     * second; on a screen for one settled pool the first half is a given, so
     * the client helper never carried it. Across every pool at once it is not
     * a given at all.
     *
     * `winners_week` is only written inside `if settled` in `advance_week`, so
     * on an unsettled pool it is still the zeroed 0, which is WEEK_NONE, which
     * sends `isPotWinner` down its "somebody was left standing" branch, where
     * the whole test is `isAlive(member)`. Every paid member who has not been
     * knocked out of a pool that is merely OPEN would have counted as a win,
     * on the column this table sorts by.
     *
     * Leagues are excluded for a different reason: they pay a sheet the
     * commissioner writes rather than crowning a survivor, and counting a
     * league prize as a Survivor win would put somebody top of this table for
     * finishing third in a money league. */
    if (
      pool.status === STATUS_SETTLED &&
      !isLeague(pool) &&
      isPotWinner(pool, member)
    ) {
      row.poolsWon += 1;
      if (member.claimed) {
        row.claimedBase = (
          BigInt(row.claimedBase) + pool.potPerWinner
        ).toString();
      }
    }

    out.set(wallet, row);
  }

  return out;
}

/** The leaderboard, or the reason there isn't one. A failure is a deployment
 *  problem; an EMPTY list is a real answer and means nobody has opted in. The
 *  two must never render the same way. */
export async function buildLeaderboard(): Promise<LeaderboardResult> {
  const missing = d1Missing();
  if (missing.length > 0) {
    return { ok: false, problem: { kind: "unconfigured", missing } };
  }

  let identities: IdentityRow[];
  try {
    identities = await d1<IdentityRow>(
      "SELECT wallet, handle, avatar_url FROM identity WHERE listed = 1",
    );
  } catch (err) {
    console.error("[leaderboard] identity read failed", err);
    return {
      ok: false,
      problem: {
        kind: "rejected",
        /* Cloudflare's own message. It says things like "Authentication error"
         * for a bad token and "no such table" for an unapplied schema, which
         * are the two answers worth having. */
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (identities.length === 0) return { ok: true, board: { rows: [], live: true } };

  let chain: Map<string, Tally> | null = null;
  try {
    chain = await fromChain();
  } catch (err) {
    /* Log it, then serve the cache. A leaderboard that is a minute stale is a
     * better answer than a leaderboard that is a stack trace. */
    console.error("[leaderboard] falling back to cached standings", err);
  }

  let rows: LeaderRow[];

  if (chain) {
    const live = chain;
    rows = identities.map((id) => {
      const s = live.get(id.wallet);
      return {
        wallet: id.wallet,
        handle: id.handle,
        avatarUrl: id.avatar_url || null,
        poolsJoined: s?.poolsJoined ?? 0,
        poolsWon: s?.poolsWon ?? 0,
        claimedBase: s?.claimedBase ?? "0",
      };
    });

    /* Write through, one statement per listed wallet. That is a number in the
     * tens, and it happens at most once a minute behind the revalidate. */
    const at = Math.floor(Date.now() / 1000);
    await Promise.all(
      rows.map((r) =>
        d1(
          `INSERT INTO standing (wallet, pools_joined, pools_won, claimed_base, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(wallet) DO UPDATE SET
             pools_joined = excluded.pools_joined,
             pools_won    = excluded.pools_won,
             claimed_base = excluded.claimed_base,
             updated_at   = excluded.updated_at`,
          [r.wallet, r.poolsJoined, r.poolsWon, r.claimedBase, at],
        ).catch((e) => {
          // A failed cache write must not fail the response it is caching.
          console.error("[leaderboard] standing write-through failed", e);
        }),
      ),
    );
  } else {
    let cached: StandingRow[] = [];
    try {
      cached = await d1<StandingRow>("SELECT * FROM standing");
    } catch (err) {
      console.error("[leaderboard] cached standings unreadable", err);
    }
    const byWallet = new Map(cached.map((c) => [c.wallet, c]));
    rows = identities.map((id) => {
      const s = byWallet.get(id.wallet);
      return {
        wallet: id.wallet,
        handle: id.handle,
        avatarUrl: id.avatar_url || null,
        poolsJoined: s?.pools_joined ?? 0,
        poolsWon: s?.pools_won ?? 0,
        claimedBase: s?.claimed_base ?? "0",
      };
    });
  }

  /* Won, then played, then handle. Alphabetical last so a table of people who
   * have all played nothing yet has a stable order rather than whatever order
   * D1 happened to return. */
  rows.sort(
    (a, b) =>
      b.poolsWon - a.poolsWon ||
      b.poolsJoined - a.poolsJoined ||
      a.handle.localeCompare(b.handle),
  );

  return { ok: true, board: { rows, live: chain !== null } };
}
