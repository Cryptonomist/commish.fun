/* The second feed's parser, pinned against api-sports.io's documented shape.
 *
 * There is no captured response yet: week one has not been played and the
 * account is new. So the sample below is the schema as documented, and the
 * tests say what the parser must do with each state it can be in. The first
 * real week will confirm the shape; until then a mismatch fails closed, because
 * a game the parser cannot read is a game that is not final, and a week with a
 * game that is not final is never posted.
 */

import { expect } from "chai";

import { TEAMS } from "@/lib/nfl";
import {
  abbrFromFullName,
  parseApiSports,
} from "../workers/results-oracle/src/feeds";

const game = (
  home: string,
  away: string,
  status: string,
  hs: number | null,
  as: number | null,
) => ({
  game: {
    id: 1,
    stage: "Regular Season",
    week: "Week 1",
    date: { timestamp: 1788999600 },
    status: { short: status, long: status },
  },
  teams: { home: { id: 1, name: home }, away: { id: 2, name: away } },
  scores: { home: { total: hs }, away: { total: as } },
});

describe("the api-sports parser", () => {
  it("reads a finished game with its winner", () => {
    const [g] = parseApiSports({
      response: [game("Seattle Seahawks", "New England Patriots", "FT", 24, 17)],
    });
    expect(g).to.deep.equal({ home: "SEA", away: "NE", final: true, winner: "home" });
  });

  it("treats a game finished after overtime as final", () => {
    const [g] = parseApiSports({
      response: [game("Los Angeles Rams", "San Francisco 49ers", "AOT", 20, 23)],
    });
    expect(g.final).to.equal(true);
    expect(g.winner).to.equal("away");
  });

  it("reports a tie as a tie, not as nobody", () => {
    const [g] = parseApiSports({
      response: [game("Cincinnati Bengals", "Tampa Bay Buccaneers", "FT", 20, 20)],
    });
    expect(g.final).to.equal(true);
    expect(g.winner).to.equal("tie");
  });

  it("leaves an unplayed game not final, whatever the scores field says", () => {
    const [g] = parseApiSports({
      response: [game("Detroit Lions", "New Orleans Saints", "NS", null, null)],
    });
    expect(g.final).to.equal(false);
    expect(g.winner).to.equal(null);
  });

  it("leaves a game in progress not final even with a score", () => {
    const [g] = parseApiSports({
      response: [game("Detroit Lions", "New Orleans Saints", "Q3", 14, 10)],
    });
    expect(g.final).to.equal(false);
  });

  it("is not final when the status is final but a score is missing", () => {
    /* A feed that says FT with no numbers is a feed mid-update. Nothing about
     * that game can be trusted, so it blocks the week rather than deciding
     * it. */
    const [g] = parseApiSports({
      response: [game("Detroit Lions", "New Orleans Saints", "FT", 24, null)],
    });
    expect(g.final).to.equal(false);
  });

  it("skips a game whose team it cannot name, rather than guessing", () => {
    const out = parseApiSports({
      response: [
        game("Seattle Seahawks", "New England Patriots", "FT", 24, 17),
        game("London Monarchs", "Frankfurt Galaxy", "FT", 1, 0),
      ],
    });
    expect(out.map((g) => g.home)).to.deep.equal(["SEA"]);
  });

  it("returns nothing for a body that is not the documented shape", () => {
    expect(parseApiSports(null)).to.deep.equal([]);
    expect(parseApiSports({ errors: ["quota"] })).to.deep.equal([]);
    expect(parseApiSports({ response: "nope" })).to.deep.equal([]);
  });
});

describe("full team names, as a feed writes them", () => {
  it("map every club to the abbreviation the chain uses", () => {
    for (const t of TEAMS) {
      expect(abbrFromFullName(`${t.city} ${t.name}`), `${t.city} ${t.name}`).to.equal(t.abbr);
    }
  });

  it("forgive spacing and case, and nothing else", () => {
    expect(abbrFromFullName("  washington   COMMANDERS ")).to.equal("WAS");
    expect(abbrFromFullName("Washington")).to.equal(null);
    expect(abbrFromFullName("Commanders")).to.equal(null);
  });
});
