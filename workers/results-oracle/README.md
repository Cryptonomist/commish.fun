# commish results oracle

A scheduled Cloudflare Worker that posts a week's Survivor results when two
independent feeds agree, then cranks the week through to settlement. It holds
one key, named on chain by the admin, that the program allows to do exactly
one thing: propose results.

## What it removes, and what it does not

It removes the need for a commissioner to remember. In an ordinary week the
results are proposed within ten minutes of the last game ending, the dispute
window runs, the week is finalized, every member is settled, and the pool
advances or settles, with nobody doing anything.

It does not remove the commissioner. `post_results` is untouched. If the
Worker is down, the feeds disagree, or a game is postponed, the commissioner
posts by hand exactly as before. It does not remove the members' veto either:
what the oracle proposes waits out the same dispute window and can be thrown
out by the same strict majority.

It does not pay anyone. Winners still claim.

## The rule

A week is posted only when every feed reports every fixture as final and
every feed names the same winner for every game. Otherwise nothing is posted,
the reason is logged, and a disagreement is sent to the alert webhook. The
oracle never marks a push; a voided game is a human decision.

`MIN_AGREEING_FEEDS` is 2 and should stay 2. Setting it to 1 lets ESPN alone
decide money, which `src/lib/scores.ts` warns against in its first paragraph.

## The key

`ORACLE_KEYPAIR` is a keypair generated for this Worker and nothing else.
It is named on chain with `scripts/set-oracle.ts`, which refuses to name the
admin. If it leaks, the admin rotates it with the same script; the worst
that can happen in between is a proposal the members refuse.

It needs a little SOL for fees. A few transactions a week; 0.05 SOL lasts a
season.

## Secrets and variables

Secrets, set with `npx wrangler secret put <NAME>` and never committed:

| name | what |
| --- | --- |
| `HELIUS_API_KEY` | RPC. The hostname follows `HELIUS_CLUSTER`. |
| `ORACLE_KEYPAIR` | The 64-byte JSON array from the keypair file. |
| `APISPORTS_KEY` | api-sports.io, the second feed. |
| `ALERT_WEBHOOK` | Optional. A Discord or Slack incoming webhook. |

Variables live in `wrangler.jsonc` and are public. `HELIUS_CLUSTER` defaults
to `devnet` in the file and in the code; deploy to mainnet with
`npx wrangler deploy --var HELIUS_CLUSTER:mainnet` so a copied config cannot
sign against real money by default.

`ORACLE_FIXTURE` is a devnet-only stand-in for the feeds. The code refuses
it on mainnet regardless of what the variable says.

## Proving it

- `npm run test:web` at the repository root runs the decision logic against
  every shape of disagreement (`tests-web/oracle-decide.test.ts`).
- `npx tsx scripts/check-instruction-encoding.ts` compares the instruction
  this Worker builds, byte for byte, against the one the LiteSVM suite sends.
- `scripts/devnet-oracle-drill.ts` runs this Worker's real `runCycle`
  against devnet: creates a fastclock pool, joins two bots, waits for the
  lock, and watches the Worker post, finalize, settle and close the week.

## Operating it

```
npm run check     # bundle without deploying
npm run deploy    # deploy (add --var HELIUS_CLUSTER:mainnet for mainnet)
npm run tail      # watch ticks; every tick logs one JSON summary
```

A tick that finds nothing to do logs `actions: []` and a `skip` line per
pool with the reason. That is the normal state for six days of every week.
