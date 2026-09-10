/* THE NUMBERS THAT LEFT A REAL WALLET STUCK.
 *
 * The first mainnet pool could not be created from a wallet holding 2.06 USDC
 * and 0.0131 SOL. Nothing was broken: creating a pool costs 0.012951 SOL of
 * rent, which would have left 0.000107 — below the 0.000811 a wallet needs to
 * stay rent-exempt itself. The runtime refused, the client translated the
 * refusal to "Not enough SOL to pay rent for the pool and its vault", and the
 * wallet page said 0.01 SOL "covers it comfortably".
 *
 * Every number below is checked against `solana rent` run on mainnet, so the
 * advice this file guards cannot drift back to being confidently wrong.
 */

import { expect } from "chai";

import {
  LAMPORTS_PER_SOL,
  lamportsToCreate,
  lamportsToJoin,
  lamportsToPlay,
  rentFor,
  shortfall,
  solNeeded,
  solToPlay,
  topUpToPlay,
  WALLET_FLOOR,
} from "../src/lib/funding";

/* WHAT A SPONSORED FRIEND NEEDS TO USE THE SEAT THEY WERE GIVEN.
 *
 * The on-chain suite proves `sponsor_join` hands a seat to a wallet that has
 * never held anything. It also proves the consequence: that wallet cannot sign
 * a pick or receive a pot without some SOL. These pin the budget a sponsor is
 * offered to send alongside the seat. */
describe("what a sponsored member needs to play a season", () => {
  it("covers the wallet floor, a token account, every pick and a claim", () => {
    const perSig = 5_000;
    const expected =
      WALLET_FLOOR + rentFor(165) + 19 * perSig + /* headroom */ 20_000;
    expect(lamportsToPlay()).to.equal(expected);
  });

  /* THE FLOOR IS THE TRAP. A brand-new account cannot receive a transfer that
   * leaves it below its own rent-exempt minimum, so a "just send them a little"
   * top-up smaller than the floor would be refused by the chain outright. */
  it("never offers a first transfer smaller than the rent floor", () => {
    expect(topUpToPlay(0)).to.be.greaterThan(WALLET_FLOOR);
    expect(topUpToPlay(0)).to.equal(lamportsToPlay());
  });

  it("sends only the gap, and nothing when they already have enough", () => {
    const half = Math.floor(lamportsToPlay() / 2);
    expect(topUpToPlay(half)).to.equal(lamportsToPlay() - half);
    expect(topUpToPlay(lamportsToPlay())).to.equal(0);
    expect(topUpToPlay(lamportsToPlay() * 10)).to.equal(0);
  });

  it("does not trip over a negative or fractional balance", () => {
    expect(topUpToPlay(-1)).to.equal(lamportsToPlay());
    expect(topUpToPlay(1.9)).to.equal(lamportsToPlay() - 1);
  });

  it("is a few thousandths of a SOL, rounded up and never down", () => {
    expect(solToPlay()).to.equal(0.003);
    expect(solToPlay() * LAMPORTS_PER_SOL).to.be.at.least(lamportsToPlay());
  });
});

describe("what it costs to start", () => {
  describe("rent, against figures the chain actually returned", () => {
    /* `solana rent <bytes> --url https://api.mainnet-beta.solana.com` */
    const MEASURED: [number, number][] = [
      [0, 810_624],
      [165, 1_855_569],
      [209, 2_134_221],
      [1624, 11_095_416],
    ];

    for (const [bytes, lamports] of MEASURED) {
      it(`${bytes} bytes costs ${lamports} lamports`, () => {
        expect(rentFor(bytes)).to.equal(lamports);
      });
    }
  });

  describe("the wallet's own floor", () => {
    /* THE ONE THAT CAUSED THE FAILURE. A wallet is an account too, and a
     * transaction that would drop it below this is refused even though the
     * balance covers everything that was asked for. */
    it("is the rent on an empty account", () => {
      expect(WALLET_FLOOR).to.equal(810_624);
    });

    it("is included in the advice, or the advice is a trap", () => {
      const withoutFloor = lamportsToCreate() / LAMPORTS_PER_SOL;
      expect(solNeeded("create")).to.be.above(withoutFloor);
    });
  });

  describe("creating a pool", () => {
    it("costs the pool account plus its vault", () => {
      expect(lamportsToCreate()).to.equal(11_095_416 + 1_855_569);
    });

    /* THE REGRESSION THIS FILE EXISTS FOR. The wallet page used to say about
     * 0.01 SOL was comfortable. It is not enough to create a pool at all. */
    it("needs more than the 0.01 SOL the site used to advise", () => {
      expect(solNeeded("create")).to.be.above(0.01);
    });

    it("is advised as a round number a fee cannot break", () => {
      const advised = solNeeded("create") * LAMPORTS_PER_SOL;
      expect(advised).to.be.above(lamportsToCreate() + WALLET_FLOOR);
      // ...but not so generous it reads as a different order of magnitude.
      expect(solNeeded("create")).to.be.below(0.05);
    });
  });

  describe("joining a pool", () => {
    it("costs less than creating one", () => {
      expect(lamportsToJoin(true)).to.be.below(lamportsToCreate());
    });

    it("costs more for somebody who has never held the token", () => {
      expect(lamportsToJoin(false)).to.be.above(lamportsToJoin(true));
      expect(lamportsToJoin(false) - lamportsToJoin(true)).to.equal(1_855_569);
    });
  });

  describe("measuring a real wallet", () => {
    /* The wallet that actually failed, with the numbers it actually held. */
    it("says the wallet that failed was short of SOL, not USDC", () => {
      const s = shortfall({
        intent: "create",
        haveSol: 0.01305843,
        haveUsdc: 2.059166,
      });
      expect(s.ok, "this wallet could not create a pool").to.equal(false);
      expect(s.addSol, "it needed more SOL").to.be.above(0);
      expect(s.addUsdc, "its USDC was never the problem").to.equal(0);
    });

    it("clears the same wallet once it has been topped up", () => {
      const s = shortfall({ intent: "create", haveSol: 0.05, haveUsdc: 2.06 });
      expect(s.ok).to.equal(true);
      expect(s.addSol).to.equal(0);
    });

    /* BOTH CURRENCIES, ALWAYS. Reporting only the first failure sends someone
     * to buy dollars when the obstacle is half a cent of SOL, or the reverse. */
    it("reports a USDC gap and a SOL gap independently", () => {
      const s = shortfall({
        intent: "join",
        haveSol: 0,
        haveUsdc: 0,
        buyIn: 25,
      });
      expect(s.addSol).to.be.above(0);
      expect(s.addUsdc).to.equal(25);
    });

    it("asks for no USDC when creating, because creating moves none", () => {
      const s = shortfall({ intent: "create", haveSol: 0, haveUsdc: 0 });
      expect(s.needUsdc).to.equal(0);
      expect(s.addUsdc).to.equal(0);
    });

    it("never advises a top-up too small to survive a fee", () => {
      /* A wallet a hair under the line. Advising the exact difference would
       * put it back on the floor and fail again. */
      const need = solNeeded("create");
      const s = shortfall({ intent: "create", haveSol: need - 0.0000001, haveUsdc: 0 });
      expect(s.addSol).to.be.at.least(0.001);
    });
  });
});
