<div align="center">

<img src="brand/appicon.png" width="120" alt="Commish" />

# COMMISH

**Your Survivor pool, out of that one guy's Venmo.**

Buy-ins escrowed on-chain. Picks locked at kickoff. Last one standing takes the pot.

**Live on mainnet.** The program is deployed to Solana mainnet and pools
hold real USDC. It has been through a written security review, not a
third-party audit.

[commish.fun](https://commish.fun) · Built on Solana · NFL Survivor pools and league dues

</div>

---

## The problem

Every NFL Survivor pool works the same way: ten to a hundred people send their buy-in to one guy's Venmo, and then everyone trusts that guy for eighteen weeks. He holds the pot. He tracks the picks. He decides disputes. He pays out, eventually, if nothing goes wrong. Pools move thousands of dollars a season this way, secured by nothing but friendship.

Commish keeps the commissioner and removes the custody.

## How it works

1. **Create a pool.** Set the buy-in (USDC) and share a join link.
2. **Join.** Each member pays the buy-in into an on-chain escrow vault that no individual can touch, the commissioner included.
3. **Pick weekly.** One NFL team to win, each week. Picks lock at the week's first kickoff and are recorded on-chain, so nobody can claim on Monday that they definitely picked the Bills.
4. **Survive.** Your team wins, you advance. Loses or ties, you're out. Each team usable once per season.
5. **Get paid.** Last member standing claims the pot straight out of the vault, with their own signature and nobody else's. No chasing the commissioner, no "I'll get to it."

## The trust model, honestly

Weekly results are proposed by a results oracle — a scheduled Worker that posts a week only when two independent scoreboards agree on every game — or by the commissioner by hand, and either way they sit in a dispute window where members can veto by majority. The oracle key can propose results and nothing else; it cannot move a dollar. What the chain removes is every way commissioner trust historically fails:

| The commissioner cannot... | Because... |
|---|---|
| Spend the pot | The vault only moves through payout logic |
| Change the rules mid-season | Rules are fixed at pool creation |
| Slow-pay the winner | Settlement is a permissionless crank anyone can fire |
| Forget to post results | The oracle proposes the week when two independent scoreboards agree |
| Quietly post fake results | A dispute window lets members veto results anyone can verify on any scoreboard |
| Strand the money | A deadman switch lets members reclaim their share if the pool is ever abandoned |

Money leaves a vault by four paths and there is no fifth: a winner's claim, a
prize-slot claim in a league, a pro-rata refund after the refund deadline, and
the platform fee to the treasury recorded on the pool when it is created. That
fee is three per cent of the pot capped at 50 USDC on a Survivor or Loser
pool with a buy-in, and a league records no fee at all. There is no admin
withdrawal and no emergency sweep — that is a property of the instruction set,
not a promise. It is a property of the code as deployed, and the one key that
could replace that code lives on a USB stick that is not plugged into anything,
not on a laptop. The admin key — fee, pause switch, oracle — is that same cold
key, and the fee it can set is capped at ten per cent in the program itself.

Two things the deadman row does not fit in a table cell. The refund is a claim
each member signs, not a payment that arrives. And in a league, if any prize
slot is still pending or finalized when the refund deadline passes, the refund
is blocked for a further 30 days before unclaimed prizes fall back into the
pro-rata split — otherwise a slow winner gets refunded out from under.

And one limit the veto row does not remove: a pool is only as honest as its
majority. A commissioner who fills a pool with wallets they control can
outvote the people in it, and the program cannot tell a friend from a sock
puppet. That is why pools are for people who know each other, why the roster
is public before anyone's picks lock, and why the results oracle exists — its
posting is the one a commissioner has to contradict in the open.

The commissioner keeps the job, loses the custody.

## Architecture

- **On-chain:** a small Anchor program, 24 instructions. A pool PDA owns the USDC vault; member PDAs track picks, used teams, and elimination. The instructions cover join and sponsored join, pick, post-results through either of two doors (the commissioner's, and an oracle key the admin names), veto, settle, advance, claim, the deadman refund, the four a league needs — lock dues, post the payout sheet, finalize it, claim a prize slot — a two-step handover of the admin key itself, and a treasury change that touches only pools created after it.
- **Server:** more than a sync layer, and worth naming in full. It proposes weekly results from public NFL scores for the commissioner to confirm by hand; it runs an OAuth 2 + PKCE flow against X and issues and burns wallet-signature nonces so an address can prove which handle it owns; it reads Sleeper standings on request; and it writes a Cloudflare D1 database holding three tables — the wallet↔handle pairings, those nonces, and a cached copy of standings. None of it is a source of truth. The chain holds the money, the picks and the eliminations.
- **Two Cloudflare Workers:** an RPC proxy, so the provider key never ships in the browser bundle and only the twenty methods the app uses are forwarded; and the results oracle, a cron that reads two independent NFL scoreboards every ten minutes, posts a week to every pool only when both agree on every final, cranks it through finalize and settlement once the dispute window closes, and sends a Telegram message when it acts or when the feeds disagree.
- **App:** pool creation, join links, the pick grid, and live pool status; a League Treasurer mode that collects dues and pays a posted sheet instead of running weeks; a public leaderboard of the addresses that opted into being named; X account linking; a Sleeper standings import; a wallet explainer for people who have never had one; and an arcade.

## Status

🏈 **Shipped.** Built in public Sept 3–10, 2026 as an entry in [NoahAI Nitro 03](https://x.com/TryNoahAI) (theme: build the Solana version of your favorite Web2 product), and live on mainnet before the season's first kickoff: Week 1 locks Wednesday Sept 9 at 8:20pm ET.

- [x] Escrow program: create / join / vault
- [x] Pick submission with on-chain lock
- [x] Results: post, dispute window, member veto
- [x] Weekly settlement + eliminations
- [x] Payouts: winner, co-winner split, deadman refund
- [x] Pick grid + pool dashboard
- [x] League Treasurer: dues, payout sheet, prize claims, Sleeper import
- [x] Results oracle: two feeds must agree, and members can still veto
- [x] Mainnet, with the upgrade authority and the admin key moved to cold storage
- [x] Security review, written up in [`docs/security-audit-2026-09-08.md`](docs/security-audit-2026-09-08.md)
- [ ] First pool with money in it — a zero-buy-in pool is playing Week 1 now

**What that has actually been put through**, because a checked box is only worth
its evidence:

- One pool ran the whole loop on **devnet against production timing** — 4h14m,
  with `post_results` refused for three hours after the lock and
  `finalize_week` refused for an hour after that, every boundary enforced by
  the chain. Vault $3.00 → $0.00, the single survivor paid exactly $3.00.
- The **deadman refund** has been driven end to end: a pool abandoned, three
  members each taking their pro-rata share back, vault to zero.
- A **veto** has struck a posting down by majority and been re-posted, and a
  minority vote has correctly failed to strike one down.
- **The oracle has run two full drills on devnet**, each from a freshly created
  pool through post → finalize → settle → close with nothing but the cron
  acting, against a fastclock build so a four-day week took minutes.
- **44 LiteSVM tests pass against the production binary** — `anchor build` with
  no features, the one that actually ships. `tests/00-build-guard.ts`
  refuses to run the suite against anything else, because a `fastclock` build
  shortens the very floors those tests exist to check. Six of them exist
  because an outside review found the deadman could fire while the last week
  was still being decided; the review, the answer, and the fix are all in
  [`docs/security-audit-2026-09-08.md`](docs/security-audit-2026-09-08.md).
- **200 web tests** on top of those, run by `npm run test:web`: the oracle's
  decision rules against every shape of feed disagreement, the X-linking and
  listing guards, the arcade, its sound, share-name handling and the field.
- **The mainnet bytes are verified.** Every upgrade dumps the on-chain program
  and compares its sha256 to the local build before the IDL is vendored, and
  the instruction bytes the site and the Worker send are compared to the ones
  the test suite sends, 166 checks, byte for byte.

Not yet: a third-party audit.

## Brand

Turf `#24492E` is the ground — the body background, and decoration only,
because type never touches it. Panel `#0B1710` carries every word on the site,
and Night is now that same colour. Chalk `#FBFDF8` paints the field. Action
`#FF6A2B` is the brand, the links and the buttons · Pot Gold `#E9C258` is money
only · Alive `#57E08A` · Out `#EC565B`. Each of those last three has a lit
variant for the cases where the plain value fails contrast on the grass. This
is a summary, not the set: the `@theme` block in
[`src/app/globals.css`](src/app/globals.css) is the source of truth and carries
the measured number behind every choice.

Mark: the laces, nothing else, never redrawn and never stretched. The mark may
sit on a filled orange tile, and does — the site header is cream laces on
orange, the same image as the avatar. That rule used to be the reverse, on the
grounds that an orange square is the same shape and colour as every button. It
is not any more: no button here is a square, every button is a wide rectangle
carrying a hard offset shadow, and the tile has no shadow at all. Shape does
the disambiguating now. The kit is generated by
[`scripts/build-brand.mjs`](scripts/build-brand.mjs) and lands in
[`brand/`](brand/) — but the script carries its own hand-typed copy of the
palette and of the laces geometry, so a token change in `globals.css` does not
reach it. See [`brand/README.md`](brand/README.md).

## Disclaimer

Commish is escrow infrastructure for unlisted pools among people who know each
other. Unlisted, not private: we publish no directory and no matchmaking, and
the way in is a link somebody sends you — but a pool is a public account on
Solana, `join_pool` has no invite list and no approval step, and anyone can
enumerate every pool the program has ever created with one RPC call. This
site's own leaderboard does exactly that. Treat a join link as an address, not
a secret.

Nothing here is financial, gambling, or legal advice. Know the rules that apply
where you live before running a pool.

---

<div align="center">

**Week 1 locks at kickoff.** 🏈

</div>
