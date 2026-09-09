/* Terms of Service.
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
  title: "Terms of Service",
  description: "The terms for using commish.fun. We are software and escrow, not a party to your pool.",
};

/* Every placeholder on this page has been answered, so the component that
 * rendered them is gone with them. */

export default function Page() {
  return (
    <LegalPage
      title={"Terms of Service"}
      updated={"8 September 2026"}
      intro={"We provide software and an escrow program. We are not a party to your pool, we do not hold your money, and we cannot decide who won."}
    >
      <p>{"These terms are an agreement between you and "}{"HoldFi LLC, a Texas limited liability company, whose registered agent is at 5900 Balcones Dr, STE 100, Austin, TX 78731"}{" (\"we\", \"us\", \"our\"). They cover your use of the commish.fun website and the interface it provides to the Commish Solana program."}</p>

      <p>{"If you do not accept these terms, do not use the site."}</p>

      <h2>{"What Commish is"}</h2>

      <p>{"Commish is two things."}</p>

      <p>{"The first is a website. It lets someone create a private pool for an American football season, share a link with people they already know, and see picks, results and standings in one place."}</p>

      <p>{"The second is a program deployed on the Solana blockchain. When a pool has a buy-in, the program creates a token account that belongs to that pool and holds the members' dues until the pool's own rules release them."}</p>

      <p>{"There are three modes. The program has nine pool types written into it and refuses the other six outright, so a half-built mode can never take money."}</p>

      <ul>
        <li><strong>{"Survivor."}</strong>{" Each week you pick one team you think will win. A wrong pick normally ends your run, and the exceptions are just below."}</li>
        <li><strong>{"Loser."}</strong>{" The same shape, inverted: you pick a team you think will lose."}</li>
        <li><strong>{"League dues."}</strong>{" The season itself is played somewhere else entirely, for example on ESPN or Sleeper. Commish only holds the pot and records the payout sheet that the commissioner posts. A league has at most eight prize slots, set when the pool is created, and they must add up to exactly one hundred per cent."}</li>
      </ul>

      <p>{"Four things about a Survivor or Loser pool are worth knowing before you join, because the program is strict about all four:"}</p>

      <ul>
        <li>{"No pick counts as a wrong pick. If you have not picked when the week is finalized, you are out. There is no grace."}</li>
        <li>{"A team can be used only once in a season, and a team on a bye cannot be picked at all."}</li>
        <li>{"A tie counts as a win for neither team, and the two modes take that differently: it knocks you out of a Survivor pool and carries you in a Loser pool. A cancelled or voided game is a push: it carries whoever picked either team, but that team is still spent for the season."}</li>
        <li>{"There is not always a single winner. If everyone still alive is knocked out in the same week, the pot splits among the people who were alive when that week began. If more than one member is still standing after week 18, they split it. Only the last-one-left case is winner-take-all."}</li>
      </ul>

      <p>{"A pool takes between 2 and 500 members."}</p>

      <p>{"Pools are unlisted rather than private, and the difference matters. Joining is by link, we publish no directory and we run no matchmaking. But a pool is an ordinary public account on a public blockchain. Every pool record and every member record can be read straight off Solana by anyone, with one ordinary request to a public node, and our own leaderboard is built exactly that way. Nothing in the program asks for an invitation either: an open pool can be joined by anyone who finds it. The link is a convenience, not a lock. Pools may be created with a buy-in of zero, in which case nothing is held at all."}</p>

      <h2>{"What Commish is not"}</h2>

      <p>{"We provide software and, through that software, access to an escrow mechanism that runs on a public blockchain. That is the whole of our role."}</p>

      <p>{"We are not a party to any pool. The arrangement is between the members of that pool and their commissioner. We do not organise pools, promote them, set their rules or decide who joins."}</p>

      <p>{"We take a platform fee of three per cent of the pot on Survivor and Loser pools that have a buy-in, capped at 50 USDC. It is taken once, when the pool settles, out of the vault and before the pot is divided. League pools and pools with no buy-in are charged nothing and cannot be: the program records a zero rate on both when they are created. "}{"A pool records its own fee rate and its own ceiling at the moment it is created, and neither can be changed afterwards by us or by anyone. A fee we change in future reaches only pools created after we change it. The deal you joined is the deal that pays out."}</p>

      <p>{"We never receive, hold or control your funds at any point. Money moves from a member's wallet into an account owned by the pool's own program address, and out again only by the paths listed below. It does not pass through us, and there is no moment at which we could take it or send it somewhere else. There is one way we could delay a winner's claim, and we set it out under How money leaves a vault rather than leave you to find it."}</p>

      <p>{"The word \"escrow\" on this site describes what the program's code does. We are describing our conduct, not claiming any particular regulatory status for ourselves. "}{"To be explicit about what we are not: we are not a bank, a money transmitter, a money services business, a broker, a custodian, a trustee or a payment processor, and nothing in these terms should be read as us accepting any of those roles. We never hold your funds at any point. Whether a particular regulator in a particular place agrees with that characterisation is not something we can settle on your behalf, and if you are running a pool at a size where it matters, take your own advice."}</p>

      <p>{"We do not give legal, tax, financial or investment advice."}</p>

      <h2>{"Current status"}</h2>

      <p>{"The program is deployed to Solana "}<strong>{"mainnet"}</strong>{" and pools hold real USDC. The money is real, the transactions are permanent, and there is no reset and no recovery. A mistake here costs what it appears to cost."}</p>

      <p>{"Read the Risks page before you send anything you cannot afford to lose. Two things on it matter more than the rest: the program has never been audited, and its upgrade authority is a single key we hold."}</p>

      <h2>{"Eligibility"}</h2>

      <p>{"To use Commish you must be at least 18 years old, or the age of majority where you live if that is higher. You must have the legal capacity to enter into this agreement."}</p>

      <p>{"You must not use Commish on behalf of anyone who could not use it themselves, and you must not let a person under that age use a wallet you control to join a pool."}</p>

      <p>{"We do not operate accounts and cannot verify anyone's age. Enforcement of this section relies on you being honest, and on commissioners knowing the people they invite "}{". We have not put an age tick box on the join screen. It would record a claim rather than a fact, and we would rather not create the impression that we verified something we have no way to verify. Some places set the age for this kind of pool higher than eighteen. Knowing the rule where you live is your responsibility, and a commissioner inviting people is taking on the same responsibility for the pool they run"}{"."}</p>

      <h2>{"The law where you are"}</h2>

      <p>{"You are responsible for knowing whether taking part in a pool of this kind is lawful in your country, state, province or city, and for knowing how it is treated for tax."}</p>

      <p>{"We make "}<strong>{"no representation whatsoever"}</strong>{" that these pools are lawful anywhere. We do not tell you that they are games of skill. We do not tell you that any particular jurisdiction permits them. We do not assess your location, and nothing on the site is legal advice about your situation. If you are not certain, take your own advice before you take part."}</p>

      <p>{"By using Commish you confirm that doing so is lawful for you where you are, and you accept the consequences if it is not."}</p>

      <p>{"You must not use Commish if you are located in, ordinarily resident in, or acting on behalf of a person in a jurisdiction subject to comprehensive sanctions, or if you are a person subject to sanctions "}{" We should be straight about what stands behind that. We run no sanctions screening and no country blocking, and we could not enforce either if we wanted to: the program is a public Solana program that anyone can call directly, without this website and without our permission. That paragraph is a rule you are agreeing to, not a control we operate."}{"."}</p>

      <h2>{"Wallets and transactions"}</h2>

      <p>{"You interact with Commish through a Solana wallet you control. We never hold your private key or seed phrase, and we will never ask for them."}</p>

      <p>{"Everything that happens on the blockchain is your action, signed by you, and it is final when the network confirms it. Blockchain transactions cannot be undone. If you sign a transaction by mistake, send to the wrong pool, lose access to your wallet, or have your key stolen, we cannot help you recover anything."}</p>

      <p>{"Network fees are payable to the Solana network, not to us."}</p>

      <p>{"Creating a pool also locks up a rent deposit in SOL, for the pool's own account and for its vault, paid by the commissioner. Nothing in the program closes a pool, so that deposit stays locked for good. Members fare better: once a pool has settled or been abandoned, a member who has taken their money or was never owed any can close their own member account and recover that rent."}</p>

      <h2>{"How money is held"}</h2>

      <p>{"When a pool has a buy-in, members pay USDC into a vault. That vault is the pool's own token account, derived by the program itself (a program derived address). It is not our account and it is not the commissioner's account."}</p>

      <p>{"The token is fixed. One USDC mint is compiled into the program and every other mint is refused when a pool is created, so a pool cannot be denominated in anything else."}</p>

      <p>{"We do not hold, control, or have the ability to move member funds. Neither does the commissioner. This is a property of how the program is built, not a policy we have adopted, and it cuts both ways: it means nobody can take the pot, and it also means nobody can put a mistake right for you."}</p>

      <h2>{"How money leaves a vault"}</h2>

      <p>{"Money leaves a pool's vault by these paths only, and each one names its own recipient:"}</p>

      <ul>
        <li><strong>{"A winner's claim."}</strong>{" In a Survivor or Loser pool, a member who passes the pool's winner test claims from a settled pool."}</li>
        <li><strong>{"A prize slot claim."}</strong>{" In a league, the member assigned to a finalized slot on the payout sheet claims that slot."}</li>
        <li><strong>{"A refund."}</strong>{" After the pool's refund deadline has passed, any paid member can reclaim their own pro rata share of the vault. They do not need our permission or the commissioner's. Each member has to call it for themselves, and the mechanics are under Refunds below. In a league there is one exception, also described there: a refund waits while a prize slot is still owed."}</li>
        <li><strong>{"A platform fee"}</strong>{", to the treasury address recorded on the pool when it was created. Three per cent of the vault, capped at 50 USDC, on a Survivor or Loser pool with a buy-in; nothing on a league or a free pool. See Fees below."}</li>
      </ul>

      <p>{"There is no administrative withdrawal path, no sweep and no emergency route in the program as deployed. We cannot reverse, seize, redirect or recover funds in a vault, for anyone, for any reason. Two limits on that sentence follow, and both of them are ours: the upgrade key, and one way we could hold up a winner's claim."}</p>

      <p>{"That statement has one important limit, and we would rather state it than let you discover it. The program's upgrade authority is currently a single key that we hold. While that is true, we are not powerless over the code in the way the paragraph above might suggest: new program code could in principle be deployed, and new code could behave differently. We are not promising to change that. Once the program has been audited we will decide what happens to the key, and the honest options are to keep it, to discard it so that the program can never be changed again, or to share it. We have not chosen, there is no date, and you should treat the single key as the state of the world rather than as a stage we are passing through. See the Risks page, which spells out what that key could do in the worst case. "}{" If we were ever ordered by a court to use that key, we would comply with a valid order, and we would say publicly that we had been ordered to do something unless the order forbade us from saying so. We would rather you knew that now than assumed otherwise."}</p>

      <p>{"There is a second limit, smaller but more immediate. Closing a week in a Survivor or Loser pool requires a USDC account belonging to our fee treasury to exist. The program names that account every time, whether or not a fee is actually charged, and on a Survivor or Loser pool with a buy-in, one is. Settling the pool is what opens the winner's claim, so if that account is missing, no Survivor or Loser pool can settle and no winner can claim until it exists again. It does not put the money within our reach: the pro rata refund after the refund deadline still works, and would then be the only way out. It is a dependency on us, and you should know it is there. A league never runs that step and is not affected."}</p>

      <h2>{"Refunds"}</h2>

      <p>{"Every pool sets a refund deadline when it is created. Once that time has passed, the refund path above becomes available to any paid member."}</p>

      <p>{"Four things to understand about it:"}</p>

      <ul>
        <li>{"The refund is "}<strong>{"pro rata across paid members"}</strong>{", not a return of your own payment specifically, and it splits whatever is actually left in the vault at the time."}</li>
        <li>{"You have to reclaim your own share. Nobody's refund pays anybody else. The first person to reclaim fixes the per-member figure for everyone, and a member who never calls it is never paid."}</li>
        <li>{"In a league, a refund is blocked while a prize slot is pending or finalized, so that a slow winner is not refunded out from under. That block expires 30 days after the refund deadline, after which unclaimed prizes rejoin the pro rata split."}</li>
        <li>{"The refund path closes for good once a pool has settled. In a Survivor or Loser pool that is the moment the winners are decided, so a winner who never claims leaves their share in the vault with no way out for anyone. That is how the program is built, not a fault in it."}</li>
      </ul>

      <p>{"Small remainders from integer division stay in the vault. These are fractions of a cent."}</p>

      <p>{"We do not issue refunds ourselves. We have no means to."}</p>

      <h2>{"The commissioner"}</h2>

      <p>{"Every pool has a commissioner, who is the person who created it. The commissioner:"}</p>

      <ul>
        <li>{"chooses the pool's name, mode, buy-in, member cap and dispute window, plus the start week in a Survivor or Loser pool, or the dues deadline and the prize split in a league. The weekly lock schedule and the refund deadline are not theirs to set: this site fixes both. None of it can be changed once the pool exists, because the program has no instruction that edits a pool;"}</li>
        <li>{"decides who is invited, by sharing the join link, and can also pay someone else's buy-in for them, which creates that person's membership with only the commissioner signing. A wallet can therefore end up in a pool it never signed for, and that membership records who paid for it until the member closes it;"}</li>
        <li>{"can post the week's results, which the automated poster described below usually does for them, or in a league posts the payout sheet. No software posts a payout sheet."}</li>
      </ul>

      <p><strong>{"Results are usually posted automatically, and the commissioner can always post them by hand."}</strong>{" We operate an automated poster. After a week's last game it reads two independent public scoreboards and posts the week only when both report every game as final and both name the same winner in every game. If they disagree, if either is unavailable, or if a game is postponed or otherwise unsettled, it posts nothing and the commissioner posts instead. Whichever way a week is posted, it goes through the same dispute window and the same member veto described below; nothing about the window or the veto changes. The scoreboards are provided by third parties, may be wrong, late or unavailable, and we do not guarantee them. A wrong result that both scoreboards agreed on is corrected the same way as a wrong result a commissioner typed: by the veto, and only by the veto. The automated poster cannot move funds, cannot change a pool and cannot finalize anything. It can only propose a week's results, and once a posting is struck down it does not propose that week again; from then on the commissioner posts it."}</p>

      <p>{"Be clear about how much that is. A commissioner cannot move funds to an address of their choosing, and cannot remove a member's ability to claim or to trigger a refund. What they can do is decide who gets paid. In a league they fill in the payout sheet, and nothing stops them putting their own wallet in a slot: the program only checks that the assignee is a paid member of that pool, and a commissioner who joined their own league is one. In a Survivor or Loser pool they are the sole author of the results that decide who is eliminated and who is left to claim. Three instructions are theirs alone, and no other member has them: posting results, posting the payout sheet, and paying someone else's buy-in."}</p>

      <p>{"The member veto below is the only check on any of that. There is no other."}</p>

      <p>{"If you do not trust a person to post results honestly, do not join their pool. That judgement is yours and we do not make it for you."}</p>

      <h2>{"The dispute window and the member veto"}</h2>

      <p>{"The program provides one correction mechanism, and it is the only one we provide."}</p>

      <ul>
        <li>{"Results cannot be posted until at least three hours after the week's lock time."}</li>
        <li>{"Once posted, they sit for the pool's "}<strong>{"dispute window"}</strong>{". The window is chosen when the pool is created, and 48 hours is what the form offers if you leave it alone. The program takes anything from one hour to seven days, but a Survivor or Loser pool cannot reach the top of that range: every week has to leave room to post results and finalize them before the next week locks, which on the season schedule caps the window a little under six days. Seven days is only reachable in a league, which has no lock schedule."}</li>
        <li>{"Members can veto the posting. A "}<strong>{"strict majority"}</strong>{" of the electorate (members still alive in a Survivor or Loser pool, all paid members in a league) clears the posting and returns the pool to its locked state."}</li>
        <li>{"The window is a guaranteed minimum, not a deadline. Nothing can be finalized before it closes, and the program goes on accepting votes after it closes, right up until somebody runs the finalize step."}</li>
        <li>{"A cleared posting can be re-posted. A re-post is a new vote: everyone gets to vote on it again. Nothing limits how many times a commissioner may post again, so beating a posting you disagree with means mustering a fresh majority every single time."}</li>
        <li>{"Once the window has passed without a clearing majority, anyone can run the step that finalizes the results and moves the pool on. It is not automatic and it is not the commissioner's alone: somebody has to run it. A pool nobody runs simply sits where it is, and what is left is the refund after the refund deadline. Finalized results cannot be reopened by anyone, including us."}</li>
      </ul>

      <p>{"That is the whole of it. It is a blunt instrument and it depends on members paying attention during the window. Watch your pool."}</p>

      <h2>{"Disputes between members"}</h2>

      <p>{"We will not adjudicate disputes between members, or between a member and a commissioner, about picks, results, eligibility, who owes what, or who should have won. We have no power to change an outcome and no standing to judge one."}</p>

      <p>{"If you have a complaint about a pool, take it up with the commissioner and the other members, use the veto while the window is open, and if it comes to it, take whatever steps are available to you outside this service. Contacting us will not produce a different result, because there is nothing we can do."}</p>

      <h2>{"Fees"}</h2>

      <p>{"The platform fee is "}<strong>{"three per cent of the pot, capped at 50 USDC"}</strong>{", on a Survivor or Loser pool with a buy-in. A league pool and a pool with no buy-in are charged nothing, and the program will not let them be."}</p>

      <p>{"Because of the cap, the fee is three per cent until the pot reaches about 1,667 USDC and a flat 50 USDC above that. On a twelve-person pool at 100 USDC the fee is 36 USDC; on a fifty-person pool at the same buy-in it is 50 USDC rather than 150."}</p>

      <p>{"The mechanism exists in the code so that this is verifiable on chain rather than merely asserted. A fee rate and an absolute cap are recorded on each pool when it is created and cannot be changed for that pool afterwards. Pools with a zero buy-in and league pools record no fee at all and can never be charged one."}</p>

      <p>{"We may set a non-zero default for pools created in future. Any such change applies only to pools created after it, never to a pool already running. We will state the current default on the site before you create a pool "}{" Being precise about the word cap, because it can be read more reassuringly than it deserves. Each pool records an absolute ceiling in tokens alongside the rate, and the fee can never exceed that ceiling or the amount actually in the vault. The program itself only refuses a rate above one hundred percent, so the protection that binds you is the per-pool ceiling and the zero rate, not a low maximum written into the code. We do not commit here to adding a lower ceiling in a future version."}{"."}</p>

      <h2>{"Risks you accept"}</h2>

      <p>{"These are the honest ones. Read them."}</p>

      <p><strong>{"The upgrade authority is a single key that we hold."}</strong>{" The program can, in principle, be replaced with different code by whoever holds that key. Today that is one private key held by us, and "}<strong>{"we are not promising to change that."}</strong>{" What happens to it is a decision for after an audit, not before one: keeping it means bugs can be fixed and trust rests on us, discarding it means the program is frozen exactly as written including any bug in it, and sharing it sits between the two. We have not chosen. For as long as the key exists, the guarantees described above rest on it not being misused, lost or stolen. This is the single most material risk in the product and you should weigh it before sending anything of value."}</p>

      <p><strong>{"The program has never been audited."}</strong>{" No third party has reviewed the code for security defects. Software has bugs. A bug in this program could result in funds being locked in a vault permanently or lost entirely."}</p>

      <p><strong>{"Smart contracts are unforgiving."}</strong>{" There is no support desk that can reverse a mistake, no chargeback and no insurance."}</p>

      <p><strong>{"Solana may be congested, halted or forked"}</strong>{", and transactions may fail, be delayed or be dropped. We rely on a third party (Helius) for network access, and that access may be interrupted."}</p>

      <p><strong>{"USDC is issued by a third party."}</strong>{" Its value, transferability and redemption are outside our control, and it can be frozen at the token level by its issuer, which is a power we neither hold nor influence."}</p>

      <p><strong>{"Nothing here is an investment."}</strong>{" A pool is not an investment product and a pot is not a yield. You may receive nothing back."}</p>

      <p>{"You accept these risks by using the service."}</p>

      <h2>{"Prohibited uses"}</h2>

      <p>{"You must not:"}</p>

      <ul>
        <li>{"use Commish where doing so is unlawful for you;"}</li>
        <li>{"use Commish to launder money, to move the proceeds of crime, to evade sanctions or to finance anything unlawful;"}</li>
        <li>{"run a pool open to strangers, advertise a pool publicly, or use Commish to operate a commercial pool-running business "}{". This is a rule you are agreeing to, not something we can detect or prevent"}{";"}</li>
        <li>{"collect any charge from members outside the program, in connection with a pool you run, without disclosing it to every member before they join;"}</li>
        <li>{"impersonate anyone, or misrepresent who controls a wallet or an X account;"}</li>
        <li>{"attack, probe, overload, scrape at volume, reverse engineer for the purpose of circumventing, or otherwise interfere with the site or its interfaces;"}</li>
        <li>{"use the site to distribute malware, or to post content that is unlawful, harassing, or infringes someone's rights;"}</li>
        <li>{"use any NFL, team, ESPN, Yahoo or Sleeper name or mark through Commish in a way that suggests affiliation or endorsement."}</li>
      </ul>

      <h2>{"Names and marks"}</h2>

      <p>{"Commish uses no NFL or team logos, wordmarks or other marks. Teams are referred to by city name and standard abbreviation, factually."}</p>

      <p>{"Commish is not affiliated with, endorsed by, sponsored by or approved by the National Football League, any NFL club, ESPN, Yahoo or Sleeper. All third party names are the property of their owners."}</p>

      <h2>{"Your data"}</h2>

      <p>{"No account, password or email address is required to use a pool. What we collect, including the optional X account link and the separate, off by default choice to appear on a public leaderboard, is described in our Privacy Policy, which forms part of these terms. Please read it, and read the leaderboard section of it particularly carefully before you opt in. You can turn the listing off again whenever you like and we will take you off the page. What cannot be undone is the pairing of your handle with your wallet once it has been public: anyone who saw it can keep it, and we cannot take it back from them."}</p>

      <p>{"Wallet addresses and transactions on Solana are public by the nature of the network. We cannot make them private and neither can you."}</p>

      <h2>{"The site, and ending your access to it"}</h2>

      <p>{"We may change, suspend or withdraw the site, or any part of it, at any time. We may block access to the site from a particular address, region or wallet, and we may stop new pools being created."}</p>

      <p>{"Be clear about what that does and does not mean. Ending your access to the website does not end your access to the program. The program is deployed on a public blockchain and can be used without us. Your ability to claim a prize, or to reclaim your share after the refund deadline, does not depend on our site being available or on our permission. That is deliberate, with the one exception set out next."}</p>

      <p>{"The pause on new pools is worth being exact about. It is a switch in the program itself, not a change to this website: while it is on, nobody can create a pool through the program, here or anywhere else. It does not reach a pool that already exists. We cannot pause a refund, and we cannot pause a claim in a league. The one claim we could hold up is a winner's claim in a Survivor or Loser pool, for the reason set out under How money leaves a vault."}</p>

      <p>{"You end this agreement by stopping using the site."}</p>

      <h2>{"No warranty"}</h2>

      <p>{"The site and the program are provided \"as is\" and \"as available\", without warranty of any kind, express or implied, including any implied warranty of merchantability, fitness for a particular purpose, non-infringement, accuracy or availability."}</p>

      <p>{"We do not warrant that the site or the program will be uninterrupted, error free, secure, or free of defects, that results shown will be accurate or timely, that third party data will be correct, or that any pool will reach a correct or fair outcome."}</p>

      <p>{"Some jurisdictions do not allow the exclusion of certain warranties, and nothing here removes a right you have that cannot lawfully be excluded "}{". If you live somewhere that gives you rights which cannot be signed away, you keep them, and where a limit in these terms conflicts with such a right the right wins and the rest of these terms carry on unaffected"}{"."}</p>

      <h2>{"Limitation of liability"}</h2>

      <p>{"To the fullest extent permitted by law:"}</p>

      <ul>
        <li>{"we are not liable for any loss of funds, tokens, keys, access, profits, prizes, data or opportunity arising from your use of the site or the program;"}</li>
        <li>{"we are not liable for anything a commissioner or another member does or fails to do, including posting wrong results, failing to post at all, or failing to pay someone what they think they are owed;"}</li>
        <li>{"we are not liable for defects in the program, for the actions of the Solana network or of any third party service, or for the value or availability of USDC;"}</li>
        <li>{"we are not liable for indirect, incidental, special, consequential or punitive damages."}</li>
      </ul>

      <p>{"Our total liability to you for all claims connected with the service is limited to "}{"one hundred United States dollars. We have picked a number rather than tying it to fees paid, because the fee is a small share of a pot and is capped at 50 USDC, so a limit measured against it would be trivially small in most pools and zero in a league or a free pool. That is no limit at all, only an argument waiting to happen"}{"."}</p>

      <p>{"Nothing in these terms limits liability for fraud, fraudulent misrepresentation, death or personal injury caused by negligence, or anything else that cannot lawfully be limited."}</p>

      <h2>{"Indemnity"}</h2>

      <p>{"You agree to indemnify us against claims, losses and reasonable costs arising from your use of the service in breach of these terms, from your use of it where it is unlawful for you, or from a pool you run "}{". This covers claims brought by somebody else because of what you did. It does not apply to a dispute between you and us, and it does not apply where the claim arises from our own failure"}{"."}</p>

      <h2>{"Changes to these terms"}</h2>

      <p>{"We may change these terms. If we do, we will post the updated version on the site and change the date shown with it. Material changes will be flagged on the site for a reasonable period."}</p>

      <p>{"Changes apply from the date they are posted. They do not change the on-chain rules of a pool that already exists: those were fixed when the pool was created and we cannot alter them."}</p>

      <p>{"If you do not accept a change, stop using the site."}</p>

      <h2>{"Governing law and disputes with us"}</h2>

      <p>{"These terms are governed by "}{"the laws of the State of Texas, without regard to its conflict of law rules"}{"."}</p>

      <p>{"Disputes between you and us will be resolved in "}{"the state and federal courts sitting in Travis County, Texas. You and we each agree those courts have personal jurisdiction over us for that purpose"}{"."}</p>

      <h2>{"General"}</h2>

      <p>{"If any part of these terms is found unenforceable, the rest continues to apply."}</p>

      <p>{"If we do not enforce a right straight away, we do not lose it."}</p>

      <p>{"You may not transfer your rights under these terms. We may transfer ours to a successor of our business, on notice."}</p>

      <p>{"These terms, with the Privacy Policy, are the whole agreement between you and us about the service, and replace anything said earlier."}</p>

      <h2>{"Contact"}</h2>

      <p>{"Write to hello@commish.fun. For notices that need to be on paper, post them to HoldFi LLC, 5900 Balcones Dr, STE 100, Austin, TX 78731. Legal and regulatory correspondence can use either route."}</p>
    </LegalPage>
  );
}
