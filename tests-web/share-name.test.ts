/* The pool name goes into a message somebody forwards to their friends.
 *
 * Chat apps preview the FIRST link they find in a message. A pool called
 * "Bonus at evil.example" would therefore put somebody else's URL, and
 * somebody else's preview card, at the front of an invitation that appears to
 * come from a friend. The name is attacker-chosen and only 32 bytes, so there
 * is nothing worth preserving that stripping links would damage.
 *
 * These pin that. An adversarial review split on whether it mattered; the fix
 * costs one regex and the failure is a phishing primitive handed out by our
 * own share button, so it is pinned rather than argued about.
 */

import { expect } from "chai";

/* Copied deliberately rather than imported. SharePool.tsx is a client
 * component whose module scope reads process.env and touches React; importing
 * it here would drag all of that into a test that is about one pure string
 * function. If the two drift, the test below stops describing the shipped
 * behaviour, so the rule is that this block and `safeName` change together. */
const safeName = (raw: string): string =>
  raw
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\b[a-z0-9-]+\.(com|net|org|io|fun|xyz|co|app|gg|link|me|to)\b\S*/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "our pool";

describe("safeName", () => {
  it("strips a full URL out of a pool name", () => {
    expect(safeName("Sunday Crew https://evil.example/free")).to.equal(
      "Sunday Crew",
    );
    expect(safeName("http://evil.example Sunday Crew")).to.equal("Sunday Crew");
  });

  it("strips a bare domain, which is what actually previews in chat apps", () => {
    expect(safeName("Free money evil.com")).to.equal("Free money");
    expect(safeName("claim at phishy.link/x now")).to.equal("claim at now");
    expect(safeName("www.evil.example wins")).to.equal("wins");
  });

  it("survives a name that is nothing but a link", () => {
    // Never returns an empty string, because the message reads
    // `pool "" on Commish` and looks broken rather than sanitised.
    expect(safeName("https://evil.example")).to.equal("our pool");
    expect(safeName("   ")).to.equal("our pool");
  });

  it("leaves an ordinary pool name completely alone", () => {
    for (const name of [
      "Sunday Crew",
      "The Office Pool 2026",
      "Dave's Revenge",
      "Week 1 Survivors",
      "beers & bragging rights",
    ]) {
      expect(safeName(name)).to.equal(name);
    }
  });

  it("collapses the whitespace a strip leaves behind", () => {
    expect(safeName("Sunday   evil.com   Crew")).to.equal("Sunday Crew");
  });

  it("is not fooled by case or by a trailing path", () => {
    expect(safeName("HTTPS://EVIL.EXAMPLE/x join us")).to.equal("join us");
    expect(safeName("join EVIL.COM/pool now")).to.equal("join now");
  });
});
