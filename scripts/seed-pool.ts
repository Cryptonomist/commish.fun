/* Get a pool to the interesting part without the tedium.
 *
 * The results loop — post, dispute, veto, finalize, settle, advance, claim —
 * has never been driven against a live pool, and the only thing standing in the
 * way is the setup: funding wallets, joining from several of them, and getting
 * picks in before a lock. This does that part so the browser only has to do the
 * part that has never been seen.
 *
 * ON A LOCAL VALIDATOR YOU ARE THE COMMISSIONER. The commissioner screen only
 * appears for the wallet that created the pool, and this script cannot sign for
 * your browser wallet, so pool creation stays in the browser where it already
 * works. Everything else here can be done from the command line.
 *
 *   npx tsx scripts/seed-pool.ts fund <your-wallet> [dollars]
 *   npx tsx scripts/seed-pool.ts create [dues] [disputeMins]
 *   npx tsx scripts/seed-pool.ts join <pool> [members]
 *   npx tsx scripts/seed-pool.ts veto <pool> [votes]
 *   npx tsx scripts/seed-pool.ts status <pool>
 *
 * A full run, on a fastclock build:
 *
 *   1. fund <your-wallet>                 SOL and test USDC
 *   2. create a pool at /pools/new        30 second dispute window
 *   3. join <pool>                        three members, each on a named team
 *   4. wait for the lock, then a minute    fastclock: MIN_POST_DELAY is 60s
 *   5. post results in the browser        mark some winners, leave others
 *   6. veto <pool>                        strike it down, post again
 *   7. run the week in the browser        finalize, settle, advance
 *   8. claim
 *
 * `status` prints what the chain actually holds at any point, which is the
 * thing to trust when a screen looks wrong.
 *
 * DEVNET WORKS TOO, AND DIFFERENTLY. There the money is not conjured: SOL comes
 * from a rate-limited faucet and USDC is Circle's, which nobody else can mint.
 * So `fund` transfers out of your own balance rather than creating anything,
 * and running out means running out — which is the point, because that is what
 * a real deployment does. `create` exists for the same reason: a devnet run
 * wants a commissioner the script can sign for, so it can be left alone for the
 * four hours a production-timing week actually takes.
 *
 * NEVER MAINNET, and it refuses: it funds wallets it holds the keys to and
 * signs on their behalf, which is a thing to do with test money only.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

/* The app reads NEXT_PUBLIC_* at module scope, and nothing loads .env.local
 * outside Next. Set it before importing anything from src/, which is why the
 * app imports below are dynamic: static ones are hoisted above this. */
function loadEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

/* BEFORE `RPC`, NOT INSIDE main(). This used to run after the constant below
 * had already been evaluated, so an RPC_URL set in .env.local was read too
 * late and silently ignored — the script announced localhost and ran there
 * while you believed you were pointed at devnet. Every guard in this file keys
 * off that string, so getting it from the wrong place is not a small bug: it
 * is the difference between minting counterfeit dollars on a validator and
 * thinking you did. An explicit RPC_URL in the environment still wins, because
 * loadEnvLocal never overwrites what is already set. */
loadEnvLocal();

const RPC = process.env.RPC_URL ?? "http://localhost:8899";

/** Which cluster, and therefore whether money can be conjured. */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(RPC);
const DEVNET = /devnet/.test(RPC);

/* What a bot needs to exist: rent for its member account and its token account,
 * plus signatures. A local faucet hands out 2 SOL a wallet because it costs
 * nothing; on devnet this comes out of a balance that has to last the run, and
 * the measured cost is under a hundredth of this. */
const BOT_LAMPORTS = 20_000_000;

/** Members are derived from the pool address, so `join` and `veto` agree on who
 *  they are without a state file to lose. */
function botFor(pool: string, i: number): Keypair {
  const seed = crypto
    .createHash("sha256")
    .update(`commish-seed-bot:${pool}:${i}`)
    .digest();
  return Keypair.fromSeed(seed.subarray(0, 32));
}

const SPL_TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

/** SPL MintTo. The local mint's authority is your CLI keypair, which is what
 *  `scripts/local-usdc.ts dump` arranged. */
function mintToIx(
  mint: PublicKey,
  dest: PublicKey,
  authority: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const data = Buffer.alloc(9);
  data.writeUInt8(7, 0);
  data.writeBigUInt64LE(amount, 1);
  return new TransactionInstruction({
    programId: SPL_TOKEN,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

/** SPL TransferChecked, for the devnet path where dollars are moved rather than
 *  minted. Plain `Transfer` would also work and is one account shorter, but it
 *  verifies neither the mint nor the decimals — and an amount sent at the wrong
 *  decimal place is off by a factor of a million in whichever direction hurts.
 *  Real dollars are worth the extra account. */
function transferCheckedIx(
  source: PublicKey,
  mint: PublicKey,
  dest: PublicKey,
  owner: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const data = Buffer.alloc(10);
  data.writeUInt8(12, 0);
  data.writeBigUInt64LE(amount, 1);
  data.writeUInt8(6, 9); // USDC decimals, and the program checks them
  return new TransactionInstruction({
    programId: SPL_TOKEN,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

function loadCliKeypair(): Keypair {
  const file =
    process.env.KEYPAIR ??
    path.join(process.env.HOME ?? "", ".config/solana/id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")) as number[]),
  );
}

const fmtUsd = (base: bigint) => `$${(Number(base) / 1e6).toFixed(2)}`;
const inWords = (secs: number) => {
  if (secs <= 0) return "now";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

async function main() {
  const [cmd, arg, extra, extra2, extra3] = process.argv.slice(2);

  if (!LOCAL && !DEVNET) {
    throw new Error(
      `Refusing to run against ${RPC}. This holds the keys to the wallets it ` +
        `funds and signs on their behalf; it belongs on a local validator or ` +
        `devnet, never on anything holding real money.`,
    );
  }

  /* The client's copies of the program's timing floors come from this flag, and
   * a devnet deploy never has fastclock compiled in — it refuses to build
   * without `devnet`, and nobody deploys that pair anywhere but a validator. So
   * this combination is always a stale .env.local, and it fails in a way that
   * wastes an afternoon: `create` builds a schedule ninety seconds wide, the
   * chain wants four hours, and the rejection names BadDisputeWindow rather
   * than the environment variable that caused it. */
  if (DEVNET && process.env.NEXT_PUBLIC_FAST_CLOCK === "1") {
    throw new Error(
      `NEXT_PUBLIC_FAST_CLOCK=1 with a devnet RPC. That flag shortens this ` +
        `script's copy of the posting floor to 60s and the dispute window to ` +
        `30s, but a devnet build compiles the real ones in — so every schedule ` +
        `built here would be rejected on chain. Unset it, or pass ` +
        `NEXT_PUBLIC_FAST_CLOCK=0 for this run.`,
    );
  }

  const P = await import("@/lib/program");
  const { TEAMS } = await import("@/lib/nfl");
  const {
    MIN_POST_DELAY_SECS,
    MIN_DISPUTE_WINDOW_SECS,
    minWeekGapSecs,
    validateSchedule,
    seasonLockSchedule,
    firstKickoffFor,
    refundDeadlineFor,
  } = await import("@/lib/schedule");
  const { isOnBye, weekOf } = await import("@/lib/season");

  const connection = new Connection(RPC, "confirmed");
  const payer = loadCliKeypair();
  const now = () => Math.floor(Date.now() / 1000);

  const send = async (ixs: TransactionInstruction[], signers: Keypair[]) =>
    sendAndConfirmTransaction(
      connection,
      new Transaction().add(...ixs),
      signers,
      { commitment: "confirmed" },
    );

  /** SOL to pay rent and fees, and dollars to join with.
   *
   * The two clusters do this by opposite means. Locally both are conjured —
   * SOL from the validator's faucet, USDC from a mint whose authority is your
   * own key. On devnet neither can be: the faucet is rate-limited to a couple
   * of SOL and its USDC is Circle's, whose mint authority is Circle. So there
   * the money moves out of the payer's balance, which is finite, and a run that
   * asks for more than there is fails saying so. */
  async function fund(who: PublicKey, dollars: number) {
    const ata = P.ataFor(who, P.USDC_MINT);
    const base = BigInt(Math.round(dollars * 1e6));

    if (LOCAL) {
      if ((await connection.getBalance(who)) < 2e9) {
        await connection.confirmTransaction(
          {
            signature: await connection.requestAirdrop(who, 2e9),
            ...(await connection.getLatestBlockhash()),
          },
          "confirmed",
        );
      }
      await send(
        [
          P.createAtaIdempotentIx(payer.publicKey, who, P.USDC_MINT),
          mintToIx(P.USDC_MINT, ata, payer.publicKey, base),
        ],
        [payer],
      );
      return;
    }

    const ixs: TransactionInstruction[] = [];
    const have = await connection.getBalance(who);
    if (have < BOT_LAMPORTS) {
      ixs.push(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: who,
          lamports: BOT_LAMPORTS - have,
        }),
      );
    }
    ixs.push(P.createAtaIdempotentIx(payer.publicKey, who, P.USDC_MINT));
    if (base > BigInt(0)) {
      ixs.push(
        transferCheckedIx(
          P.ataFor(payer.publicKey, P.USDC_MINT),
          P.USDC_MINT,
          ata,
          payer.publicKey,
          base,
        ),
      );
    }
    await send(ixs, [payer]);
  }

  /** What the payer can actually afford, checked once before a run rather than
   *  discovered three bots in with a half-joined pool on chain. */
  async function assertPayerCanAfford(bots: number, duesEach: number) {
    if (LOCAL) return;
    const sol = await connection.getBalance(payer.publicKey);
    const needSol = bots * BOT_LAMPORTS + 10_000_000;
    if (sol < needSol) {
      throw new Error(
        `${payer.publicKey.toBase58()} has ${(sol / 1e9).toFixed(4)} SOL; ` +
          `${bots} bots need about ${(needSol / 1e9).toFixed(3)}. ` +
          `Devnet SOL: solana airdrop 2 --url devnet, or https://faucet.solana.com`,
      );
    }
    const need = BigInt(Math.round(bots * duesEach * 1e6));
    const held = await connection
      .getTokenAccountBalance(P.ataFor(payer.publicKey, P.USDC_MINT))
      .then((b) => BigInt(b.value.amount))
      .catch(() => BigInt(0));
    if (held < need) {
      throw new Error(
        `${payer.publicKey.toBase58()} holds ${fmtUsd(held)} of devnet USDC; ` +
          `${bots} bots at ${fmtUsd(BigInt(Math.round(duesEach * 1e6)))} need ` +
          `${fmtUsd(need)}. Devnet USDC comes from https://faucet.circle.com ` +
          `(pick Solana Devnet). Nobody but Circle can mint it.`,
      );
    }
  }

  switch (cmd) {
    case "fund": {
      if (!arg) throw new Error("usage: fund <wallet> [dollars]");
      const who = new PublicKey(arg);
      const dollars = Number(extra ?? 500);
      await fund(who, dollars);
      const bal = await connection.getTokenAccountBalance(
        P.ataFor(who, P.USDC_MINT),
      );
      console.log(`funded ${who.toBase58()}`);
      console.log(`  SOL   ${(await connection.getBalance(who)) / 1e9}`);
      console.log(`  USDC  ${fmtUsd(BigInt(bal.value.amount))}`);
      console.log(`\nNow create a pool at http://localhost:3000/pools/new`);
      break;
    }

    case "create": {
      /* A commissioner the script can sign for.
       *
       * On a local validator the pool is made in the browser, because there the
       * screen IS the thing being tested. A devnet run is the opposite: what is
       * being tested is four hours of real timing floors against a real
       * cluster's clock, and nobody should have to sit in front of a browser
       * for them. */
      const dues = Number(arg ?? (LOCAL ? 25 : 1));
      const disputeWindowSecs = extra
        ? Math.round(Number(extra) * 60)
        : MIN_DISPUTE_WINDOW_SECS;
      const startWeek = Number(extra2 ?? 1);

      /* TWO SCHEDULES, AND THE REAL ONE IS THE DEFAULT.
       *
       * A pool people are meant to join runs on the season that is actually
       * being played, read out of the committed schedule — the same locks the
       * pool creation form builds, so a pool made here and one made in the
       * browser are the same object. That is what a demo pool has to be.
       *
       * `compressed` is the other thing: eighteen synthetic locks packed as
       * tightly as `create_pool` permits, for walking the results loop without
       * waiting out a season. It is a testing instrument, so it is opt-in. */
      let locks: number[];
      let refundDeadlineTs: number;

      if (extra3 === "compressed") {
        /* Strictly greater than the program's floor, not equal to it: the
         * check is `gap > min_week_gap`, so a schedule built to land exactly
         * on the boundary is rejected. The slack also absorbs the clock moving
         * while the transaction is in flight. */
        const gap = minWeekGapSecs(disputeWindowSecs) + 300;
        /* Starting at week 18 back-dates the other seventeen locks, which
         * `create_pool` allows — it requires only that the week this pool
         * actually plays has not kicked off yet. That is the one way to reach
         * a refund deadline in minutes instead of days: the deadline must be
         * later than the LAST lock, and on production timing eighteen locks
         * more than four hours apart are three days wide no matter when they
         * start. It is what makes `reclaim_dues` reachable without waiting out
         * a season. */
        const first = now() + 600 - (startWeek - 1) * gap;
        locks = Array.from({ length: 18 }, (_, i) => first + i * gap);
        refundDeadlineTs = locks[17] + (startWeek === 18 ? 300 : 14 * 24 * 60 * 60);
      } else {
        locks = seasonLockSchedule(firstKickoffFor(startWeek));
        refundDeadlineTs = refundDeadlineFor(locks);
        if (locks[startWeek - 1] <= now()) {
          throw new Error(
            `Week ${startWeek} locked at ` +
              `${new Date(locks[startWeek - 1] * 1000).toISOString()}, which has ` +
              `passed — create_pool refuses a week that already kicked off, and ` +
              `it is right to. Pick a later week, or pass "compressed" as the ` +
              `fourth argument for a synthetic schedule.`,
          );
        }
      }

      // Everything create_pool checks about time, checked before signing.
      const problem = validateSchedule({
        locks,
        disputeWindowSecs,
        startWeek,
        nowSecs: now(),
      });
      if (problem) throw new Error(`${problem.field}: ${problem.message}`);

      /* A pool on the real season is something people are going to open and
       * read, so it gets a name rather than a timestamp. A compressed one is a
       * test fixture and a timestamp is the most useful thing it can be called,
       * because there will be several and they differ only in when they were
       * made. POOL_NAME overrides either; 32 bytes is the program's limit. */
      const name =
        process.env.POOL_NAME ??
        (extra3 === "compressed"
          ? `Bots ${new Date().toISOString().slice(5, 16).replace("T", " ")}`
          : `Commish Demo - Week ${startWeek}`);
      if (new TextEncoder().encode(name).length > P.MAX_NAME) {
        throw new Error(`"${name}" is over ${P.MAX_NAME} bytes.`);
      }

      const plan = P.buildCreatePool({
        commissioner: payer.publicKey,
        nonce: P.randomNonce(),
        name,
        poolType: P.POOL_SURVIVOR,
        buyIn: BigInt(Math.round(dues * 1e6)),
        maxMembers: 16,
        startWeek,
        lockTs: locks,
        refundDeadlineTs,
        disputeWindowSecs,
      });
      await send([plan.instruction], [payer]);

      const lock = locks[startWeek - 1];
      console.log(`pool          ${plan.pool.toBase58()}`);
      console.log(`commissioner  ${payer.publicKey.toBase58()}`);
      console.log(`buy-in        ${fmtUsd(BigInt(Math.round(dues * 1e6)))}`);
      console.log(`start week    ${startWeek}`);
      console.log(`locks         ${inWords(lock - now())}  (joining closes then)`);
      console.log(
        `posting opens ${inWords(lock + MIN_POST_DELAY_SECS - now())}`,
      );
      console.log(
        `dispute       ${disputeWindowSecs}s after posting`,
      );
      console.log(
        `refund due    ${inWords(refundDeadlineTs - now())}  (reclaim_dues opens)`,
      );
      console.log(
        `\nJoin the bots now — they cannot join after the lock:\n` +
          `  npx tsx scripts/seed-pool.ts join ${plan.pool.toBase58()} 3`,
      );
      break;
    }

    case "join": {
      if (!arg) throw new Error("usage: join <pool> [members]");
      const pool = new PublicKey(arg);
      const count = Number(extra ?? 3);
      const info = await connection.getAccountInfo(pool);
      if (!info) throw new Error(`No pool at ${pool.toBase58()}`);
      const decoded = P.decodePool(info.data);

      const week = decoded.currentWeek;
      /* Teams on a bye are not pickable, so the bots do not pick them. The
       * program has no bye logic — an unmarked team is simply a loss — so a bot
       * on a bye would be quietly eliminated by a correctly posted week, which
       * is exactly the trap the pick grid now closes for people. */
      const pickable = TEAMS.filter((t) => !isOnBye(week, t.i));
      const byes = weekOf(week)?.byes ?? [];

      console.log(`pool    ${decoded.name}`);
      console.log(`buy-in  ${fmtUsd(decoded.buyIn)}`);
      console.log(`week    ${week}${byes.length ? ` · on a bye: ${byes.join(" ")}` : ""}`);
      console.log(`lock    ${inWords(decoded.lockTs[week - 1] - now())}\n`);

      /* Locally a bot is handed the buy-in plus a hundred dollars of slack,
       * because the dollars are counterfeit and slack costs nothing. On devnet
       * it gets the buy-in and not a cent more: that comes out of a faucet
       * allowance, and overfunding three bots is how a fourth cannot join. */
      const dues = Number(decoded.buyIn) / 1e6;
      await assertPayerCanAfford(count, dues);

      for (let i = 0; i < count; i++) {
        const bot = botFor(pool.toBase58(), i);
        // Each on a different team, so posting results can take some of them
        // out and leave others standing. That is the case worth seeing.
        const team = pickable[i % pickable.length];
        await fund(bot.publicKey, LOCAL ? dues + 100 : dues);
        await send(
          [
            P.createAtaIdempotentIx(bot.publicKey, bot.publicKey, P.USDC_MINT),
            P.buildJoinPool({
              pool,
              wallet: bot.publicKey,
              displayName: `Bot ${i + 1}`,
            }).instruction,
          ],
          [bot],
        );
        await send(
          [P.buildSubmitPick({ pool, wallet: bot.publicKey, team: team.i })],
          [bot],
        );
        console.log(
          `  Bot ${i + 1}  ${bot.publicKey.toBase58().slice(0, 8)}…  picked ${team.abbr} (${team.city} ${team.name})`,
        );
      }
      console.log(
        `\nMark some of those teams winners and leave the rest, and you will ` +
          `see both outcomes.`,
      );
      break;
    }

    case "veto": {
      if (!arg) throw new Error("usage: veto <pool> [votes]");
      const pool = new PublicKey(arg);
      /* How many bots vote. Defaults to all of them, which clears a posting;
       * pass a number below the threshold to watch one that does NOT — a
       * minority vote is the half of the veto that protects the commissioner,
       * and it is not a thing a person can stage by hand inside a thirty
       * second window. */
      const limit = Number(extra ?? 99);
      const decoded = P.decodePool(
        (await connection.getAccountInfo(pool))!.data,
      );
      if (decoded.status !== P.STATUS_RESULTS_POSTED) {
        throw new Error("Nothing is posted to vote on.");
      }
      const needed = P.vetoThreshold(decoded.aliveCount);
      console.log(
        `week ${decoded.pendingWeek} posted · ${decoded.vetoCount} of ${needed} votes so far · ${decoded.aliveCount} alive\n`,
      );
      let cast = 0;
      for (let i = 0; i < 8 && cast < limit; i++) {
        const bot = botFor(pool.toBase58(), i);
        const member = await connection.getAccountInfo(
          P.memberPda(pool, bot.publicKey),
        );
        if (!member) continue;
        const m = P.decodeMember(member.data);
        if (!P.isAlive(m) || P.hasVetoedPosting(m, decoded)) continue;
        await send(
          [P.buildVetoResults({ pool, wallet: bot.publicKey })],
          [bot],
        );
        cast++;
        console.log(`  Bot ${i + 1} voted to strike it down`);
      }
      if (cast === 0) console.log("  Nobody left who can vote on this posting.");
      const after = P.decodePool((await connection.getAccountInfo(pool))!.data);
      console.log(
        after.status === P.STATUS_RESULTS_POSTED
          ? `\nStill standing: ${after.vetoCount} of ${needed}. Not a majority.`
          : `\nStruck down. Post week ${after.currentWeek} again.`,
      );
      break;
    }

    case "post": {
      /* The commissioner's half of the week. Named teams won; everything else
       * lost. Pushes are not exposed here — a push is a real outcome but it
       * takes a game the schedule says was played and calls it neither way,
       * which is a browser decision, not a scripted one. */
      if (!arg) throw new Error("usage: post <pool> ARI,BAL,…");
      const pool = new PublicKey(arg);
      const p = P.decodePool((await connection.getAccountInfo(pool))!.data);

      const opens = p.lockTs[p.currentWeek - 1] + MIN_POST_DELAY_SECS;
      if (now() < opens) {
        throw new Error(
          `post_results opens in ${inWords(opens - now())}. The floor is ` +
            `${MIN_POST_DELAY_SECS / 3600}h after the lock, and it exists so a ` +
            `week cannot be called before it is played.`,
        );
      }

      const abbrs = (extra ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      let winners = 0;
      for (const a of abbrs) {
        const t = TEAMS.find((x) => x.abbr === a);
        if (!t) throw new Error(`No team called ${a}`);
        winners = (winners | P.teamBit(t.i)) >>> 0;
      }

      await send(
        [
          P.buildPostResults({
            pool,
            commissioner: payer.publicKey,
            week: p.currentWeek,
            winners,
            pushes: 0,
          }),
        ],
        [payer],
      );

      const after = P.decodePool((await connection.getAccountInfo(pool))!.data);
      console.log(
        `week ${after.pendingWeek} posted · won: ${abbrs.join(" ") || "nobody"}`,
      );
      console.log(
        `dispute closes in ${inWords(after.pendingPostedTs + after.disputeWindowSecs - now())} ` +
          `· ${P.vetoThreshold(after.aliveCount)} of ${after.aliveCount} votes would strike it down`,
      );
      break;
    }

    case "run": {
      /* finalize → settle → advance, the same three steps RunWeek.tsx takes in
       * the browser and in the same order. Re-running it is safe: each step
       * checks the pool's status first, and `pendingSettles` drops members the
       * previous attempt already processed. */
      if (!arg) throw new Error("usage: run <pool>");
      const pool = new PublicKey(arg);
      let p = P.decodePool((await connection.getAccountInfo(pool))!.data);

      /* Checked before anything is signed. advance_week names this account
       * whether or not a fee is charged, and Anchor deserializes it before any
       * of the program's own checks run — so a missing one fails with an error
       * that says nothing about treasuries, after the settling is done. */
      const treasuryAta = P.ataFor(p.feeTreasury, p.usdcMint);
      if (!(await connection.getAccountInfo(treasuryAta))) {
        throw new Error(
          `The fee treasury has no USDC account, so the week cannot close. ` +
            `Create the associated token account for ${p.feeTreasury.toBase58()}.`,
        );
      }

      if (p.status === P.STATUS_RESULTS_POSTED) {
        const closes = p.pendingPostedTs + p.disputeWindowSecs;
        if (now() < closes) {
          throw new Error(
            `The dispute window closes in ${inWords(closes - now())}. ` +
              `finalize_week refuses until members have had their say.`,
          );
        }
        console.log(`committing week ${p.pendingWeek}…`);
        await send([P.buildFinalizeWeek(pool)], [payer]);
        p = P.decodePool((await connection.getAccountInfo(pool))!.data);
      }
      if (p.status !== P.STATUS_FINALIZED) {
        throw new Error(`Nothing to run: pool status is ${p.status}.`);
      }

      const week = p.finalizedWeek;
      const entries = (
        await connection.getProgramAccounts(P.PROGRAM_ID, {
          filters: P.memberAccountFilters(pool),
        })
      ).map((g) => ({
        address: g.pubkey,
        member: P.decodeMember(g.account.data),
      }));
      const pending = P.pendingSettles(entries, week);

      if (pending.length > 0) {
        console.log(`settling ${pending.length} for week ${week}…`);
        for (let i = 0; i < pending.length; i += P.SETTLES_PER_TX) {
          await send(
            pending
              .slice(i, i + P.SETTLES_PER_TX)
              .map((e) => P.buildSettleMember(pool, e.address)),
            [payer],
          );
        }
      }

      console.log(`closing week ${week}…`);
      await send(
        [P.buildAdvanceWeek({ pool, vault: p.vault, feeTreasuryAta: treasuryAta })],
        [payer],
      );

      const after = P.decodePool((await connection.getAccountInfo(pool))!.data);
      console.log(
        `\nweek ${week} closed · ${after.aliveCount} alive · now on week ${after.currentWeek}`,
      );
      if (after.status === P.STATUS_SETTLED) {
        console.log(
          `pool SETTLED · ${after.winnersCount} winner(s) at ${fmtUsd(after.potPerWinner)} each`,
        );
      }
      break;
    }

    case "claim": {
      if (!arg) throw new Error("usage: claim <pool>");
      const pool = new PublicKey(arg);
      const p = P.decodePool((await connection.getAccountInfo(pool))!.data);
      if (p.status !== P.STATUS_SETTLED) {
        throw new Error(
          `claim_pot needs a settled pool; this one is status ${p.status}. ` +
            `A pool that never settled pays through reclaim_dues instead.`,
        );
      }

      const vaultBefore = BigInt(
        (await connection.getTokenAccountBalance(p.vault)).value.amount,
      );
      console.log(
        `vault ${fmtUsd(vaultBefore)} · ${p.winnersCount} winner(s) at ${fmtUsd(p.potPerWinner)}\n`,
      );

      let paid = 0;
      for (let i = 0; i < 8; i++) {
        const bot = botFor(pool.toBase58(), i);
        const info = await connection.getAccountInfo(
          P.memberPda(pool, bot.publicKey),
        );
        if (!info) continue;
        const m = P.decodeMember(info.data);
        if (m.claimed || !P.isAlive(m)) continue;

        const plan = P.buildClaimPot({
          pool,
          wallet: bot.publicKey,
          vault: p.vault,
          usdcMint: p.usdcMint,
        });
        const held = async () =>
          BigInt(
            (
              await connection
                .getTokenAccountBalance(plan.memberAta)
                .catch(() => ({ value: { amount: "0" } }))
            ).value.amount,
          );
        const was = await held();
        await send(
          [
            P.createAtaIdempotentIx(bot.publicKey, bot.publicKey, p.usdcMint),
            plan.instruction,
          ],
          [bot],
        );
        console.log(`  Bot ${i + 1}  ${fmtUsd(was)} -> ${fmtUsd(await held())}`);
        paid++;
      }

      const vaultAfter = BigInt(
        (await connection.getTokenAccountBalance(p.vault)).value.amount,
      );
      console.log(
        `\n${paid} paid · vault ${fmtUsd(vaultBefore)} -> ${fmtUsd(vaultAfter)}`,
      );
      if (vaultBefore - vaultAfter !== BigInt(paid) * p.potPerWinner) {
        console.log(
          `\nMISMATCH: the vault moved ${fmtUsd(vaultBefore - vaultAfter)} but ` +
            `${paid} payouts at ${fmtUsd(p.potPerWinner)} is ` +
            `${fmtUsd(BigInt(paid) * p.potPerWinner)}.`,
        );
      }
      break;
    }

    case "reclaim": {
      /* THE DEADMAN SWITCH, exercised.
       *
       * Every other path in this program has now been driven against a live
       * pool. This one never has, because reaching it means waiting out a
       * refund deadline that has to fall after the eighteenth lock — three days
       * on production timing. `create ... 18` back-dates the schedule so the
       * deadline lands minutes away instead, which is the only reason this
       * command can be run at all.
       *
       * What it proves is the promise that makes the escrow worth more than a
       * Venmo balance: the commissioner walks away and everybody still gets
       * their money back, from a pool nobody is running. */
      if (!arg) throw new Error("usage: reclaim <pool>");
      const pool = new PublicKey(arg);
      const p = P.decodePool((await connection.getAccountInfo(pool))!.data);

      const wait = p.refundDeadlineTs - now();
      if (wait > 0) {
        throw new Error(
          `The refund deadline is ${inWords(wait)} away, and reclaim_dues ` +
            `refuses until then. That refusal is the feature.`,
        );
      }
      if (p.status === P.STATUS_SETTLED) {
        throw new Error(
          "This pool settled, so the money went to a winner. reclaim_dues is " +
            "for pools that never finished; a settled one pays through claim_pot.",
        );
      }

      const vaultBefore = BigInt(
        (await connection.getTokenAccountBalance(p.vault)).value.amount,
      );
      console.log(`vault      ${fmtUsd(vaultBefore)} · ${p.paidMembers} paid`);
      console.log(
        `each gets  ${fmtUsd(P.estimatedRefund(p, vaultBefore))}` +
          `${p.refundPerMember === BigInt(0) ? "  (estimated — nobody has reclaimed yet)" : "  (fixed by the first caller)"}\n`,
      );

      let claimed = 0;
      for (let i = 0; i < 8; i++) {
        const bot = botFor(pool.toBase58(), i);
        const info = await connection.getAccountInfo(
          P.memberPda(pool, bot.publicKey),
        );
        if (!info) continue;
        const m = P.decodeMember(info.data);
        if (!m.paid || m.claimed) continue;

        const plan = P.buildReclaimDues({
          pool,
          wallet: bot.publicKey,
          vault: p.vault,
          usdcMint: p.usdcMint,
        });
        const held = async () =>
          BigInt(
            (await connection.getTokenAccountBalance(plan.memberAta).catch(
              () => ({ value: { amount: "0" } }),
            )).value.amount,
          );
        const was = await held();
        await send(
          [
            // A sponsored member may never have held USDC at all.
            P.createAtaIdempotentIx(bot.publicKey, bot.publicKey, p.usdcMint),
            plan.instruction,
          ],
          [bot],
        );
        console.log(
          `  Bot ${i + 1}  ${fmtUsd(was)} -> ${fmtUsd(await held())}`,
        );
        claimed++;
      }

      const after = P.decodePool((await connection.getAccountInfo(pool))!.data);
      const vaultAfter = BigInt(
        (await connection.getTokenAccountBalance(p.vault)).value.amount,
      );
      console.log(
        `\n${claimed} refunded · vault ${fmtUsd(vaultBefore)} -> ${fmtUsd(vaultAfter)}`,
      );
      console.log(
        `pool is now ${after.status === P.STATUS_ABANDONED ? "ABANDONED, which is what an unfinished pool becomes" : `status ${after.status}`}`,
      );
      if (vaultBefore - vaultAfter !== BigInt(claimed) * after.refundPerMember) {
        console.log(
          `\nMISMATCH: the vault moved ${fmtUsd(vaultBefore - vaultAfter)} but ` +
            `${claimed} refunds at ${fmtUsd(after.refundPerMember)} is ` +
            `${fmtUsd(BigInt(claimed) * after.refundPerMember)}.`,
        );
      }
      break;
    }

    case "status": {
      if (!arg) throw new Error("usage: status <pool>");
      const pool = new PublicKey(arg);
      const p = P.decodePool((await connection.getAccountInfo(pool))!.data);
      const names: Record<number, string> = {
        0: "OPEN",
        1: "LOCKED",
        2: "RESULTS POSTED",
        3: "FINALIZED",
        4: "SETTLED",
        5: "ABANDONED",
      };
      const vault = await connection
        .getTokenAccountBalance(p.vault)
        .catch(() => null);

      console.log(`${p.name}`);
      console.log(`  status        ${names[p.status] ?? p.status}`);
      console.log(`  week          ${p.currentWeek}`);
      console.log(`  members       ${p.paidMembers} paid · ${p.aliveCount} alive`);
      console.log(`  vault         ${vault ? fmtUsd(BigInt(vault.value.amount)) : "—"}`);

      const lock = p.lockTs[p.currentWeek - 1];
      console.log(`  lock          ${inWords(lock - now())}`);
      console.log(
        `  posting opens ${inWords(lock + MIN_POST_DELAY_SECS - now())}`,
      );

      if (p.status === P.STATUS_RESULTS_POSTED) {
        const closes = p.pendingPostedTs + p.disputeWindowSecs;
        console.log(
          `\n  week ${p.pendingWeek} posted, window closes ${inWords(closes - now())}`,
        );
        console.log(
          `  won           ${P.maskToTeams(p.pendingWinners).map((t) => TEAMS[t].abbr).join(" ") || "none"}`,
        );
        console.log(
          `  push          ${P.maskToTeams(p.pendingPushes).map((t) => TEAMS[t].abbr).join(" ") || "none"}`,
        );
        console.log(
          `  vetoes        ${p.vetoCount} of ${P.vetoThreshold(p.aliveCount)} needed`,
        );
      }
      if (p.status === P.STATUS_FINALIZED) {
        console.log(
          `\n  week ${p.finalizedWeek} committed · settled ${p.processedThisWeek} of ${p.aliveAtWeekStart}`,
        );
      }
      if (p.status === P.STATUS_SETTLED) {
        console.log(
          `\n  ${p.winnersCount} winner(s) · ${fmtUsd(p.potPerWinner)} each`,
        );
      }
      break;
    }

    default:
      console.log(
        [
          `cluster: ${RPC}${LOCAL ? " (local)" : " (devnet)"}`,
          "",
          "usage:",
          "  npx tsx scripts/seed-pool.ts fund <wallet> [dollars]",
          "  npx tsx scripts/seed-pool.ts create [dues] [disputeMins] [startWeek] [compressed]",
          "  npx tsx scripts/seed-pool.ts join <pool> [members]",
          "  npx tsx scripts/seed-pool.ts post <pool> ARI,BAL",
          "  npx tsx scripts/seed-pool.ts veto <pool> [votes]",
          "  npx tsx scripts/seed-pool.ts run <pool>",
          "  npx tsx scripts/seed-pool.ts claim <pool>",
          "  npx tsx scripts/seed-pool.ts reclaim <pool>",
          "  npx tsx scripts/seed-pool.ts status <pool>",
          "",
          "the deadman refund, start to finish:",
          "  create 1 1 18   a pool starting at week 18, refund deadline minutes away",
          "  join <pool> 3   three members pay in",
          "  reclaim <pool>  once the deadline passes, everybody takes their share back",
        ].join("\n"),
      );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
