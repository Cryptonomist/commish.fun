# For whoever reviews the legal pages

The four pages under `/terms`, `/privacy`, `/risk` and `/play` used to carry 49
red boxes reading `[confirm: ...]`. They are gone, and this file is where they
went.

Most of them were never legal questions. They were questions about what the
software does, addressed to a lawyer who had no way to answer them. Those were
settled by reading the code, and the answers are now stated on the pages as
facts. What is left below is the part that genuinely needs professional
judgement.

**None of the drafting was done by a lawyer.** It was written to take a plain,
defensible position rather than leave a reader looking at a placeholder. Treat
every position below as a proposal to redline, not as advice that has been
given.

## The facts the pages now assert, and where to check them

If any of these is wrong, the page is wrong, so they are worth spot-checking
against the source rather than trusting.

| Claim on the page | Where it is enforced |
|---|---|
| A display name is required to join and is written permanently on chain | `join_pool` in `programs/commish/src/lib.rs`; the join button is gated on `canJoin`, false while `nameBytes === 0` |
| Pool names and prize labels are also on chain and public | `Pool.name`, `PrizeSlot.label` in `state.rs` |
| No X token of any kind is stored | scope `users.read tweet.read` with no `offline.access` in `api/auth/x/start`; the access token is a function-local const in the callback |
| Five cookies, all httpOnly, all only on the linking path | `api/auth/x/start`, `api/auth/x/callback`, `api/auth/bind`, `api/auth/identity` |
| `commish_id` lasts 180 days | `READ_COOKIE_MAX_AGE` in `src/lib/identity.ts` |
| No analytics, telemetry or error reporting of any kind | absent from `package.json`, `layout.tsx`, `next.config.ts` |
| No geographic check anywhere | no country lookup in `src/`; no `middleware.ts` |
| Unlink is a hard immediate delete of two rows | the DELETE handler in `api/auth/identity` |
| A veto needs a strict majority, one vote per member per posting | `veto_results` in `lib.rs`; `veto_epoch` vs `vetoed_epoch` |
| A pool's fee is fixed at creation and cannot be changed later | `create_pool` copies `fee_bps` and `fee_cap` onto the pool |
| The program is permissionless and reachable without this site | no operator signer on `claim_pot`, `reclaim_dues`, `settle_member`, `advance_week` |
| The upgrade authority is a single key, published on the Risks page | `solana program show` on the program id |

## Positions taken that need a lawyer's eye

**Liability cap of one hundred US dollars.** Season one charges no fee, so the
usual "fees paid in the last twelve months" formula caps liability at zero,
which is not a limit so much as an invitation to argue. A flat number was
chosen instead. Whether it is enforceable against a consumer in Texas or
anywhere else is exactly the question.

**Regulatory characterisation.** The Terms say what we are not: not a bank, not
a money transmitter, not a money services business, not a custodian, not a
payment processor. The factual basis is real, in that the operator never holds
user funds. Whether that characterisation survives contact with a state
regulator, particularly once real money is involved, is unresolved. Note that
internal notes previously leaned on a planned multisig as part of the
"no control" argument, and that multisig is no longer planned.

**Sanctions.** The Terms prohibit use by sanctioned persons. The pages now say
plainly that no screening and no geo-blocking is performed, and that neither
could be enforced anyway because the program is public and callable without the
website. That is honest and it may not be sufficient.

**Age.** The Terms set eighteen, or the age of majority where the user lives if
higher. No attestation checkbox was added, on the grounds that it would record
a claim rather than a fact. Some jurisdictions set twenty-one for this kind of
pool. Whether the current position is defensible, and whether a checkbox would
actually improve it, needs a view.

**Court order over the upgrade authority.** The Terms now say the operator would
comply with a valid order and would disclose having received one unless
forbidden. That was written to be honest rather than to be optimal.

**Indemnity.** Narrowed to third-party claims arising from the user's own
breach or unlawful use, and expressly excluded for claims arising from the
operator's own failure. Whether an indemnity belongs in a consumer-facing
agreement at all is a fair question.

**Erasure and the blockchain.** The Privacy page states that erasure rights
reach the database and stop at the chain, because no mechanism exists for
anyone to alter a record the network has accepted. Article 17 and immutable
ledgers is unsettled ground and the page takes the plain factual position.

**The `commish_id` cookie and consent.** It is a persistent identifier lasting
180 days. The argument that it is strictly necessary is that without it nobody
can read their own unlisted record, and the alternative was an endpoint that
answered "which handle owns this address" for any address, which would have
been a directory of everyone who ever linked. That is a real necessity
argument, and a 180-day identifier is still the profile regulators look at
hardest.

**Transfers out of the UK and EEA.** The page relies on the standard
contractual clauses inside each provider's own terms of service. No separate
data processing agreement has been negotiated with Vercel, Cloudflare or
Helius.

## Things that are true today and will stop being true

- Every page describes **devnet**, where the tokens have no value. On a mainnet
  deployment the Playing Responsibly page and the Privacy page both say
  something false about real money, and `scripts/deploy-mainnet.sh` names the
  exact lines.
- The Risks page publishes the **devnet** program id and upgrade authority. A
  mainnet deployment changes both.
- There has been **no audit** and none is scheduled. The Risks page says so and
  promises nothing.
