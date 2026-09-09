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
 * EVERY WAIT IS ON THE CHAIN'S CLOCK. The first version waited on this
 * machine's clock and lost twice: once when a wall clock stepped under a
 * monotonic timer, and once when the skew between this machine and the
 * validator shifted from ten seconds to two between one tick and the next,
 * so a wait that had ended here had not ended there. The program judges
 * every floor by the Clock sysvar, the worker now does too, and so does this.
 *
 * IT RESUMES. DRILL_POOL=<address> skips creation and picks up a pool in
 * whatever state an earlier run left it, which is how a refusal gets a second
 * look without another five minutes of clock.
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

import { chainNow } from "../workers/results-oracle/src/chain";
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
/** Seconds after the program's floor before a tick is attempted. */
const MARGIN = 4;

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

const machineNow = () => Math.floor(Date.now() / 1000);
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

/** Wait until the CHAIN says it is `ts`, re-reading rather than trusting one
 *  sleep, because the skew between here and the validator moves. */
async function waitForChain(ts: number, what: string) {
  for (;;) {
    const chain = await chainNow(connection);
    const left = ts - chain;
    if (left <= 0) return;
    console.log(`  waiting ${left}s for ${what} (chain ${chain}, here ${machineNow()})`);
    await sleep(Math.min(left, 20) + 1);
  }
}

async function readPool(address: PublicKey): Promise<P.PoolView> {
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) throw new Error(`no pool at ${address.toBase58()}`);
  return P.decodePool(info.data);
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

  // ---- a pool on the fastclock floors, or one left by an earlier run -----
  let poolAddress: PublicKey;
  if (process.env.DRILL_POOL) {
    poolAddress = new PublicKey(process.env.DRILL_POOL);
    const p = await readPool(poolAddress);
    console.log(`\nresuming ${poolAddress.toBase58()} at status ${p.status}, week ${p.currentWeek}`);
  } else {
    const gap = minWeekGapSecs(DISPUTE_SECS) + 60;
    const first = (await chainNow(connection)) + LOCK_IN_SECS;
    const locks = Array.from({ length: 18 }, (_, i) => first + i * gap);
    const plan = P.buildCreatePool({
      commissioner: admin.publicKey,
      nonce: P.randomNonce(),
      name: `Oracle drill ${new Date().toISOString().slice(11, 16)}`,
      poolType: P.POOL_SURVIVOR,
      buyIn: BigInt(0),
      maxMembers: 4,
      startWeek: week,
      lockTs: locks,
      // Past the settle room the program now insists on: floor + window +
      // the fast-clock margin, with a minute of slack for the clock.
      refundDeadlineTs: locks[17] + minWeekGapSecs(DISPUTE_SECS) + 60 + 60,
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
        Uint8Array.from(createHash("sha256").update(`${plan.pool.toBase58()}:${i}`).digest()),
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
  const id = poolAddress.toBase58();

  // ---- the worker, exactly as deployed, with a stand-in for the feeds ----
  const env: Env = {
    RPC_URL: RPC,
    HELIUS_CLUSTER: "devnet",
    ORACLE_KEYPAIR: posterJson,
    MIN_AGREEING_FEEDS: "2",
    MIN_POST_DELAY_SECS: "60",
    ORACLE_FIXTURE: JSON.stringify(board),
  };
  const tick = async (label: string) => {
    console.log(`\n${label}`);
    const s = await runCycle(env);
    console.log(`  chain clock ${s.now}  (this machine ${machineNow()})`);
    for (const a of s.actions.filter((a) => a.pool === id)) console.log(`  did   ${a.did}\n        ${a.sig}`);
    for (const k of s.skipped.filter((k) => k.pool === id)) console.log(`  skip  ${k.why}`);
    for (const e of s.errors.filter((e) => e.pool === id || e.pool === "-")) console.log(`  ERR   ${e.error}`);
    return s;
  };

  /* Each stage waits on the chain for the floor the program enforces, ticks
   * once, and re-reads. Starting from whatever state the pool is in is what
   * lets a resumed run pick up where a refused one stopped. */
  let pool = await readPool(poolAddress);

  if (
    (pool.status === P.STATUS_OPEN || pool.status === P.STATUS_LOCKED) &&
    pool.pendingWeek === P.WEEK_NONE
  ) {
    await waitForChain(pool.lockTs[pool.currentWeek - 1] + 60 + MARGIN, "the lock and the posting floor");
    const s = await tick("tick: should post week 1");
    if (!s.actions.some((a) => a.pool === id && a.did.startsWith("posted week 1"))) {
      throw new Error("the worker did not post");
    }
    pool = await readPool(poolAddress);
  }

  if (pool.status === P.STATUS_RESULTS_POSTED) {
    await waitForChain(pool.pendingPostedTs + pool.disputeWindowSecs + MARGIN, "the dispute window");
    await tick("tick: should finalize, settle both, and close the pool");
    pool = await readPool(poolAddress);
  }

  if (pool.status === P.STATUS_FINALIZED) {
    await tick("tick: should settle the rest and close the pool");
    pool = await readPool(poolAddress);
  }

  const members = await connection.getProgramAccounts(P.PROGRAM_ID, {
    filters: P.memberAccountFilters(poolAddress),
  });
  console.log(`\npool     status ${pool.status} (4 = SETTLED)  alive ${pool.aliveCount}  week ${pool.currentWeek}`);
  for (const m of members) {
    const v = P.decodeMember(m.account.data);
    console.log(`member   ${v.displayName.padEnd(6)} eliminated week ${v.eliminatedWeek}  processed ${v.processedWeek}`);
  }
  if (pool.status !== P.STATUS_SETTLED || pool.aliveCount !== 1) {
    throw new Error("the pool did not settle to one survivor");
  }
  console.log("\nDRILL PASSED: the worker posted, finalized, settled and closed the week on devnet.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
