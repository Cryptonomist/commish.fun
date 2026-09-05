# Where Commish is, and what will bite you

Written for whoever picks this up next. `PROGRAM.md` explains the escrow and
`SETUP.md` explains installation; this file is the state of play, the decisions
that are load-bearing, and the things that have already cost hours.

## What actually works

Three instructions are driven end to end from a browser against a local
validator: `create_pool`, `join_pool`, `submit_pick`. Money moves, accounts are
created, a member holds a pick.

Everything else in the program is **implemented and tested, with no UI**:
`post_results`, `veto_results`, `finalize_week`, `settle_member`,
`advance_week`, `claim_pot`, `reclaim_dues`, and the four league instructions.
Nineteen LiteSVM tests cover them in `tests/workspace.ts` and `tests/veto.ts`.
Do not rewrite the program to add a screen — the program side is ahead of the
frontend, not behind it.

Not built at all, and refused at runtime rather than half-implemented:
`submit_pick_mask`, `draft_team`, `claim_weekly`, `close_pool`, and Merkle
verification against `results_root`.

## Three bugs were found and fixed. Do not reintroduce them.

**The veto only worked once.** A member's "already voted" marker lives on their
own account and `veto_results` cannot walk the member list to reset it. The
marker used to be the *week number*, so a commissioner who got vetoed could
re-post identical results and everyone who struck them down was refused with
`AlreadyVetoed`. It is now `Pool::veto_epoch`, which counts postings. This is
why `Pool` is 1,616 bytes and `Member` is 201 rather than 1,614 and 200.

**The platform fee was deducted and sent nowhere.** `advance_week` subtracted it
from the winners' pot and had no destination account, so it became unclaimable
vault residue. `Pool::fee_paid` had been declared since the first commit and
never written — that unused field was the tell. `AdvanceWeek` now takes
`fee_treasury_ata` and `token_program`, and the treasury token account must
exist before fees are switched on or pools cannot settle.

**A pool could be created that was impossible to play.** `post_results` needs
`lock + 3h` and `finalize_week` needs another `dispute_window_secs`. If the next
lock arrived first, `advance_week` never ran, week N+1 opened already locked,
everyone missed a pick, and the pool was dead — after the buy-ins were
collected. `create_pool` now requires
`gap > MIN_POST_DELAY_SECS + dispute_window_secs`, and fails with
`BadDisputeWindow` rather than `BadSchedule` so the message names the field to
change. Note the consequence: the 7-day maximum dispute window needs more than
171 hours between locks, which is longer than a real NFL week.

Also: `reclaim_dues` used to be able to refund a finalized prize out from under
its assignee in a league. It now refuses while any slot is Pending or Finalized,
and that block expires `PRIZE_CLAIM_GRACE_SECS` (30 days) after the refund
deadline so an unclaimed prize cannot strand the vault.

## Frontend decisions that are not style preferences

**`@solana/wallet-adapter-react-ui` is deliberately absent.** Its
`WalletMultiButton` and `WalletModalProvider` are built for React 18 and fail
silently under React 19 — the button sticks on "Connecting", no modal mounts,
nothing throws, nothing appears in the console. `src/components/WalletButton.tsx`
calls `useWallet()` directly instead. If you find yourself reaching for that
package, this is why it isn't there.

**Transactions are signed by the wallet and broadcast by the app.**
`sendTransaction` has the *wallet* broadcast through *its* configured RPC, not
the app's. Point the app at a local validator while Phantom is on devnet and the
transaction is built against one chain and submitted to another, surfacing as an
unhelpful "Unexpected error" from inside the extension. Every page therefore
calls `signTransaction` and then `connection.sendRawTransaction`.

**Every address is derived, never passed in.** The pool is a PDA of commissioner
and nonce, the vault is the pool's own ATA, a member is a PDA of pool and
wallet. The program re-derives all of it; `src/lib/program.ts` exists so the
honest client agrees. A client that could nominate a vault would make the
program's guarantee worthless to whoever clicked the button.

**Forms refuse before the wallet opens.** `src/lib/schedule.ts` duplicates the
program's timing arithmetic so `/pools/new` can reject a bad schedule with a
sentence instead of letting the chain reject it with a hex code. That
duplication is a liability — if `constants.rs` changes, that file is wrong and
the UI will cheerfully build pools the chain refuses.

**The pick grid reads `pick_week` before trusting `current_pick`.** The field is
not cleared between weeks until the member is settled, so reading it bare shows
last week's team as though it still counted.

## Running it locally, including the part that is not obvious

The program pins one USDC mint per cluster and rejects any other. On a local
validator you therefore need USDC at the devnet address
`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` — and cloning the real one gets
the address right but not the authority, so nobody can mint test dollars and
`join_pool` fails at the transfer with an empty balance.

`scripts/local-usdc.ts` writes a mint account at that address whose authority is
your own keypair. The validator loads it at genesis, which means a `--reset`,
which wipes the program, Config and every balance:

```bash
npx tsx scripts/local-usdc.ts dump

# in the validator's own terminal:
solana-test-validator --reset \
  --account 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU local-usdc.json

# then, every time, in this order:
anchor deploy --provider.cluster localnet
RPC_URL="http://localhost:8899" npx tsx scripts/init-config.ts
npx tsx scripts/local-usdc.ts mint <wallet> 500
solana airdrop 5 <wallet>
```

That mint is a counterfeit of a real one. The script refuses any RPC that is not
localhost and it must stay that way.

Build with `anchor build -- --features devnet` for anything but mainnet.
Without it the program compiles in the *mainnet* USDC address, which does not
exist on devnet or localnet, and every `create_pool` fails.

## Things that have already cost hours

- **Phantom must be on Localnet.** On any other network it cannot simulate,
  reports "You don't have enough SOL", and refuses. The balance it shows is from
  whichever chain it is pointed at, not the one the app is using.
- **`--reset` wipes wallet balances too.** After a reset the wallet genuinely has
  no SOL and no USDC; both need re-funding before anything works.
- **`npm run build` and `npm run dev` fight over `.next`.** Running them together
  produces `Cannot find module './331.js'`. `rm -rf .next` and run one at a time.
- **`solana-test-validator` uses `./test-ledger` relative to the current
  directory.** Run it from the wrong place and you silently get a fresh empty
  chain with no program and no Config.
- **The IDL must be vendored.** `src/idl/commish.json` is imported at build time
  and the program id is read from it. Copy it from `target/idl/` after every
  `anchor build`, or the client and the deployed binary drift apart.
- **Anchor's on-chain IDL upload fails** against the public devnet RPC. It is a
  separate step from the deploy, nothing in this app reads it, and it can be
  skipped.

## What I would build next

1. **The commissioner screen** — `post_results`, the dispute window counting
   down, and the veto button. This is where the trust story becomes visible
   rather than merely true, and it is the most compelling thing to demo.
2. **"Run the week"** — `finalize_week` → `settle_member` → `advance_week`. This
   is also what finally makes the pick grid strike out spent teams; the
   used-team logic is written but unexercised because nothing settles yet.
3. **`claim_pot`**, which closes the loop.
4. The three-wallet devnet run, end to end, before anything touches mainnet.

## Before mainnet, none of which has happened

The program has never been audited, never run on mainnet, and its upgrade
authority is a keypair in a file. `PROGRAM.md` has the full list; the short
version is that the upgrade authority needs to become a 2-of-3 multisig and then
be discarded, and that season one takes **zero** fee deliberately — charging
players on an unaudited escrow is not a trade worth making.
