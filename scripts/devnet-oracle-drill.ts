/* The results oracle, end to end, on devnet, in about five minutes.
 *
 *   NEXT_PUBLIC_FAST_CLOCK=1 \
 *   NEXT_PUBLIC_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU \
 *   npx tsx scripts/devnet-oracle-drill.ts
 *
 * Both variables are read by src/lib at import time, which is why they are
 * on the command line rather than looked up here: by the time this file runs
 * a line of its own, the mint and the timing floors are already decided.
 *
 * WHAT IT PROVES. Not the program — the LiteSVM suite does that in
 * milliseconds. This proves the WORKER: the same `runCycle` the scheduled
 * worker runs, against a real cluster, signing with the same kind of key,
 * decoding real accounts, sending real transactions, and cranking a real week
 * from "picks are in" to "pool settled" with nobody posting anything by hand.
 * The program's timing floors are the only reason it takes minutes rather than
 * seconds, and only a fastclock devnet build makes it minutes rather than a
 * season.
 *
 * WHAT IT DOES NOT PROVE: the feeds. Week one has not been played, so the
 * boards come from ORACLE_FIXTURE, the devnet-only stand-in that the worker
 * refuses on mainnet. The decision logic that turns a board into masks is
 * pinned by tests-web/oracle-decide.test.ts against every shape of
 * disagreement; the feed parsers get their first real exercise on the first
 * week that is actually played, which is exactly why the commissioner's own
 * door stays open.
 *
 * NEEDS, on devnet: the upgraded program (with set_oracle), an Oracle account
 * naming target/deploy/oracle-devnet.json (scripts/set-oracle.ts), that key
 * holding a little SOL for fees, and the CLI key holding enough to fund two
 * bots. Refuses anything that is not devnet.
 *
 * The pool has no buy-in. That is not a shortcut: it is the same $0 shape the
 * first mainnet Survivor pool was created with, and it means the drill needs
 * no USDC at all — just rent.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";

import * as P from "@/lib/program";
import { gamesFor, weekOf } from "@/lib/season";
import { TEAMS } from "@/lib/nfl";
import { minWeekGapSecs } from "@/lib/schedule";

import { runCycle, type Env } from "../workers/results-oracle/src/run";
import type { Board } from "../workers/results-oracle/src/decide";

const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";
if (!/devnet/.test(RPC)) {
  throw new Error(`This drill runs on devnet only. RPC_URL is ${RPC}.`);
}
if (process.env.NEXT_PUBLIC_FAST_CLOCK !== "1") {
  throw new Error(
    "Run with NEXT_PUBLIC_FAST_CLOCK=1 so the schedule this builds matches the fastclock floors the devnet program enforces.",
  );
}
const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
if (P.USDC_MINT.toBase58() !== DEVNET_USDC) {
  throw new Error(
    `USDC_MINT is ${P.USDC_MINT.toBase58()}; run with NEXT_PUBLIC_USDC_MINT=${DEVNET_USDC} or the devnet program refuses the pool with WrongMint.`,
  );
}

const POSTER_FILE = path.resolve("target/deploy/oracle-devnet.json");
const DISPUTE_SECS = 60;
const LOCK_IN_SECS = 150;

const connection = new Connection(RPC, "confirmed");
const admin = loadKeypair(path.join(os.homedir(), ".config/solana/id.json"));
const posterJson = fs.readFileSync(POSTER_FILE, "utf8");
const poster = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(posterJson) as number[]));

function loadKeypair(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")) as number[]));
}

async function send(ixs: TransactionInstruction[], signers: Keypair[]): Promise<string> {
  const tx = new Transaction().add(...ixs);
  return sendAndConfirmTransaction(connection, tx, signers, { commitment: "confirmed" });
}

const now = () => Math.floor(Date.now() / 1000);
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

async function waitUntil(ts: number, what: string) {
  const left = ts - now();
  if (left > 0) {
    console.log(`  waiting ${left}s for ${what}`);
    await sleep(left);
  }
}

/* A board in which every week-one fixture is final, `winnerAbbr` won its game
 * and `loserAbbr` lost its game. Everything else: the home side. */
function fixtureBoard(week: number, winnerAbbr: string, loserAbbr: string): Board {
  return {
    source: "fixture",
    games: gamesFor(week).map((g) => {
      let winner: "home" | "away" = "home";
      if (g.away === winnerAbbr) winner = "away";
      if (g.home === loserAbbr) winner = "away";
      return { home: g.home, away: g.away, final: true, winner };
    }),
  };
}

async function main() {
  console.log(`rpc      ${RPC}`);
  console.log(`admin    ${admin.publicKey.toBase58()}`);
  console.log(`poster   ${poster.publicKey.toBase58()}`);

  // ---- the chain has to be ready for this ------------------------------
  const oracleInfo = await connection.getAccountInfo(P.oraclePda());
  if (!oracleInfo) throw new Error("No Oracle account on devnet. Run scripts/set-oracle.ts first.");
  const named = P.decodeOracle(oracleInfo.data).poster;
  if (!named.equals(poster.publicKey)) {
    throw new Error(`Devnet's oracle is ${named.toBase58()}, not ${poster.publicKey.toBase58()}.`);
  }
  const posterSol = (await connection.getBalance(poster.publicKey)) / LAMPORTS_PER_SOL;
  if (posterSol < 0.01) throw new Error(`The poster holds ${posterSol} SOL; it needs fees.`);
  console.log(`oracle   names the poster, which holds ${posterSol} SOL`);

  // ---- two members who will disagree about week one ---------------------
  const week = 1;
  const byes = new Set(weekOf(week)?.byes ?? []);
  const playing = TEAMS.filter((t) => !byes.has(t.abbr));
  const winnerTeam = playing[0];
  const loserTeam = playing[1];
  const board = fixtureBoard(week, winnerTeam.abbr, loserTeam.abbr);

  // ---- a pool on the fastclock floors -----------------------------------
  /* DRILL_POOL resumes against a pool an earlier run left behind, skipping
   * creation and joining. It exists because the first thing this drill found
   * was a refusal to post that needed a second look at the same pool, and a
   * pool that already has its picks in is the only way to take that look
   * without another five minutes of clock. */
  let poolAddress: PublicKey;
  let locks: number[];
  if (process.env.DRILL_POOL) {
    poolAddress = new PublicKey(process.env.DRILL_POOL);
    const info = await connection.getAccountInfo(poolAddress);
    if (!info) throw new Error(`no pool at ${poolAddress.toBase58()}`);
    locks = P.decodePool(info.data).lockTs;
    console.log(`\nresuming ${poolAddress.toBase58()} (lock ${locks[0]}, now ${now()})`);
  } else {
    const gap = minWeekGapSecs(DISPUTE_SECS) + 60;
    const first = now() + LOCK_IN_SECS;
    locks = Array.from({ length: 18 }, (_, i) => first + i * gap);
    const plan = P.buildCreatePool({
      commissioner: admin.publicKey,
      nonce: P.randomNonce(),
      name: `Oracle drill ${new Date().toISOString().slice(11, 16)}`,
      poolType: P.POOL_SURVIVOR,
      buyIn: BigInt(0),
      maxMembers: 4,
      startWeek: week,
      lockTs: locks,
      refundDeadlineTs: locks[17] + 300,
      disputeWindowSecs: DISPUTE_SECS,
    });
    poolAddress = plan.pool;
    console.log(`\ncreating ${plan.pool.toBase58()} (lock in ${LOCK_IN_SECS}s, dispute ${DISPUTE_SECS}s)`);
    console.log(`  ${await send([plan.instruction], [admin])}`);

    /* Deterministic per pool and per bot, through a hash rather than a padded
     * string: a pool address is 44 characters, so "pool:i" cut to 32 bytes
     * lost the ":i" and both bots came out as the same wallet. Found by the
     * second one failing to join. */
    const bots = [0, 1].map((i) =>
      Keypair.fromSeed(
        Uint8Array.from(
          createHash("sha256").update(`${plan.pool.toBase58()}:${i}`).digest(),
        ),
      ),
    );
    for (const [i, bot] of bots.entries()) {
      const team = i === 0 ? winnerTeam : loserTeam;
      await send(
        [
          SystemProgram.transfer({
            fromPubkey: admin.publicKey,
            toPubkey: bot.publicKey,
            lamports: 0.02 * LAMPORTS_PER_SOL,
          }),
        ],
        [admin],
      );
      await send(
        [
          P.createAtaIdempotentIx(bot.publicKey, bot.publicKey, P.USDC_MINT),
          P.buildJoinPool({ pool: plan.pool, wallet: bot.publicKey, displayName: `Bot ${i + 1}` })
            .instruction,
          P.buildSubmitPick({ pool: plan.pool, wallet: bot.publicKey, team: team.i }),
        ],
        [bot],
      );
      console.log(`  bot ${i + 1} ${bot.publicKey.toBase58().slice(0, 8)}… joined and picked ${team.abbr}`);
    }
  }
  const plan = { pool: poolAddress };

  // ---- the worker, exactly as deployed, with a stand-in for the feeds ----
  const env: Env = {
    RPC_URL: RPC,
    HELIUS_CLUSTER: "devnet",
    ORACLE_KEYPAIR: posterJson,
    MIN_AGREEING_FEEDS: "2",
    MIN_POST_DELAY_SECS: "60",
    ORACLE_FIXTURE: JSON.stringify(board),
  };
  const mine = (s: Awaited<ReturnType<typeof runCycle>>) => ({
    chainNow: s.now,
    actions: s.actions.filter((a) => a.pool === plan.pool.toBase58()),
    errors: s.errors.filter((e) => e.pool === plan.pool.toBase58() || e.pool === "-"),
    skipped: s.skipped.filter((k) => k.pool === plan.pool.toBase58()),
  });

  /* Three seconds past the floor rather than one: the program's floor is
   * judged by the validator's clock and the worker's by this machine's, and
   * devnet's clock is not this machine's. */
  await waitUntil(locks[0] + 63, "the lock and the posting floor");
  console.log(`\ntick 1: should post week 1 (wall clock ${now()}, floor ${locks[0] + 60})`);
  const t1 = mine(await runCycle(env));
  report(t1);
  if (!t1.actions.some((a) => a.did.startsWith("posted week 1"))) {
    throw new Error("the worker did not post");
  }

  const posted = P.decodePool((await connection.getAccountInfo(plan.pool))!.data);
  await waitUntil(posted.pendingPostedTs + DISPUTE_SECS + 3, "the dispute window");
  console.log(`\ntick 2: should finalize, settle both, and settle the pool (wall clock ${now()})`);
  const t2 = mine(await runCycle(env));
  report(t2);

  const after = P.decodePool((await connection.getAccountInfo(plan.pool))!.data);
  const members = await connection.getProgramAccounts(P.PROGRAM_ID, {
    filters: P.memberAccountFilters(plan.pool),
  });
  console.log(`\npool     status ${after.status} (4 = SETTLED)  alive ${after.aliveCount}  week ${after.currentWeek}`);
  for (const m of members) {
    const v = P.decodeMember(m.account.data);
    console.log(`member   ${v.displayName.padEnd(6)} eliminated week ${v.eliminatedWeek}  processed ${v.processedWeek}`);
  }
  if (after.status !== P.STATUS_SETTLED || after.aliveCount !== 1) {
    throw new Error("the pool did not settle to one survivor");
  }
  console.log("\nDRILL PASSED: the worker posted, finalized, settled and closed the week on devnet.");
}

function report(t: { chainNow: number; actions: { did: string; sig?: string }[]; errors: { error: string }[]; skipped: { why: string }[] }) {
  console.log(`  chain clock ${t.chainNow}  (this machine ${now()})`);
  for (const a of t.actions) console.log(`  did   ${a.did}\n        ${a.sig}`);
  for (const k of t.skipped) console.log(`  skip  ${k.why}`);
  for (const e of t.errors) console.log(`  ERR   ${e.error}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
