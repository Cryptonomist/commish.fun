/* How the pools work.
 *
 * THE GAP THIS FILLS. The rules existed in exactly one place — the Terms —
 * written in the register a lawyer reads. That is the correct place for them
 * to be binding and the wrong place for somebody to LEARN them, and until now
 * a person handed a join link had nowhere to find out what they were joining
 * beyond a form asking for money.
 *
 * Everything here is the behaviour of the program, not a summary of intent.
 * Where a rule looks surprising it is written out rather than smoothed over,
 * because the surprising ones are the ones that cost somebody a season: a
 * missed pick is a loss, a team is spent once used, a tie is not a push.
 *
 * Kept deliberately in step with rules.rs. Each claim below corresponds to a
 * test there — survivor_advances_on_a_win, survivor_is_out_on_a_loss,
 * survivor_survives_a_push, a_missed_pick_is_out, loser_pool_inverts_the_win,
 * loser_pool_survives_a_push_even_when_the_team_won — and if one of those
 * changes, this page is wrong until it is edited with it.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Survivor, Loser and League dues, explained plainly — how picks work, how you go out, and how the money is paid.",
};

export default function Page() {
  return (
    <LegalPage
      title={"How it works"}
      updated={"8 September 2026"}
      intro={
        "Three kinds of pool, one escrow. Everyone pays the same buy-in, it sits in an account the pool owns, and it comes out by the rules below and no other way."
      }
    >
      <h2>{"Survivor"}</h2>

      <p>{"Each week you pick one team you think will win. That is the whole move — not a score, not a spread. If your team wins you are still in. If it loses, you are out for the season."}</p>

      <p>{"Three rules catch people out, and they are the ones worth reading twice."}</p>

      <ul>
        <li>
          <strong>{"A team can be used only once all season. "}</strong>
          {"Pick Kansas City in week 1 and they are spent — you cannot pick them again in week 9 against somebody terrible. That is what makes this a game of judgement rather than a coin flip: you are spending your good teams, and deciding when."}
        </li>
        <li>
          <strong>{"No pick is a losing pick. "}</strong>
          {"If you have not picked when the week is finalized, you are out. There is no grace period and no default team."}
        </li>
        <li>
          <strong>{"A team on a bye cannot be picked at all."}</strong>
        </li>
      </ul>

      <p>{"A tie knocks you out. A cancelled game does not. If the game is played and ends level, your team did not win, so you are gone. If it is cancelled or voided entirely, you carry on — but that team is still used up."}</p>

      <h2>{"Loser pool"}</h2>

      <p>{"The same shape, inverted: you pick a team you think will LOSE. If they lose, you are still in. If they win, you are out."}</p>

      <p>{"Everything else carries over — one use per team, a missed pick is a loss, no picking a bye. The two differ on a tie: nobody won, which is fatal in Survivor and survivable here. A cancelled game carries you in both, even if the team you picked would have won."}</p>

      <h2>{"League dues"}</h2>

      <p>{"Your season runs somewhere else entirely — ESPN, Sleeper, a spreadsheet. Commish only holds the pot."}</p>

      <p>{"Members pay in until the dues deadline. After that the commissioner locks it and posts a payout sheet saying who finished where. Every member then has a window to vote it down; if enough do, it is thrown out and the commissioner posts again. Once the window passes, each winner claims their share."}</p>

      <p>{"A league has up to eight prize slots, set when the pool is created, and they must add up to exactly one hundred per cent. They cannot be edited afterwards."}</p>

      <h2>{"How a week runs"}</h2>

      <p>{"Picks lock at the first kickoff of the week. Games are played. The commissioner posts the results, and members get a window — the commissioner sets it, at least an hour, usually longer — to vote down a result they think is wrong. When the window passes the week is finalized, everyone who lost is knocked out, and the next week opens."}</p>

      <p>{"The dispute window exists because a commissioner posts the results by hand. It is the members' check on that, and it is enforced by the program rather than by anybody's good manners."}</p>

      <h2>{"Who gets the money"}</h2>

      <p>{"Usually one person is left standing and takes the pot. Not always, and all three endings are written into the program:"}</p>

      <ul>
        <li>{"One survivor — they take everything."}</li>
        <li>{"Everyone still alive is knocked out in the same week — the pot splits among everyone who was alive when that week began."}</li>
        <li>{"More than one person survives all eighteen weeks — they split it."}</li>
      </ul>

      <p>{"You claim your winnings yourself. Nothing is pushed to your wallet; you go and take it, and until you do it stays in the vault where nobody else can reach it either."}</p>

      <h2>{"The fee"}</h2>

      <p>{"Three per cent of the pot, capped at 50 USDC, on Survivor and Loser pools that have a buy-in. It is taken once, when the pool settles, before the pot is divided."}</p>

      <p>{"Because of the cap it is three per cent up to a pot of about 1,667 USDC and a flat 50 above that. On a 500 USDC pot the fee is 15; on a 5,000 USDC pot it is 50, not 150."}</p>

      <p>{"League pools and pools with no buy-in are charged nothing and cannot be — the program records a zero rate on both when they are created. A pool's fee and its ceiling are fixed at the moment it is created and cannot be changed afterwards by us or by anybody, so the deal you joined is the deal that pays out."}</p>

      <h2>{"If a pool never finishes"}</h2>

      <p>{"Every pool has a refund deadline. If it has not settled by then — the commissioner vanished, the season fell apart, anything — every member who paid in can take their share back. Nobody has to agree to it and nobody can stop it, including us. The first person to reclaim fixes the per-member amount so the last one out is not shortchanged."}</p>

      <h2>{"Before you put money in"}</h2>

      <p>
        {"Read the "}
        <Link href="/risk">{"Risks"}</Link>
        {" page. The two that matter most: the program has never been audited, and its upgrade authority is a single key held by us. Both are set out there in full, and neither is hypothetical."}
      </p>

      <p>
        {"The rules above are what the program does. The "}
        <Link href="/terms">{"Terms"}</Link>
        {" are what you are agreeing to, and where these two differ, the Terms govern."}
      </p>
    </LegalPage>
  );
}
