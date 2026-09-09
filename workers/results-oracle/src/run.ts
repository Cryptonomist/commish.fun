/* ONE TICK: look at every pool, do whatever its state allows, say what
 * happened.
 *
 * A Survivor or Loser pool sits in one of four places between weeks, and each
 * has exactly one thing this worker may do about it:
 *
 *   awaiting results   post them, if two feeds agree the week is over
 *   results posted     finalize, once the dispute window has closed
 *   finalized          settle every member, then advance the week
 *   anything else      nothing
 *
 * Every step is guarded by the program, not by this code: a re-run, an
 * overlapping tick, or a commissioner who posted by hand a minute earlier all
 * produce a refusal the program names, and a refusal is logged and moved past.
 * This worker can never be the thing that decides a week wrongly, because it
 * cannot post without agreement and it cannot finalize before the window;
 * what it can be is the thing that means nobody has to remember.
 *
 * NOTE THE FIRST WEEK. A pool is OPEN until its first results are posted and
 * LOCKED from the first advance onward; both mean "awaiting results" here.
 * `propose_results` checks the week and the pending state, not the status.
 */

import { Connection, PublicKey } from "@solana/web3.js";

import {
  ataFor,
  buildAdvanceWeek,
  buildFinalizeWeek,
  buildOraclePostResults,
  buildSettleMember,
  decodeOracle,
  oraclePda,
  POOL_LEAGUE,
  STATUS_FINALIZED,
  STATUS_LOCKED,
  STATUS_OPEN,
  STATUS_RESULTS_POSTED,
  WEEK_NONE,
} from "@/lib/program";
import { gamesFor, SEASON_YEAR } from "@/lib/season";

import { alert } from "./alert";
import {
  allPools,
  chainNow,
  membersOf,
  poolAt,
  posterFromSecret,
  rpcUrl,
  sendOne,
  type PoolAt,
} from "./chain";
import { decideWeek, struckDown, type Board } from "./decide";
import { apiSportsFeed, espnFeed, fixtureFeed, type Feed } from "./feeds";

export interface Env {
  /** Helius, by key: the hostname follows HELIUS_CLUSTER. */
  HELIUS_API_KEY?: string;
  /** Or any RPC URL outright. Wins over the key when both are set, and is how
   *  a devnet drill runs against the public endpoint with no key at all. */
  RPC_URL?: string;
  ORACLE_KEYPAIR: string;
  APISPORTS_KEY?: string;
  ALERT_WEBHOOK?: string;
  HELIUS_CLUSTER?: string;
  PROGRAM_ID?: string;
  SEASON?: string;
  MIN_AGREEING_FEEDS?: string;
  /** Seconds after a week's lock before the program accepts a posting. Three
   *  hours on mainnet; sixty seconds on a fastclock devnet build. */
  MIN_POST_DELAY_SECS?: string;
  ORACLE_FIXTURE?: string;
}

export type Action = { pool: string; did: string; sig?: string };
export type Summary = {
  cluster: string;
  /** The chain's unix time this tick judged everything against. */
  now: number;
  poster: string;
  pools: number;
  actions: Action[];
  skipped: { pool: string; why: string }[];
  errors: { pool: string; error: string }[];
};

const DEFAULT_POST_DELAY = 3 * 60 * 60;

export async function runCycle(env: Env): Promise<Summary> {
  const cluster = env.HELIUS_CLUSTER === "mainnet" ? "mainnet" : "devnet";
  const rpc = env.RPC_URL ?? (env.HELIUS_API_KEY ? rpcUrl(cluster, env.HELIUS_API_KEY) : null);
  if (!rpc) throw new Error("set RPC_URL, or HELIUS_API_KEY with HELIUS_CLUSTER");
  const connection = new Connection(rpc, "confirmed");
  const poster = posterFromSecret(env.ORACLE_KEYPAIR);
  const season = Number(env.SEASON) || SEASON_YEAR;
  const minAgreeing = Number(env.MIN_AGREEING_FEEDS) || 2;
  const postDelay = Number(env.MIN_POST_DELAY_SECS) || DEFAULT_POST_DELAY;
  /* The validator's clock, because that is the clock every "not before" in
   * the program is judged by. The wall clock is the fallback, not the rule;
   * see chainNow. */
  const now = await chainNow(connection).catch(() => Math.floor(Date.now() / 1000));

  const summary: Summary = {
    cluster,
    now,
    poster: poster.publicKey.toBase58(),
    pools: 0,
    actions: [],
    skipped: [],
    errors: [],
  };

  /* Is this key the oracle at all? Checked once per tick, before any feed is
   * fetched or any pool is read, so a rotated key fails here with one clear
   * line instead of failing on every pool with a has_one error. */
  const oracleInfo = await connection.getAccountInfo(oraclePda(), "confirmed");
  if (!oracleInfo) {
    await alert(env, `results oracle: no Oracle account on ${cluster}; run scripts/set-oracle.ts`);
    summary.errors.push({ pool: "-", error: "no Oracle account on chain" });
    return summary;
  }
  const named = decodeOracle(oracleInfo.data).poster;
  if (!named.equals(poster.publicKey)) {
    await alert(
      env,
      `results oracle: this worker holds ${poster.publicKey.toBase58()} but the chain names ${named.toBase58()}`,
    );
    summary.errors.push({ pool: "-", error: "this key is not the named poster" });
    return summary;
  }

  const feeds = chooseFeeds(env, cluster);
  const boards = new Map<number, Board[]>();
  const boardsFor = async (week: number): Promise<Board[]> => {
    let b = boards.get(week);
    if (!b) {
      const settled = await Promise.allSettled(feeds.map((f) => f.week(week, season)));
      b = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      boards.set(week, b);
    }
    return b;
  };

  const pools = await allPools(connection);
  summary.pools = pools.length;

  for (const entry of pools) {
    const id = entry.address.toBase58();
    try {
      await tick(entry);
    } catch (e) {
      summary.errors.push({ pool: id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (summary.errors.length) {
    await alert(
      env,
      `results oracle on ${cluster}: ${summary.errors.length} error(s)\n` +
        summary.errors.map((e) => `${e.pool}: ${e.error}`).join("\n"),
    );
  }
  return summary;

  async function tick({ address, pool }: PoolAt): Promise<void> {
    const id = address.toBase58();
    if (pool.poolType === POOL_LEAGUE) return skip(id, "league");

    switch (pool.status) {
      case STATUS_OPEN:
      case STATUS_LOCKED: {
        const week = pool.currentWeek;
        if (pool.pendingWeek !== WEEK_NONE) return skip(id, `week ${pool.pendingWeek} already pending`);
        /* No "already posted" check here on purpose: once a week is finalized
         * and advanced the pool is looking at the NEXT week, so the current
         * week's results_posted flag is never set while the pool is awaiting
         * results. The program refuses a repeat with ResultsAlreadyPosted in
         * any case, and that refusal surfaces as an error rather than a
         * silent skip, which is the right visibility for a state this code
         * did not expect. */
        const lock = pool.lockTs[week - 1];
        if (!lock) return skip(id, `no lock for week ${week}`);
        if (now < lock + postDelay) return skip(id, `week ${week} not postable until ${lock + postDelay}`);
        if (struckDown(pool)) {
          /* Once an hour, not once a tick: the situation persists until a
           * person acts, and one line an hour is a reminder where six an hour
           * is a reason to mute the channel. */
          if (Math.floor(now / 3600) !== Math.floor((now - 600) / 3600)) {
            await alert(env, `results oracle: ${id} week ${week} was posted and struck down by the members. The oracle will not post it again; the commissioner has to.`);
          }
          return skip(id, `week ${week} was struck down; leaving it to the commissioner`);
        }

        const verdict = decideWeek(gamesFor(week), await boardsFor(week), minAgreeing);
        if (!verdict.post) {
          if (verdict.reason.startsWith("feeds disagree")) {
            await alert(env, `results oracle: ${id} week ${week}: ${verdict.reason}. A commissioner has to post this one.`);
          }
          return skip(id, `week ${week}: ${verdict.reason}`);
        }

        const sig = await sendOne(
          connection,
          buildOraclePostResults({
            pool: address,
            poster: poster.publicKey,
            week,
            winners: verdict.winners,
            pushes: verdict.pushes,
          }),
          poster,
        );
        summary.actions.push({
          pool: id,
          did: `posted week ${week}: winners ${verdict.winners.toString(2)} from ${verdict.sources.join("+")}`,
          sig,
        });
        return;
      }

      case STATUS_RESULTS_POSTED: {
        const closes = pool.pendingPostedTs + pool.disputeWindowSecs;
        if (now < closes) return skip(id, `dispute window open until ${closes}`);
        const sig = await sendOne(connection, buildFinalizeWeek(address), poster);
        summary.actions.push({ pool: id, did: `finalized week ${pool.pendingWeek}`, sig });
        /* Fall straight through to settling: the window has closed and there
         * is no reason to leave the members waiting ten minutes for the next
         * tick. The re-read is what makes the settle step see FINALIZED. */
        return settleAndAdvance(address, await poolAt(connection, address));
      }

      case STATUS_FINALIZED:
        return settleAndAdvance(address, pool);

      default:
        return skip(id, `status ${pool.status}`);
    }
  }

  async function settleAndAdvance(address: PublicKey, pool: { finalizedWeek: number; usdcMint: PublicKey; vault: PublicKey; feeTreasury: PublicKey }): Promise<void> {
    const id = address.toBase58();
    const week = pool.finalizedWeek;
    const members = await membersOf(connection, address);

    /* Everyone who was alive going into the week and has not been settled
     * for it. The program refuses the eliminated and the already-settled, so
     * this filter is a courtesy to the log, not the safety. */
    const due = members.filter(
      (m) => m.member.eliminatedWeek === WEEK_NONE && m.member.processedWeek !== week,
    );
    for (const m of due) {
      const sig = await sendOne(connection, buildSettleMember(address, m.address), poster);
      summary.actions.push({ pool: id, did: `settled ${m.member.wallet.toBase58()} for week ${week}`, sig });
    }

    const fresh = await poolAt(connection, address);
    if (fresh.processedThisWeek < fresh.aliveAtWeekStart) {
      return skip(id, `${fresh.processedThisWeek} of ${fresh.aliveAtWeekStart} settled`);
    }
    const sig = await sendOne(
      connection,
      buildAdvanceWeek({
        pool: address,
        vault: pool.vault,
        feeTreasuryAta: ataFor(pool.feeTreasury, pool.usdcMint),
      }),
      poster,
    );
    const after = await poolAt(connection, address);
    summary.actions.push({
      pool: id,
      did: after.status === STATUS_LOCKED ? `advanced to week ${after.currentWeek}` : `settled the pool (status ${after.status})`,
      sig,
    });
  }

  function skip(pool: string, why: string): void {
    summary.skipped.push({ pool, why });
  }
}

/* The fixture stands in for every feed, and only off mainnet. This is checked
 * against the cluster the worker is actually talking to, not against a flag
 * that says "test", so a copied config cannot turn a made-up scoreboard into a
 * mainnet posting. */
function chooseFeeds(env: Env, cluster: "devnet" | "mainnet"): Feed[] {
  if (cluster !== "mainnet" && env.ORACLE_FIXTURE) {
    const board = JSON.parse(env.ORACLE_FIXTURE) as Board;
    return [fixtureFeed("fixture-a", board), fixtureFeed("fixture-b", board)];
  }
  const feeds: Feed[] = [espnFeed()];
  if (env.APISPORTS_KEY) feeds.push(apiSportsFeed(env.APISPORTS_KEY));
  return feeds;
}
