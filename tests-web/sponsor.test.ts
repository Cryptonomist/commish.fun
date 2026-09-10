/* The sponsored seat: one person pays, somebody else owns it.
 *
 * WHY THIS FILE EXISTS AT ALL. `sponsor_join` has been on mainnet since the
 * first deploy and until now nothing anywhere called it — no browser builder,
 * no LiteSVM test, no script. An instruction with two different wallets in it,
 * where one signs and pays and the other receives the seat, is exactly the
 * shape that goes wrong silently: swap them and the transaction still builds,
 * still signs, and buys the commissioner a second seat with somebody else's
 * name on it.
 *
 * So these pin the two facts that cannot be recovered from afterwards. The
 * Member PDA is derived from the SPONSORED wallet, and the USDC comes from the
 * SIGNER's token account. Everything else about the instruction is shape, and
 * the shape is checked against the vendored IDL rather than against a copy of
 * it typed out here, so a program change that reorders accounts fails this
 * suite instead of failing a commissioner.
 *
 * This is not a substitute for exercising the instruction against the program.
 * It proves the browser builds what the IDL describes; it does not prove the
 * program does what we think when it arrives.
 */

import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";

import {
  ataFor,
  buildSponsorJoin,
  memberPda,
  PROGRAM_ID,
  USDC_MINT,
  MAX_DISPLAY_NAME,
} from "@/lib/program";
import idl from "@/idl/commish.json";

const POOL = new PublicKey("11111111111111111111111111111112");
const COMMISSIONER = new PublicKey("So11111111111111111111111111111111111111112");
const FRIEND = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");

const plan = () =>
  buildSponsorJoin({
    pool: POOL,
    wallet: FRIEND,
    commissioner: COMMISSIONER,
    displayName: "Dave",
  });

/** The instruction as the vendored IDL describes it. */
const spec = (idl as {
  instructions: {
    name: string;
    discriminator: number[];
    accounts: { name: string; signer?: boolean; writable?: boolean }[];
  }[];
}).instructions.find((i) => i.name === "sponsor_join")!;

describe("sponsoring a seat", () => {
  it("is an instruction the vendored IDL actually has", () => {
    expect(spec, "sponsor_join missing from the IDL").to.not.equal(undefined);
    expect(spec.accounts).to.have.length(7);
  });

  it("sends it to this program with the IDL's own discriminator", () => {
    const { instruction } = plan();
    expect(instruction.programId.equals(PROGRAM_ID)).to.equal(true);
    expect([...instruction.data.subarray(0, 8)]).to.deep.equal(spec.discriminator);
  });

  /* Account ORDER is positional on Solana: a list in the wrong order is a
   * different instruction that still encodes. Checked against the IDL so a
   * program change has to break this rather than a pool. */
  it("lists the accounts in the order the IDL declares", () => {
    const { instruction } = plan();
    expect(instruction.keys).to.have.length(spec.accounts.length);
    spec.accounts.forEach((want, i) => {
      const got = instruction.keys[i];
      expect(!!got.isSigner, `${want.name} signer`).to.equal(!!want.signer);
      expect(!!got.isWritable, `${want.name} writable`).to.equal(!!want.writable);
    });
  });

  /* THE ONE THAT MATTERS. Two wallets, and which is which cannot be recovered
   * from once the money has moved. */
  it("gives the seat to the friend and takes the money from the commissioner", () => {
    const { instruction, member, payerAta, vault } = plan();

    // The seat is the friend's, derived from their wallet and not the signer's.
    expect(member.equals(memberPda(POOL, FRIEND))).to.equal(true);
    expect(member.equals(memberPda(POOL, COMMISSIONER))).to.equal(false);

    // The USDC leaves the commissioner's token account, not the friend's.
    expect(payerAta.equals(ataFor(COMMISSIONER, USDC_MINT))).to.equal(true);
    expect(payerAta.equals(ataFor(FRIEND, USDC_MINT))).to.equal(false);

    // And it lands in the pool's vault, which no individual controls.
    expect(vault.equals(ataFor(POOL, USDC_MINT))).to.equal(true);

    // Only the commissioner signs. The friend need not exist yet as a wallet
    // that has ever transacted, which is the entire point of the instruction.
    const signers = instruction.keys.filter((k) => k.isSigner);
    expect(signers).to.have.length(1);
    expect(signers[0].pubkey.equals(COMMISSIONER)).to.equal(true);
    expect(
      instruction.keys.some((k) => k.pubkey.equals(FRIEND) && k.isSigner),
    ).to.equal(false);
  });

  it("carries the friend's wallet in the data, not just in the accounts", () => {
    const { instruction } = plan();
    // The pubkey argument follows the eight-byte discriminator.
    const carried = new PublicKey(instruction.data.subarray(8, 40));
    expect(carried.equals(FRIEND)).to.equal(true);
  });

  /* Sponsoring yourself is `join_pool` with extra steps, and the program would
   * refuse it as an already-initialised account AFTER the wallet popup. */
  it("refuses to sponsor the signer's own wallet", () => {
    expect(() =>
      buildSponsorJoin({
        pool: POOL,
        wallet: COMMISSIONER,
        commissioner: COMMISSIONER,
        displayName: "Me",
      }),
    ).to.throw(/your own wallet/i);
  });

  it("refuses a display name the account cannot hold", () => {
    expect(() =>
      buildSponsorJoin({
        pool: POOL,
        wallet: FRIEND,
        commissioner: COMMISSIONER,
        displayName: "x".repeat(MAX_DISPLAY_NAME + 1),
      }),
    ).to.throw(/longer than/i);
    // The boundary itself is allowed.
    expect(() =>
      buildSponsorJoin({
        pool: POOL,
        wallet: FRIEND,
        commissioner: COMMISSIONER,
        displayName: "x".repeat(MAX_DISPLAY_NAME),
      }),
    ).to.not.throw();
  });
});
