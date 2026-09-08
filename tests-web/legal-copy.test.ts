/* THE LEGAL PAGES, CHECKED AGAINST WHAT THE PROGRAM ACTUALLY DOES.
 *
 * On the day this product went to mainnet, the Terms said "season one charges
 * none" while the chain charged three per cent, and the same document said
 * "three per cent, capped at 50 USDC" four paragraphs away. It contradicted
 * itself about money, on a live site, and nothing noticed — because the only
 * automated check on this copy was the cutover script's grep for the word
 * "devnet", and neither sentence contains it.
 *
 * A grep for last season's wrong word cannot find next season's. So this reads
 * the numbers out of the copy and compares them to the numbers the deploy
 * writes on chain, which is the pairing that actually has to hold.
 *
 * The source of truth is scripts/init-config.ts, because that is the file
 * whose values are sent to init_config and end up in the Config account. It
 * was verified against the deployed account by hand: default_fee_bps 300,
 * default_fee_cap 50000000.
 */

import { expect } from "chai";
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const PAGES = {
  terms: "src/app/terms/page.tsx",
  privacy: "src/app/privacy/page.tsx",
  risk: "src/app/risk/page.tsx",
  play: "src/app/play/page.tsx",
} as const;

const config = read("scripts/init-config.ts");
const FEE_BPS = Number(/const FEE_BPS = (\d+)/.exec(config)?.[1]);
const FEE_CAP = Number(
  /const FEE_CAP = ([\d_]+)/.exec(config)?.[1]?.replace(/_/g, ""),
);

describe("the legal copy says what the program does", () => {
  it("reads the fee the deploy actually writes", () => {
    expect(FEE_BPS, "could not read FEE_BPS from init-config.ts").to.be.a("number");
    expect(FEE_CAP, "could not read FEE_CAP from init-config.ts").to.be.a("number");
    expect(Number.isNaN(FEE_BPS)).to.equal(false);
    expect(Number.isNaN(FEE_CAP)).to.equal(false);
  });

  describe("no page claims the fee is zero", () => {
    /* THE SENTENCE THAT SHIPPED. Any of these next to a nonzero fee is the
     * contradiction that got through, in the words it got through in. */
    const DENIALS = [
      /season one charges none/i,
      /we charge no fee/i,
      /charges? no fee\b/i,
      /no fee is charged\b/i,
      /fee[- ]free/i,
    ];

    for (const [name, path] of Object.entries(PAGES)) {
      it(`${name} does not deny a fee that is being charged`, () => {
        if (FEE_BPS === 0) return; // a zero-fee season may say so
        const text = read(path);
        for (const d of DENIALS) {
          const hit = d.exec(text);
          expect(
            hit,
            `${path} says "${hit?.[0]}" while FEE_BPS is ${FEE_BPS}`,
          ).to.equal(null);
        }
      });
    }
  });

  describe("the figures in the prose are the figures on chain", () => {
    /* Terms and Risks both quote the rate and the ceiling. If either number
     * moves in init-config.ts, the prose has to move with it. */
    const quoting = [PAGES.terms, PAGES.risk];

    it("quotes the fee rate as a percentage that matches FEE_BPS", () => {
      const pct = FEE_BPS / 100;
      const words: Record<number, RegExp> = {
        3: /three per cent/i,
        2: /two per cent/i,
        5: /five per cent/i,
      };
      const pattern = words[pct] ?? new RegExp(`${pct}\\s*(%|per cent)`, "i");
      for (const p of quoting) {
        expect(pattern.test(read(p)), `${p} does not state a ${pct}% fee`).to.equal(
          true,
        );
      }
    });

    it("quotes the cap as the USDC amount FEE_CAP encodes", () => {
      const usdc = FEE_CAP / 1e6;
      const pattern = new RegExp(`${usdc}\\s*USDC`, "i");
      for (const p of quoting) {
        expect(
          pattern.test(read(p)),
          `${p} does not state a ${usdc} USDC cap`,
        ).to.equal(true);
      }
    });
  });

  describe("nothing still speaks of mainnet as a future event", () => {
    /* The cutover rewrites six devnet claims and greps for the word "devnet"
     * afterwards. These sentences never contained it, so they survived a
     * cutover whose whole job was to remove exactly this idea. */
    const FUTURE = [
      /if and when (the program is deployed|we deploy)/i,
      /will be deployed to (solana )?mainnet/i,
      /not yet (deployed|live) on mainnet/i,
      /once we (deploy|go live)/i,
    ];

    for (const [name, path] of Object.entries(PAGES)) {
      it(`${name} does not describe the deploy as still to come`, () => {
        const text = read(path);
        for (const f of FUTURE) {
          const hit = f.exec(text);
          expect(hit, `${path} says "${hit?.[0]}"`).to.equal(null);
        }
      });
    }
  });

  describe("the devnet claims the cutover removes stay removed", () => {
    /* The same post-condition mainnet-cutover.sh enforces, kept here so it is
     * checked on every run rather than only during a cutover nobody runs
     * twice. */
    const FORBIDDEN = [
      /devnet/i,
      /test tokens?/i,
      /\brehearsal\b/i,
      /no real money/i,
    ];

    for (const [name, path] of Object.entries(PAGES)) {
      it(`${name} does not tell the reader the money is not real`, () => {
        const text = read(path);
        for (const f of FORBIDDEN) {
          const hit = f.exec(text);
          expect(hit, `${path} says "${hit?.[0]}"`).to.equal(null);
        }
      });
    }
  });

  describe("every page carries a date", () => {
    for (const [name, path] of Object.entries(PAGES)) {
      it(`${name} states when it was last updated`, () => {
        expect(/updated=\{"[^"]+"\}/.test(read(path)), `${path}`).to.equal(true);
      });
    }
  });
});
