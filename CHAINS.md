# Running on more than one chain

A plan, not a change. Nothing in here is built.

**The recommendation is: not yet, and probably not both.** Robinhood Chain is
real, live and permissionless, and the distribution argument for it is genuine.
But a second chain means a second escrow holding other people's money, and two
implementations of that is how one of them ends up wrong.

---

## 1. What Robinhood Chain actually is

Checked September 2026, because this moves fast and any of it can be stale by
the time you read it.

| | |
|---|---|
| Stack | Arbitrum Orbit / Nitro, an Ethereum L2 |
| Status | Public mainnet since 1 July 2026 |
| Access | Permissionless — anyone deploys |
| Contracts | Solidity or Vyper, unmodified |
| Chain ID | 4663 |
| Gas | ETH |
| Stablecoin | **USDG**, the Paxos-issued Global Dollar |

It is not a walled garden and it is not vapour: roughly 13,900 contracts went up
in the first week, with Uniswap, Alchemy, BitGo and Chainlink there on day one.

## 2. Nothing ports

The program is Anchor and Rust against Solana's account model: PDAs, rent,
account-size pinning, SPL token CPI, `Account<'info, T>`. EVM is contracts,
storage slots, mappings, ERC-20 and `msg.sender`. There is no path from one to
the other that is not a rewrite.

The *design* ports completely, and the design is the hard-won part:

- the four named ways money leaves a vault, and no fifth
- `veto_epoch` keyed on postings rather than weeks, which is the bug that
  disenfranchised a majority
- a strict majority clears a posting; a re-post is a fresh vote
- the timing floors, and the rule that a week must outlast its own dispute
  window
- the deadman refund, with the first caller fixing everybody's share
- `rules::survives` as a pure function, so a mode is one arm and nothing else

Those are chain-agnostic and worth writing down as a specification independent of
either implementation. The Rust is not.

**A second implementation is a second audit surface, a second set of bugs, and
two escrows to keep in step forever.** That is the whole cost, and it is not
mostly engineering time.

## 3. The stablecoin is the sharp edge

This is the part that would bite hardest and it is easy to miss.

`CANONICAL_USDC` is pinned in the program per cluster, checked at pool creation,
and the reason is written in `constants.rs`: a pool that accepts whatever mint
the commissioner passed accepts a mint the commissioner minted himself. That
check is one comparison and it is the whole defence.

On Robinhood Chain the stablecoin is **USDG**, issued by Paxos, not USDC issued
by Circle. Bridging USDC in delivers USDG out.

So a Robinhood Chain deployment is not "the same product on another chain". It
is denominated in a different dollar, from a different issuer, with a different
redemption story. Every string in the site that says USDC — the create form, the
landing copy, the FAQ, the README, the pool page — is wrong there. That is a
content problem as much as a code one, and the honest fix is that the
denomination becomes a property of the deployment rather than a word baked into
the copy.

Gas differs too: members need ETH on Robinhood Chain where they need SOL on
Solana. Same class of onboarding friction, different asset.

## 4. What gets easier, and what gets harder

Easier on EVM: no account-size pinning, no rent, no PDA derivation, no Borsh
encoding to verify — the whole class of problem that
`scripts/check-instruction-encoding.ts` exists to catch simply does not arise.

Harder on EVM: reentrancy, which Solana's model mostly sidesteps and which every
one of the four payout paths would need guarding. Upgradeability becomes a
governance question with the same shape as the upgrade-authority problem in
PROGRAM.md, but with more ways to get it wrong. And gas metering punishes loops,
so settling a hundred members has to stay the same permissionless crank it is
now, called repeatedly, rather than becoming one transaction.

## 5. The recommendation

**Do not dual-run.** If Robinhood's distribution is worth more than Solana's
ecosystem, move. If it is not, stay. Running both means every rule change lands
twice, and the day they diverge is the day one of them is holding money under
rules nobody has read.

**Do not decide yet.** There is not a single real pool on any chain. Deciding
which chain has better distribution before anyone has used the product is
guessing with extra steps.

**Do keep the option cheap**, which costs nothing because it is already true.
The chain-specific surface is `lib/program.ts` and the wallet adapter, and
nothing else: the components, the rules mirrors, the schedule maths, the brand
and every line of copy are chain-agnostic today. Keeping that boundary clean is
the entire preparation. Building an abstraction layer now for a chain you may
never ship on would be worse than doing nothing.

## 6. If you decide to go anyway

Rough order, and it is a bigger job than the college plan:

1. **Write the spec first**, from the list in §2, as a document that neither
   implementation owns. Both then have something to be checked against.
2. **Port the rules**, which is the easy half: `survives`, the fee cap, the week
   gap. Pure functions with tests that transfer almost line for line.
3. **Rebuild the escrow** in Solidity against that spec — the four paths, the
   veto epoch, the timing floors, the deadman. This is the part that holds money
   and the part that needs an audit.
4. **Denomination and copy**, so USDG versus USDC is deployment configuration
   rather than a hardcoded word.
5. **A second client half**: wagmi or viem in place of the wallet adapter, ABI
   encoding in place of Borsh, and the encoding check retargeted.

Six weeks of real work and an audit before it should hold a dollar. Compare that
against what the same six weeks would buy on the chain you are already on.

---

Sources checked September 2026: Robinhood Chain
[documentation](https://docs.robinhood.com/chain/),
[mainnet coverage](https://cryptobriefing.com/robinhood-chain-13900-contracts-deployed-mainnet/),
[architecture](https://eco.com/support/en/articles/15859739-what-is-robinhood-chain-inside-robinhood-s-arbitrum-l2),
[bridging and USDG](https://across.to/blog/bridge-to-robinhood-chain-with-across).
