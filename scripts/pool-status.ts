/* What the chain holds for one pool, on any cluster, read-only.
 *
 *   npx tsx scripts/pool-status.ts <pool address>
 *   RPC_URL=https://api.devnet.solana.com npx tsx scripts/pool-status.ts <pool>
 *
 * seed-pool.ts has a `status` command and refuses mainnet on principle,
 * because the rest of that script funds and signs. This reads and nothing
 * else, so it may look at real money. It goes through rpc.commish.fun by
 * default, with the Origin header that proxy requires, which is the owner
 * reading their own service: nothing here writes.
 */

import { Connection, PublicKey } from "@solana/web3.js";

import { TEAMS } from "@/lib/nfl";
import {
  decodeMember,
  decodePool,
  memberAccountFilters,
  POOL_LEAGUE,
  POOL_LOSER,
  PROGRAM_ID,
  STATUS_ABANDONED,
  STATUS_FINALIZED,
  STATUS_LOCKED,
  STATUS_OPEN,
  STATUS_RESULTS_POSTED,
  STATUS_SETTLED,
  STATUS_SHEET_FINALIZED,
  STATUS_SHEET_POSTED,
  WEEK_NONE,
} from "@/lib/program";

const RPC = process.env.RPC_URL ?? "https://rpc.commish.fun";
const STATUS: Record<number, string> = {
  [STATUS_OPEN]: "OPEN",
  [STATUS_LOCKED]: "LOCKED",
  [STATUS_RESULTS_POSTED]: "RESULTS_POSTED",
  [STATUS_FINALIZED]: "FINALIZED",
  [STATUS_SETTLED]: "SETTLED",
  [STATUS_ABANDONED]: "ABANDONED",
  [STATUS_SHEET_POSTED]: "SHEET_POSTED",
  [STATUS_SHEET_FINALIZED]: "SHEET_FINALIZED",
};
const when = (ts: number) => (ts ? new Date(ts * 1000).toISOString() : "-");
const dur = (s: number) =>
  s >= 3600 ? `${Math.round(s / 360) / 10}h` : s >= 60 ? `${Math.round(s / 60)}m` : `${s}s`;

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("usage: pool-status.ts <pool address>");
  const address = new PublicKey(arg);
  const connection = new Connection(RPC, {
    commitment: "confirmed",
    httpHeaders: { Origin: "https://commish.fun" },
  });

  const info = await connection.getAccountInfo(address);
  if (!info) throw new Error(`no account at ${address.toBase58()}`);
  const p = decodePool(info.data);
  const kind =
    p.poolType === POOL_LEAGUE ? "League" : p.poolType === POOL_LOSER ? "Loser" : "Survivor";
  const week = p.currentWeek;
  const lock = p.lockTs[week - 1] ?? 0;

  console.log(`${p.name}  (${kind})`);
  console.log(`  status        ${STATUS[p.status] ?? p.status}`);
  console.log(`  week          ${week}   lock ${when(lock)}`);
  console.log(`  members       ${p.paidMembers} paid, ${p.aliveCount} alive`);
  console.log(`  dispute       ${dur(p.disputeWindowSecs)}`);
  if (p.pendingWeek !== WEEK_NONE) {
    const closes = p.pendingPostedTs + p.disputeWindowSecs;
    console.log(`  pending       week ${p.pendingWeek}, posted ${when(p.pendingPostedTs)}, window closes ${when(closes)}`);
    console.log(`  winners mask  ${p.pendingWinners.toString(2).padStart(32, "0")}`);
  }
  console.log(`  posting opens ${when(lock + 3 * 3600)}  (lock + 3h, the mainnet floor)`);

  const members = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: memberAccountFilters(address),
  });
  for (const m of members) {
    const v = decodeMember(m.account.data);
    const pick = TEAMS[v.currentPick]?.abbr ?? (v.currentPick === 255 ? "-" : String(v.currentPick));
    console.log(
      `  member        ${v.displayName.padEnd(12)} pick ${pick.padEnd(4)} ` +
        `${v.eliminatedWeek === WEEK_NONE ? "alive" : `out wk ${v.eliminatedWeek}`}  processed wk ${v.processedWeek}`,
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
