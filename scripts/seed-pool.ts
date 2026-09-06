/* Get a pool to the interesting part without the tedium.
 *
 * The results loop — post, dispute, veto, finalize, settle, advance, claim —
 * has never been driven against a live pool, and the only thing standing in the
 * way is the setup: funding wallets, joining from several of them, and getting
 * picks in before a lock. This does that part so the browser only has to do the
 * part that has never been seen.
 *
 * YOU ARE THE COMMISSIONER, so you create the pool. The commissioner screen
 * only appears for the wallet that created the pool, and this script cannot
 * sign for your browser wallet, so pool creation stays in the browser where it
 * already works. Everything else here can be done from the command line.
 *
 *   npx tsx scripts/seed-pool.ts fund <your-wallet> [dollars]
 *   npx tsx scripts/seed-pool.ts join <pool> [members]
 *   npx tsx scripts/seed-pool.ts veto <pool>
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
 * LOCALNET ONLY, and it refuses anything else: it mints a counterfeit of a real
 * stablecoin and airdrops SOL, neither of which means anything off a local
 * validator.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC = process.env.RPC_URL ?? "http://localhost:8899";

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
  const [cmd, arg, extra] = process.argv.slice(2);
  loadEnvLocal();

  if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(RPC)) {
    throw new Error(
      `Refusing to run against ${RPC}. This mints counterfeit dollars and ` +
        `airdrops SOL; it is for a local validator only.`,
    );
  }

  const P = await import("@/lib/program");
  const { TEAMS } = await import("@/lib/nfl");
  const { MIN_POST_DELAY_SECS } = await import("@/lib/schedule");

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

  /** SOL to pay rent and fees, and test dollars to join with. */
  async function fund(who: PublicKey, dollars: number) {
    const sol = await connection.getBalance(who);
    if (sol < 2e9) {
      await connection.confirmTransaction(
        {
          signature: await connection.requestAirdrop(who, 2e9),
          ...(await connection.getLatestBlockhash()),
        },
        "confirmed",
      );
    }
    const ata = P.ataFor(who, P.USDC_MINT);
    await send(
      [
        P.createAtaIdempotentIx(payer.publicKey, who, P.USDC_MINT),
        mintToIx(P.USDC_MINT, ata, payer.publicKey, BigInt(dollars) * BigInt(1_000_000)),
      ],
      [payer],
    );
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

    case "join": {
      if (!arg) throw new Error("usage: join <pool> [members]");
      const pool = new PublicKey(arg);
      const count = Number(extra ?? 3);
      const info = await connection.getAccountInfo(pool);
      if (!info) throw new Error(`No pool at ${pool.toBase58()}`);
      const decoded = P.decodePool(info.data);

      console.log(`pool    ${decoded.name}`);
      console.log(`buy-in  ${fmtUsd(decoded.buyIn)}`);
      console.log(`lock    ${inWords(decoded.lockTs[decoded.currentWeek - 1] - now())}\n`);

      for (let i = 0; i < count; i++) {
        const bot = botFor(pool.toBase58(), i);
        // Each on a different team, so posting results can take some of them
        // out and leave others standing. That is the case worth seeing.
        const team = TEAMS[i % TEAMS.length];
        await fund(bot.publicKey, Number(decoded.buyIn / BigInt(1_000_000)) + 100);
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
      if (!arg) throw new Error("usage: veto <pool>");
      const pool = new PublicKey(arg);
      const decoded = P.decodePool(
        (await connection.getAccountInfo(pool))!.data,
      );
      if (decoded.status !== P.STATUS_RESULTS_POSTED) {
        throw new Error("Nothing is posted to vote on.");
      }
      const needed = P.vetoThreshold(decoded.aliveCount);
      console.log(
        `week ${decoded.pendingWeek} posted · ${decoded.vetoCount} of ${needed} votes so far\n`,
      );
      for (let i = 0; i < 8; i++) {
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
        console.log(`  Bot ${i + 1} voted to strike it down`);
      }
      const after = P.decodePool((await connection.getAccountInfo(pool))!.data);
      console.log(
        after.status === P.STATUS_RESULTS_POSTED
          ? `\nStill standing: ${after.vetoCount} of ${needed}. Not a majority.`
          : `\nStruck down. Post week ${after.currentWeek} again.`,
      );
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
          "usage:",
          "  npx tsx scripts/seed-pool.ts fund <wallet> [dollars]",
          "  npx tsx scripts/seed-pool.ts join <pool> [members]",
          "  npx tsx scripts/seed-pool.ts veto <pool>",
          "  npx tsx scripts/seed-pool.ts status <pool>",
        ].join("\n"),
      );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
