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

The oracle never argues with the members. If a majority vetoes what it
posted, it does not post that week again: the feeds have not changed, so it
would only propose the same result every ten minutes. From a veto onward the
week belongs to the commissioner, and the Worker says so once an hour until
somebody acts. It knows a veto happened without keeping any state of its own:
a veto clears `pending_week` but leaves `pending_posted_ts`, so "nothing is
pending, yet something was posted after this week's lock" has one meaning.

ESPN is the gate. It is unmetered and is polled every tick; api-sports gives
a hundred calls a day for free, and a week takes four days to play. So the
second feed is asked only once ESPN reports every game final, and even then
only every tick for six hours after the week's last kickoff and once an hour
after that. Normal case: one or two calls a week. Worst case, with the second
feed lagging all day: under sixty. The agreement rule is exactly as strict
as before.

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
| `TELEGRAM_BOT_TOKEN` | Alerts. A bot's token from @BotFather. |
| `TELEGRAM_CHAT_ID` | Alerts. The chat the bot posts into. |
| `ALERT_WEBHOOK` | Optional. A Discord or Slack incoming webhook, alongside or instead. |

## Alerts

The Worker speaks only when there is something to say: a week it posted, a
pool it settled, a disagreement between the feeds, a week the members struck
down, or an error. A tick that skipped every pool, which is most ticks, says
nothing.

Telegram, in three steps:

1. Message **@BotFather** on Telegram, send `/newbot`, follow the prompts. It
   answers with a token that looks like `123456789:AAF...`. That is
   `TELEGRAM_BOT_TOKEN`.
2. Open a chat with your new bot and send it any message. Then fetch
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser: the reply
   contains `"chat":{"id":...}`. That number is `TELEGRAM_CHAT_ID`. (For a
   group, add the bot to the group first; group ids are negative.)
3. Prove the pair works before trusting it:
   ```
   curl -s -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
     -d chat_id=<CHAT_ID> -d text="commish results oracle: test"
   ```
   Then `npx wrangler secret put TELEGRAM_BOT_TOKEN` and
   `npx wrangler secret put TELEGRAM_CHAT_ID`.

Variables live in `wrangler.jsonc` and are public. `HELIUS_CLUSTER` defaults
to `devnet` in the file and in the code; deploy to mainnet with
`npx wrangler deploy --var HELIUS_CLUSTER:mainnet` so a copied config cannot
sign against real money by default.

On mainnet the RPC endpoint is derived from `HELIUS_API_KEY` and nothing else:
`RPC_URL` is honoured on devnet only, so a devnet URL left in a variable
cannot redirect a worker that believes it is on mainnet. A provider key is
not optional in any case: Solana's public endpoints answer workerd's fetch
with a 403 ("your IP or provider is blocked"), with or without a User-Agent,
while the Node drill from the same machine and address is fine. They are
classifying the client, not the caller. The local runtime test
(`wrangler dev --test-scheduled`) therefore proves the bundle, the runtime
and the cron entry point down to the first RPC call, and needs a Helius key
in `.dev.vars` to go further.

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
