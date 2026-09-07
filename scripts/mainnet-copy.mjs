/* Rewrite every sentence that stops being true on mainnet.
 *
 * Six claims across the four legal pages say the program is on devnet with
 * test tokens that have no value. On mainnet each of those is false, and they
 * are false in the direction that matters: they tell somebody their money is
 * not real.
 *
 * Run by scripts/mainnet-cutover.sh, which passes the addresses it read off
 * the chain rather than letting anything here guess them.
 *
 *   node scripts/mainnet-copy.mjs <programId> <programDataAddress> <authority>
 */
import fs from "node:fs";
import path from "node:path";

const [PROGRAM_ID, PROGRAM_DATA, AUTHORITY] = process.argv.slice(2);
if (!PROGRAM_ID || !PROGRAM_DATA || !AUTHORITY) {
  console.error(
    "usage: node scripts/mainnet-copy.mjs <programId> <programDataAddress> <authority>",
  );
  process.exit(1);
}

const DIR = "src/app";

const EDITS = [
  // ── Terms ────────────────────────────────────────────────────────────────
  /* The whole sentence, not just its opening. The tail of it explains that
   * devnet state can be reset without recovery, which is true of devnet and
   * nonsense on mainnet, and a half-replaced paragraph reads worse than either
   * version of the truth. */
  [
    "terms/page.tsx",
    `<p>{"The program is currently deployed to Solana "}<strong>{"devnet"}</strong>{" using test tokens. No real money is involved at present. Test tokens have no value, and devnet state can be reset or discarded by the network at any time without notice and without recovery."}</p>`,
    `<p>{"The program is deployed to Solana "}<strong>{"mainnet"}</strong>{" and pools hold real USDC. The money is real, the transactions are permanent, and there is no reset and no recovery. A mistake here costs what it appears to cost."}</p>`,
  ],

  // ── Privacy ──────────────────────────────────────────────────────────────
  [
    "privacy/page.tsx",
    `It is currently deployed to Solana devnet with test tokens only, so no real money is involved at the moment.`,
    `It is deployed to Solana mainnet and pools hold real USDC.`,
  ],

  // ── Risks ────────────────────────────────────────────────────────────────
  [
    "risk/page.tsx",
    `The program is deployed on Solana devnet at`,
    `The program is deployed on Solana mainnet at`,
  ],
  [
    "risk/page.tsx",
    `<h2>{"Today this is devnet, with test tokens"}</h2>`,
    `<h2>{"This is mainnet, with real money"}</h2>`,
  ],
  [
    "risk/page.tsx",
    `<p>{"At the moment the program is deployed to Solana devnet and pools use test tokens. Devnet money is not money. It has no value, you cannot sell it, and nothing you win on devnet is `,
    `<p>{"The program is deployed to Solana mainnet and pools use real USDC. Everything on this page applies in full, and it applies to money you cannot get back if it goes wrong. Nothing you lose here is `,
  ],

  // ── Playing responsibly ──────────────────────────────────────────────────
  [
    "play/page.tsx",
    `<p>{"The program is currently deployed to Solana devnet using test tokens, which have no value. Nothing on this page is urgent yet. It is here because it should be written before real `,
    `<p>{"The program is deployed to Solana mainnet and pools hold real USDC. Everything on this page is live and applies to you now. It was written before real `,
  ],
];

/* The RPC fallback. `clusterApiUrl("devnet")` as a default was right while the
 * product was a devnet product; on a mainnet build it is a silent way to point
 * a real wallet at the wrong chain if the env var is ever missing. */
const PROVIDERS = [
  "../src/components/Providers.tsx",
  "src/components/Providers.tsx",
];

let ok = 0;
const missed = [];

for (const [file, find, replace] of EDITS) {
  const p = path.join(DIR, file);
  const src = fs.readFileSync(p, "utf8");
  if (!src.includes(find)) {
    missed.push(`${file}: ${find.slice(0, 80)}`);
    continue;
  }
  fs.writeFileSync(p, src.split(find).join(replace));
  ok++;
}

/* The published addresses. The program id survives a redeploy because the same
 * keypair is used, but the program data account is new on every cluster and
 * the authority is worth restating from what the chain actually says rather
 * than from what anybody remembers. */
const riskPath = path.join(DIR, "risk/page.tsx");
let risk = fs.readFileSync(riskPath, "utf8");
const before = risk;
risk = risk
  .replace(/Adb5CFrY4vYiGQnTQ5qsaPPMUAWKyxwVAQtFHWcshjPa/g, PROGRAM_ID)
  .replace(/6dMgvhEnxv8QvHWffRTDcB5F5AUe3t9WGMUJLtUUzR4h/g, PROGRAM_DATA)
  .replace(/HoYb6BCszJUY89WhKt2itTpxtLHMJKuoEwXwQPdbhtVu/g, AUTHORITY)
  .replace(/solana program show ([1-9A-HJ-NP-Za-km-z]{32,44})/g, `solana program show ${PROGRAM_ID}`)
  .replace(/--url devnet/g, "--url mainnet-beta")
  .replace(/any Solana explorer set to devnet/g, "any Solana explorer");
if (risk !== before) ok++;
fs.writeFileSync(riskPath, risk);

for (const p of PROVIDERS) {
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, "utf8");
  const find = `process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("devnet")`;
  if (src.includes(find)) {
    fs.writeFileSync(
      p,
      src.split(find).join(`process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("mainnet-beta")`),
    );
    ok++;
  }
  break;
}

console.log(`  ${ok} edits applied`);
for (const m of missed) console.log(`  MISSED ${m}`);
if (missed.length) process.exitCode = 1;
