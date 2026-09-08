/* Playing Responsibly.
 *
 * A DRAFT. Written to be accurate about what this product actually does, which
 * is the part a template gets wrong: it would describe custody we do not have
 * and data we do not collect. Whether it is legally SUFFICIENT is a different
 * question and needs a lawyer, and every [confirm] below marks something only
 * one can settle.
 *
 * Generated from markdown at author time rather than parsed in the browser.
 * Edit the prose here; there is no build step to re-run.
 */

import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Playing Responsibly",
  description: "Only put in what you can afford to lose. How to set limits, and where to get help.",
};

/* This page had two placeholders and now has none, so the component that
 * rendered them is gone with them. It stays in the other three files until the
 * same is true there. */

export default function Page() {
  return (
    <LegalPage
      title={"Playing Responsibly"}
      updated={"8 September 2026"}
      intro={"This is meant to be entertainment among people who know each other. If it stops being that, the rest of this page is for you."}
    >
      <p>{"Commish is meant to be fun. It is a few friends putting money in a pot and arguing about football for a few months. For most people that is all it ever is. This page is here for the times when it is not."}</p>

      <p>{"We are not qualified to tell you what is healthy for you, and we are not going to try. What follows is what we think is worth saying plainly, and what we do and do not do as an operator."}</p>

      <h2>{"Right now this is test money"}</h2>

      <p>{"The program is deployed to Solana mainnet and pools hold real USDC. Everything below applies to you now, and applies to money you cannot get back. It was written before there was any real money in the product rather than after, which is the order these things should be written in."}</p>

      <h2>{"Only put in what you can afford to lose entirely"}</h2>

      <p>{"Treat every buy-in as money that is gone the moment you pay it. Not money you expect back. Not money you are hoping to grow. Gone."}</p>

      <p>{"If losing your buy-in would change your month, it is too much. If you would need to explain it to someone, it is too much. If you are putting in money that is meant for rent, food, debts or anyone else in your household, do not join the pool."}</p>

      <p>{"The pot is held by the pool's own vault on Solana. Under the code deployed today there is no instruction that lets us move it, freeze it or give it back to you as a favour. That is by design, and it means there is nobody to appeal to if you change your mind."}</p>

      <p>{"One limit on that, because you should hear it from us rather than find it later. We currently hold the single key that can replace the program with different code, and different code could behave differently. What we cannot do is reach into a vault with the code that is running now. The Risks page spells out what that key could do in the worst case."}</p>

      <h2>{"This is not an investment and not a way to make money"}</h2>

      <p>{"A Commish pool is entertainment among people who already know each other. It is not a financial product, not a savings plan and not a strategy for making an income."}</p>

      <p>{"Over a season, most members of any pool will end up with less than they put in. That is simply how a pot works: the money that comes out is the money that went in, shared among fewer people. Nobody should join expecting a return."}</p>

      <p>{"If you are looking at a pool as a way to fix a money problem, it will not fix it."}</p>

      <h2>{"Set your limits before the season, not during it"}</h2>

      <p>{"Decide in the quiet part of the year, before anything is on the line:"}</p>

      <ul>
        <li>{"The most you will put into pools in a season, across all of them, as a single number."}</li>
        <li>{"How many pools you will join."}</li>
        <li>{"What you will do if you are knocked out in week two. Usually the answer should be: nothing. The season is over for you."}</li>
      </ul>

      <p>{"Write it down somewhere you will see it. Limits set in October, halfway through a bad run, are not really limits."}</p>

      <p>{"If you are the commissioner, the buy-in you choose is the limit you are setting for everyone else in the pool. Pick a number that the least well off person in the group can lose without minding. $0 pools work perfectly well and are often the better call."}</p>

      <h2>{"Signs it has stopped being fun"}</h2>

      <p>{"Worth noticing in yourself, and in the people in your pool:"}</p>

      <ul>
        <li>{"You are checking scores with dread rather than interest."}</li>
        <li>{"You are joining more pools, or bigger ones, to make up for an earlier loss."}</li>
        <li>{"You are borrowing to pay a buy-in, or paying one before something more important."}</li>
        <li>{"You are not telling your partner, family or friends how much is in play."}</li>
        <li>{"Relief when you win has replaced enjoyment, and losing feels much worse than winning feels good."}</li>
        <li>{"You have thought about how much time you are spending on this and did not like the answer."}</li>
      </ul>

      <p>{"Any one of those on its own is a reason to sit the next season out. Several together is a reason to talk to someone."}</p>

      <h2>{"What we do not do"}</h2>

      <ul>
        <li>{"We do not extend credit. There is no borrowing, no deferred buy-in, no paying later. We do not lend, and there is no credit anywhere in this product. The program does let a commissioner pay somebody's buy-in for them, though this site offers no way to do it today. If your commissioner offers to cover you, be as careful about what you owe them as you would be anywhere else, and know that your seat records who paid for it. You can close that record yourself once the pool has settled and you have taken anything you were owed, but the transaction that created it stays on the chain."}</li>
        <li>{"We do not offer bonuses, free entries, deposit matches, loyalty rewards or anything else designed to get you to put in more."}</li>
        <li>{"We do not send promotional messages telling you to play again. We do not ask for your email address and we have no way of sending you one."}</li>
        <li>{"We do not advertise pools and we publish no directory of them. There is no matchmaking here and no way to browse for a game on this site. The way in is a link somebody sends you. Be careful who you send yours to, though, because the link is not a secret: a pool is a public account on Solana, the link is simply its address, and the program has no invite list and no approval step. Anybody who has the address, or who goes looking for pools on chain, can join while the pool is still open."}</li>
        <li>{"We do take a cut, and you should know the number before you join rather than after: three per cent of the pot, capped at 50 USDC, on a Survivor or Loser pool that has a buy-in. It comes out of the vault when the pool settles, before the pot is divided, so the winner receives the pot less that fee. A league, and any pool with no buy-in, is charged nothing and cannot be. A pool copies the rate and the cap in force the moment it is created and keeps those two numbers for its whole life, so a change we make later cannot reach a pool you are already in. The Risks page goes into it."}</li>
      </ul>

      <h2>{"Stepping away"}</h2>

      <p>{"The easiest way to step away is to not join. Playing needs no account, so there is nothing to cancel and no subscription running in the background. Closing the tab is enough."}</p>

      <p>{"One exception, if you took it. Linking an X account to your wallet on the leaderboard is optional and off by default, and it is the only record here you put there on purpose: a row keyed to your wallet, and a cookie in your browser that lasts 180 days. Closing the tab does not clear it. Unlinking does, and it is one deliberate act: open the leaderboard in the browser you linked from, connect that wallet, use Unlink and sign the message it asks for."}</p>

      <p>{"The browser matters there, and we would rather say so than let you find out. That cookie is what proves the wallet is yours. From a browser that never held it, or after you clear your cookies, or once the 180 days have run out, the Unlink button still appears but the request behind it is refused, and you have to link through X again before you can unlink. That is a rough edge in something meant to be one click, and it is ours, not yours."}</p>

      <p>{"Your browser also keeps a few small things of its own that never leave the device, like which wallet you last connected, whether you turned sound on, and your best run in the arcade. And separately from anything you chose: our hosting and our blockchain proxy keep ordinary logs, the way any website does. That is a record you leave by visiting rather than by linking, and the Privacy Policy sets out what it holds and how long it lasts."}</p>

      <p>{"Once you have joined a pool and paid in, it is different. Your buy-in is in the pool's vault and you cannot pull it back out at will. The pool runs to its end. Money leaves a vault by four paths and no others: a winner's claim, a prize slot claimed in a league, the pro-rata refund after the refund deadline that was set when the pool was created, and the platform fee to the treasury recorded on the pool, which is three per cent of the pot capped at 50 USDC on a Survivor or Loser pool with a buy-in, and nothing on a league or a free pool. Three of those four you set off yourself by signing for them, and nothing is ever pushed to you: a winner claims, an assignee claims, and any member who paid can claim the refund. What is different about the refund is that it waits on nobody. A winner cannot claim until the commissioner has posted the result and a prize cannot be claimed until the commissioner has finalised the sheet, but the refund needs only the deadline to pass, and neither our permission nor the commissioner's."}</p>

      <p>{"That refund is not your buy-in back, and the difference can be large. It is whatever is sitting in the vault at that moment, divided by everyone who paid in, and the first person to claim it fixes that figure for the rest. In a league where prizes were claimed before the deadline the vault is already smaller, so your share is smaller too. A little is also left behind on purpose: payouts divide in whole units and the remainder stays in the vault, where no instruction can release it. It is a fraction of a cent, so it will not change your day, but it never comes back to anyone."}</p>

      <p>{"So the practical position is this: joining is the decision. Please decide before you pay, not after. And the exits are fewer than they sound. If the pool settles, only the winners are paid, and settling closes the refund path for good: if you did not win there is nothing left to claim, ever. If the pool never settles, the refund opens at the refund deadline, except in a league with prizes still outstanding, where it is held back a further thirty days first."}</p>

      <p>{"We should also be honest about a limit on our side. We have no self exclusion tool. Joining a pool needs only a wallet, and with the code that is running there is nothing that would turn one away: no blocklist in the program, and no age, identity or location check anywhere in the product. We cannot stop you joining a pool, and we cannot block your wallet from being invited to one. If you want a hard stop, it has to come from you and from the people around you, not from us."}</p>

      <p>{"If you want to leave a group but not the friendship, telling the commissioner you are out for the season is usually the whole of it. Most commissioners will not ask why."}</p>

      <h2>{"Where to get help"}</h2>

      <p>{"If money you have put at risk in games of any kind is causing you difficulty, free and confidential help exists in most countries."}</p>

      <ul>
        <li>{"United States: the National Problem Gambling Helpline on 1-800-GAMBLER, available 24 hours a day."}</li>
        <li>{"United Kingdom: GamCare, at gamcare.org.uk, which runs the National Gambling Helpline."}</li>
      </ul>

      <p>{"These are examples, not a complete list, and they are not affiliated with us. If you are somewhere else, look up what exists where you live. Searching for your country alongside the name of a national helpline for difficulty with money and play will normally find one, and your doctor or a local health service can point you to support as well."}</p>

      <p>{"You do not have to be in crisis to contact any of them. They will talk to you about a worry as readily as about a disaster, and they will talk to family members too."}</p>

      <h2>{"A note on what this page is not"}</h2>

      <p>{"This page is not legal, medical or financial advice, and it is not a promise about anything. It does not change the Terms of Service or the Privacy Policy, and it is not a statement about whether Commish or any pool on it is lawful where you are. That remains your responsibility to work out. We make no representation about legality anywhere."}</p>

      <p>{"If you want to raise something with us, including a concern about your own use of Commish or someone else's, you can reach us at "}{"hello@commish.fun"}{". With the code that is running we cannot move funds, and we cannot remove someone from a pool, so please be aware of what we can and cannot help with before you write."}</p>

      <p>{"Commish is operated by "}{"HoldFi LLC, a Texas limited liability company, whose registered agent is at 5900 Balcones Dr, STE 100, Austin, TX 78731"}{"."}</p>

      <p>{"Commish is not affiliated with, endorsed by or sponsored by the NFL, any NFL club, ESPN, Yahoo or Sleeper."}</p>
    </LegalPage>
  );
}
