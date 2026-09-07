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

/** Marks something a lawyer must supply. Loud on purpose: an unanswered
 *  placeholder that reads like finished prose is how a draft ships. */
function Tbc({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-out/20 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-out">
      [confirm: {children}]
    </span>
  );
}

export default function Page() {
  return (
    <LegalPage
      title={"Terms of Service"}
      updated={"7 September 2026"}
      intro={"We provide software and an escrow program. We are not a party to your pool, we do not hold your money, and we cannot decide who won."}
    >
      <p>{"These terms are an agreement between you and "}<Tbc>{"legal entity name, company number and registered address of the operator"}</Tbc>{" (\"we\", \"us\", \"our\"). They cover your use of the commish.fun website and the interface it provides to the Commish Solana program."}</p>

      <p>{"If you do not accept these terms, do not use the site."}</p>

      <h2>{"What Commish is"}</h2>

      <p>{"Commish is two things."}</p>

      <p>{"The first is a website. It lets someone create a private pool for an American football season, share a link with people they already know, and see picks, results and standings in one place."}</p>

      <p>{"The second is a program deployed on the Solana blockchain. When a pool has a buy-in, the program creates a token account that belongs to that pool and holds the members' dues until the pool's own rules release them."}</p>

      <p>{"There are three modes:"}</p>

      <ul>
        <li><strong>{"Survivor."}</strong>{" Each week you pick one team you think will win. A wrong pick normally ends your run."}</li>
        <li><strong>{"Loser."}</strong>{" The same shape, inverted: you pick a team you think will lose."}</li>
        <li><strong>{"League dues."}</strong>{" The season itself is played somewhere else entirely, for example on ESPN or Sleeper. Commish only holds the pot and records the payout sheet that the commissioner posts."}</li>
      </ul>

      <p>{"Pools are private. They are joined by link. There is no public directory, no matchmaking, and no way for us or anyone else to browse for a pool to join. Pools may be created with a buy-in of zero, in which case nothing is held at all."}</p>

      <h2>{"What Commish is not"}</h2>

      <p>{"We provide software and, through that software, access to an escrow mechanism that runs on a public blockchain. That is the whole of our role."}</p>

      <p>{"We are not a party to any pool. The arrangement is between the members of that pool and their commissioner. We do not organise pools, promote them, set their rules or decide who joins."}</p>

      <p>{"We take no share of any pot in season one: the platform fee is set to zero. A fee mechanism exists in the program and is described under Fees below, so if that ever changes this sentence changes with it. "}<Tbc>{"whether counsel wants a commitment here not to raise the fee on pools that already exist, which the program already enforces"}</Tbc></p>

      <p>{"We never receive, hold or control your funds at any point. Money moves from a member's wallet into an account owned by the pool's own program address, and out again only by the paths listed below. It does not pass through us, and there is no moment at which we could stop it, take it or send it somewhere else."}</p>

      <p>{"The word \"escrow\" on this site describes what the program's code does. We are describing our conduct, not claiming any particular regulatory status for ourselves. "}<Tbc>{"counsel to settle the regulatory characterisation in each jurisdiction where the service is offered, and whether this section should say more or less"}</Tbc></p>

      <p>{"We do not give legal, tax, financial or investment advice."}</p>

      <h2>{"Current status"}</h2>

      <p>{"The program is currently deployed to Solana "}<strong>{"devnet"}</strong>{" using test tokens. No real money is involved at present. Test tokens have no value, and devnet state can be reset or discarded by the network at any time without notice and without recovery."}</p>

      <p>{"If and when the program is deployed to mainnet, real value will be at risk. Read the Risks section before you send anything you cannot afford to lose."}</p>

      <h2>{"Eligibility"}</h2>

      <p>{"To use Commish you must be at least 18 years old, or the age of majority where you live if that is higher. You must have the legal capacity to enter into this agreement."}</p>

      <p>{"You must not use Commish on behalf of anyone who could not use it themselves, and you must not let a person under that age use a wallet you control to join a pool."}</p>

      <p>{"We do not operate accounts and cannot verify anyone's age. Enforcement of this section relies on you being honest, and on commissioners knowing the people they invite "}<Tbc>{"whether counsel wants an explicit age attestation checkbox at pool join, and whether any state requires 21"}</Tbc>{"."}</p>

      <h2>{"The law where you are"}</h2>

      <p>{"You are responsible for knowing whether taking part in a pool of this kind is lawful in your country, state, province or city, and for knowing how it is treated for tax."}</p>

      <p>{"We make "}<strong>{"no representation whatsoever"}</strong>{" that these pools are lawful anywhere. We do not tell you that they are games of skill. We do not tell you that any particular jurisdiction permits them. We do not assess your location, and nothing on the site is legal advice about your situation. If you are not certain, take your own advice before you take part."}</p>

      <p>{"By using Commish you confirm that doing so is lawful for you where you are, and you accept the consequences if it is not."}</p>

      <p>{"You must not use Commish if you are located in, ordinarily resident in, or acting on behalf of a person in a jurisdiction subject to comprehensive sanctions, or if you are a person subject to sanctions "}<Tbc>{"which sanctions lists apply, whether any screening or geo-blocking is required at the front end, and how that squares with a permissionless program we cannot gate"}</Tbc>{"."}</p>

      <h2>{"Wallets and transactions"}</h2>

      <p>{"You interact with Commish through a Solana wallet you control. We never hold your private key or seed phrase, and we will never ask for them."}</p>

      <p>{"Everything that happens on the blockchain is your action, signed by you, and it is final when the network confirms it. Blockchain transactions cannot be undone. If you sign a transaction by mistake, send to the wrong pool, lose access to your wallet, or have your key stolen, we cannot help you recover anything."}</p>

      <p>{"Network fees are payable to the Solana network, not to us."}</p>

      <h2>{"How money is held"}</h2>

      <p>{"When a pool has a buy-in, members pay USDC into a vault. That vault is the pool's own token account, derived by the program itself (a program derived address). It is not our account and it is not the commissioner's account."}</p>

      <p>{"We do not hold, control, or have the ability to move member funds. Neither does the commissioner. This is a property of how the program is built, not a policy we have adopted, and it cuts both ways: it means nobody can take the pot, and it also means nobody can put a mistake right for you."}</p>

      <h2>{"How money leaves a vault"}</h2>

      <p>{"Money leaves a pool's vault by these paths only, and each one names its own recipient:"}</p>

      <ul>
        <li><strong>{"A winner's claim."}</strong>{" In a Survivor or Loser pool, a member who passes the pool's winner test claims from a settled pool."}</li>
        <li><strong>{"A prize slot claim."}</strong>{" In a league, the member assigned to a finalized slot on the payout sheet claims that slot."}</li>
        <li><strong>{"A refund."}</strong>{" After the pool's refund deadline has passed, any paid member can trigger a pro rata refund of the vault to the paid members. They do not need our permission or the commissioner's. In a league there is one exception, described under Refunds below: a refund waits while a prize slot is still owed."}</li>
        <li><strong>{"A platform fee"}</strong>{", if one is set on that pool, to the treasury address recorded on the pool when it was created. See Fees below."}</li>
      </ul>

      <p>{"There is no administrative withdrawal path, no sweep and no emergency route in the program as deployed. Using the site, we cannot freeze, reverse, seize, redirect or recover funds in a vault, for anyone, for any reason."}</p>

      <p>{"That statement has one important limit, and we would rather state it than let you discover it. The program's upgrade authority is currently a single key that we hold. While that is true, we are not powerless over the code in the way the paragraph above might suggest: new program code could in principle be deployed, and new code could behave differently. We are not promising to change that. Once the program has been audited we will decide what happens to the key, and the honest options are to keep it, to discard it so that the program can never be changed again, or to share it. We have not chosen, there is no date, and you should treat the single key as the state of the world rather than as a stage we are passing through. See the Risks page, which spells out what that key could do in the worst case. "}<Tbc>{"how counsel wants us to describe our position if we are served with an order to use a key we hold"}</Tbc></p>

      <h2>{"Refunds"}</h2>

      <p>{"Every pool sets a refund deadline when it is created. Once that time has passed, the refund path above becomes available to any paid member."}</p>

      <p>{"Two things to understand about it:"}</p>

      <ul>
        <li>{"The refund is "}<strong>{"pro rata across paid members"}</strong>{", not a return of your own payment specifically, and it splits whatever is actually left in the vault at the time."}</li>
        <li>{"In a league, a refund is blocked while a prize slot is pending or finalized, so that a slow winner is not refunded out from under. That block expires 30 days after the refund deadline, after which unclaimed prizes rejoin the pro rata split."}</li>
      </ul>

      <p>{"Small remainders from integer division stay in the vault. These are fractions of a cent."}</p>

      <p>{"We do not issue refunds ourselves. We have no means to."}</p>

      <h2>{"The commissioner"}</h2>

      <p>{"Every pool has a commissioner, who is the person who created it. The commissioner:"}</p>

      <ul>
        <li>{"sets the pool's rules, buy-in, schedule, prize structure, refund deadline and dispute window at creation, and cannot change several of them afterwards;"}</li>
        <li>{"decides who is invited, by sharing the join link;"}</li>
        <li>{"posts the week's results, or in a league posts the payout sheet."}</li>
      </ul>

      <p><strong>{"The commissioner alone posts results."}</strong>{" We do not verify them. The site may display scores from ESPN's public endpoint, and standings from a Sleeper league when a commissioner asks for them, as a convenience. That information is provided by third parties, may be wrong, late or unavailable, and does not decide anything. What the pool acts on is what the commissioner posts to the program."}</p>

      <p>{"A commissioner is a member like anyone else. They cannot move funds, cannot pay themselves, and cannot remove a member's ability to claim or to trigger a refund."}</p>

      <p>{"If you do not trust a person to post results honestly, do not join their pool. That judgement is yours and we do not make it for you."}</p>

      <h2>{"The dispute window and the member veto"}</h2>

      <p>{"The program provides one correction mechanism, and it is the only one we provide."}</p>

      <ul>
        <li>{"Results cannot be posted until at least three hours after the week's lock time."}</li>
        <li>{"Once posted, they sit for the pool's "}<strong>{"dispute window"}</strong>{". The window is chosen when the pool is created, must be between one hour and seven days, and is 48 hours if the pool does not choose."}</li>
        <li>{"During that window, members can veto the posting. A "}<strong>{"strict majority"}</strong>{" of the electorate (members still alive in a Survivor or Loser pool, all paid members in a league) clears the posting and returns the pool to its locked state."}</li>
        <li>{"A cleared posting can be re-posted. A re-post is a new vote: everyone gets to vote on it again."}</li>
        <li>{"If the window passes without a clearing majority, the results are finalized and the pool moves on. Finalized results cannot be reopened by anyone, including us."}</li>
      </ul>

      <p>{"That is the whole of it. It is a blunt instrument and it depends on members paying attention during the window. Watch your pool."}</p>

      <h2>{"Disputes between members"}</h2>

      <p>{"We will not adjudicate disputes between members, or between a member and a commissioner, about picks, results, eligibility, who owes what, or who should have won. We have no power to change an outcome and no standing to judge one."}</p>

      <p>{"If you have a complaint about a pool, take it up with the commissioner and the other members, use the veto while the window is open, and if it comes to it, take whatever steps are available to you outside this service. Contacting us will not produce a different result, because there is nothing we can do."}</p>

      <h2>{"Fees"}</h2>

      <p>{"Season one charges a platform fee of "}<strong>{"zero"}</strong>{"."}</p>

      <p>{"The mechanism exists in the code so that this is verifiable on chain rather than merely asserted. A fee rate and an absolute cap are recorded on each pool when it is created and cannot be changed for that pool afterwards. Pools with a zero buy-in and league pools record no fee at all and can never be charged one."}</p>

      <p>{"We may set a non-zero default for pools created in future. Any such change applies only to pools created after it, never to a pool already running. We will state the current default on the site before you create a pool "}<Tbc>{"the code currently validates the fee rate only against a 100 percent ceiling; counsel and engineering to agree a real maximum, and whether these terms should state a binding cap"}</Tbc>{"."}</p>

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
        <li>{"run a pool open to strangers, advertise a pool publicly, or use Commish to operate a commercial pool-running business "}<Tbc>{"counsel to confirm how firmly to draw this line and whether it should be a warranty rather than a prohibition"}</Tbc>{";"}</li>
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

      <p>{"No account, password or email address is required to use a pool. What we collect, including the optional X account link and the separate, off by default choice to appear on a public leaderboard, is described in our Privacy Policy, which forms part of these terms. Please read it, and read the leaderboard section of it particularly carefully before you opt in: that choice is public, global and permanent."}</p>

      <p>{"Wallet addresses and transactions on Solana are public by the nature of the network. We cannot make them private and neither can you."}</p>

      <h2>{"The site, and ending your access to it"}</h2>

      <p>{"We may change, suspend or withdraw the site, or any part of it, at any time. We may block access to the site from a particular address, region or wallet, and we may stop new pools being created."}</p>

      <p>{"Be clear about what that does and does not mean. Ending your access to the website does not end your access to the program. The program is deployed on a public blockchain and can be used without us. Your ability to claim a prize, or to trigger a refund after the refund deadline, does not depend on our site being available or on our permission. That is deliberate."}</p>

      <p>{"We can pause the creation of new pools. We cannot pause a claim or a refund on a pool that already exists."}</p>

      <p>{"You end this agreement by stopping using the site."}</p>

      <h2>{"No warranty"}</h2>

      <p>{"The site and the program are provided \"as is\" and \"as available\", without warranty of any kind, express or implied, including any implied warranty of merchantability, fitness for a particular purpose, non-infringement, accuracy or availability."}</p>

      <p>{"We do not warrant that the site or the program will be uninterrupted, error free, secure, or free of defects, that results shown will be accurate or timely, that third party data will be correct, or that any pool will reach a correct or fair outcome."}</p>

      <p>{"Some jurisdictions do not allow the exclusion of certain warranties, and nothing here removes a right you have that cannot lawfully be excluded "}<Tbc>{"consumer law carve outs for the jurisdictions we are willing to serve"}</Tbc>{"."}</p>

      <h2>{"Limitation of liability"}</h2>

      <p>{"To the fullest extent permitted by law:"}</p>

      <ul>
        <li>{"we are not liable for any loss of funds, tokens, keys, access, profits, prizes, data or opportunity arising from your use of the site or the program;"}</li>
        <li>{"we are not liable for anything a commissioner or another member does or fails to do, including posting wrong results, failing to post at all, or failing to pay someone what they think they are owed;"}</li>
        <li>{"we are not liable for defects in the program, for the actions of the Solana network or of any third party service, or for the value or availability of USDC;"}</li>
        <li>{"we are not liable for indirect, incidental, special, consequential or punitive damages."}</li>
      </ul>

      <p>{"Our total liability to you for all claims connected with the service is limited to "}<Tbc>{"liability cap. Note the difficulty: we charge a zero fee in season one, so a \"fees paid in the last 12 months\" cap is a cap of zero. Counsel to decide whether a nominal figure is more defensible"}</Tbc>{"."}</p>

      <p>{"Nothing in these terms limits liability for fraud, fraudulent misrepresentation, death or personal injury caused by negligence, or anything else that cannot lawfully be limited."}</p>

      <h2>{"Indemnity"}</h2>

      <p>{"You agree to indemnify us against claims, losses and reasonable costs arising from your use of the service in breach of these terms, from your use of it where it is unlawful for you, or from a pool you run "}<Tbc>{"scope, and whether an indemnity is appropriate for a consumer facing service in the target jurisdictions"}</Tbc>{"."}</p>

      <h2>{"Changes to these terms"}</h2>

      <p>{"We may change these terms. If we do, we will post the updated version on the site and change the date shown with it. Material changes will be flagged on the site for a reasonable period."}</p>

      <p>{"Changes apply from the date they are posted. They do not change the on-chain rules of a pool that already exists: those were fixed when the pool was created and we cannot alter them."}</p>

      <p>{"If you do not accept a change, stop using the site."}</p>

      <h2>{"Governing law and disputes with us"}</h2>

      <p>{"These terms are governed by "}<Tbc>{"governing law"}</Tbc>{"."}</p>

      <p>{"Disputes between you and us will be resolved in "}<Tbc>{"forum, and whether arbitration, a class action waiver and a jury trial waiver are wanted and are enforceable in the target jurisdictions"}</Tbc>{"."}</p>

      <h2>{"General"}</h2>

      <p>{"If any part of these terms is found unenforceable, the rest continues to apply."}</p>

      <p>{"If we do not enforce a right straight away, we do not lose it."}</p>

      <p>{"You may not transfer your rights under these terms. We may transfer ours to a successor of our business, on notice."}</p>

      <p>{"These terms, with the Privacy Policy, are the whole agreement between you and us about the service, and replace anything said earlier."}</p>

      <h2>{"Contact"}</h2>

      <p><Tbc>{"contact email and postal address for notices, and a separate address for legal or regulatory correspondence if wanted."}</Tbc></p>
    </LegalPage>
  );
}
