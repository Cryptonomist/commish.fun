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
  /* WHOLE PARAGRAPH, NOT A PREFIX, and this one nearly shipped the worst
   * sentence on the site. The find string used to stop mid-sentence at
   * "nothing you win on devnet is " and the replacement stopped at "Nothing you
   * lose here is ", which left the original tail welded on. The result, under a
   * heading this same script rewrites to "This is mainnet, with real money",
   * read: "Nothing you lose here is worth anything. Devnet is a test network:
   * it can be reset or wiped ... Treat anything you do today as a rehearsal."
   *
   * On a page about real money that is not a typo, it is the exact inverse of
   * the truth, and the script reported "8 edits applied" while doing it. */
  [
    "risk/page.tsx",
    `<p>{"At the moment the program is deployed to Solana devnet and pools use test tokens. Devnet money is not money. It has no value, you cannot sell it, and nothing you win on devnet is worth anything. Devnet is a test network: it can be reset or wiped, and it is not intended to be reliable or permanent. Treat anything you do today as a rehearsal."}</p>`,
    `<p>{"The program is deployed to Solana mainnet and pools hold real USDC. The money is real, the transactions are final, and nothing on this page is hypothetical any more. Everything above applies in full, and it applies to money you cannot get back if it goes wrong."}</p>`,
  ],

  // ── Playing responsibly ──────────────────────────────────────────────────
  /* Also a whole paragraph, for a smaller version of the same fault: replacing
   * the head left "It was written before real money is involved rather than
   * after", which clashes its own tenses and is no longer true anyway, since on
   * mainnet the money is involved. */
  [
    "play/page.tsx",
    `<p>{"The program is currently deployed to Solana devnet using test tokens, which have no value. Nothing on this page is urgent yet. It is here because it should be written before real money is involved rather than after, and everything below applies from the moment it is."}</p>`,
    `<p>{"The program is deployed to Solana mainnet and pools hold real USDC. Everything below applies to you now, and applies to money you cannot get back. It was written before there was any real money in the product rather than after, which is the order these things should be written in."}</p>`,
  ],
];

/* WHAT MUST NOT SURVIVE, checked after the edits rather than trusted from
 * them. Every failure above was a partial replacement that still reported
 * success: the count of applied edits says how many `find` strings matched,
 * which is not the same claim as "the page no longer tells the reader their
 * money is fake". This asserts the second thing.
 *
 * Scoped to the four legal pages. The wallet page needs no entry because it
 * already gates its devnet notice on IS_MAINNET (wallet/page.tsx:328) and the
 * whole section disappears on its own. */
const FORBIDDEN = [
  /devnet/i,
  /test tokens?/i,
  /\brehearsal\b/i,
  /no real money/i,
  /not money\b(?!\s+you)/i,
];

const LEGAL_PAGES = [
  "terms/page.tsx",
  "privacy/page.tsx",
  "risk/page.tsx",
  "play/page.tsx",
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

/* README, which no cutover step touched. It is the first thing anybody reads
 * about the project and it opened with a bold "Devnet only." */
const README = "README.md";
if (fs.existsSync(README)) {
  const src = fs.readFileSync(README, "utf8");
  /* MATCHED AS A REGEX BECAUSE THIS BANNER WRAPS, and a checkout on Windows
   * does not necessarily hand you the newline you wrote. Every other edit in
   * this file is a single line and cannot notice; this one spans two, and a
   * literal "\n" between them silently fails to match a CRLF working tree —
   * which is what a `git checkout` produces here, `file` reporting "CRLF line
   * terminators" on this very README. It failed closed rather than quietly, so
   * nothing was at risk, but "MISSED" on deploy day over a line ending is a
   * bad five minutes. \s+ spans whatever the checkout used. */
  const find =
    /\*\*Devnet only\.\*\*\s+The program is currently deployed to Solana devnet using test\s+tokens, which have no value\. Nothing below is holding real money yet\./;
  if (find.test(src)) {
    fs.writeFileSync(
      README,
      src.replace(
        find,
        "**Live on mainnet.** The program is deployed to Solana mainnet and pools\nhold real USDC. It has not been audited.",
      ),
    );
    ok++;
  } else {
    missed.push("README.md: the devnet banner");
  }
}

console.log(`  ${ok} edits applied`);
for (const m of missed) console.log(`  MISSED ${m}`);

/* THE POST-CONDITION. Counting matched `find` strings only proves the script
 * found what it went looking for, which is exactly what it did on the day it
 * left "Treat anything you do today as a rehearsal" on the risks page and
 * reported eight edits applied. */
const survived = [];
for (const file of LEGAL_PAGES) {
  const src = fs.readFileSync(path.join(DIR, file), "utf8");
  for (const line of src.split("\n")) {
    for (const rx of FORBIDDEN) {
      if (rx.test(line)) survived.push(`${file}: ${line.trim().slice(0, 120)}`);
    }
  }
}

if (survived.length) {
  console.error("\n  REFUSING: these still tell the reader the money is not real\n");
  for (const s of survived) console.error(`  ${s}`);
  console.error("\n  Fix the EDITS table in this script. Do not ship this.\n");
  process.exitCode = 1;
} else {
  console.log("  post-check: no devnet or test-token claim left in the legal copy");
}

if (missed.length) process.exitCode = 1;
