/* Risk Disclosure.
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
  title: "Risk Disclosure",
  description: "The honest list: unaudited code, a single upgrade key, and how you can lose everything you put in.",
};

/* Every placeholder on this page has been answered, so the component that
 * rendered them is gone with them. */

export default function Page() {
  return (
    <LegalPage
      title={"Risk Disclosure"}
      updated={"7 September 2026"}
      intro={"This is the least comfortable page on the site, and it is the one worth reading. If any of it is unacceptable to you, do not put money in."}
    >
      <p>{"This is the page where we tell you what can go wrong. It is deliberately blunt. Please read all of it before you put any money into a pool."}</p>

      <p>{"Commish is software. We are not a bank, a broker, a custodian, or an escrow agent in the usual sense. We do not hold your money and we cannot get it back for you. Everything below follows from that."}</p>

      <h2>{"Nothing here is advice"}</h2>

      <p>{"This page is a description of risks, not advice. We are not giving you legal, tax, financial or investment advice, and nothing on this site should be read as a recommendation to join a pool or to put in any particular amount."}</p>

      <h2>{"The program has never been audited"}</h2>

      <p>{"The Solana program that holds pool funds has not been reviewed by any third-party security auditor. No formal verification, no external code review, no bug bounty. The only people who have looked closely at it are the people who wrote it."}</p>

      <p>{"An audit is not a guarantee of safety, but the absence of one means an entire class of mistakes has never been looked for by anyone independent. Bugs in the program could lock funds in a vault forever, send them to the wrong person, or let someone take funds they are not entitled to. We do not know of such a bug. That is not the same as saying there is not one."}</p>

      <p>{"There has been no audit and none is scheduled. We are not promising one and we are not naming a date, because a date we might miss is worth less to you than a fact you can rely on. If that changes we will say so here."}</p>

      <h2>{"We currently hold a single key that can replace the program code"}</h2>

      <p>{"This is the most serious risk in the product, so we are putting it near the top rather than at the bottom."}</p>

      <p>{"A Solana program has an upgrade authority: the key that is allowed to deploy new code to the same program address. Right now, the upgrade authority for the Commish program is a single private key held by us."}</p>

      <p>{"In plain words, what that means in the worst case:"}</p>

      <ul>
        <li>{"Whoever controls that key can replace the program with different code."}</li>
        <li>{"Replacement code could be written to move funds out of pool vaults, including yours."}</li>
        <li>{"It could change how winners are determined, change deadlines, change the fee, or disable claims and refunds."}</li>
        <li>{"It could be deployed without warning and without your consent. Depositing into a pool does not lock the code that governs that pool."}</li>
        <li>{"If that key is stolen, lost to malware, seized, or handed over under legal compulsion, the person holding it has the same power we do."}</li>
      </ul>

      <p>{"You are therefore trusting us, and trusting our operational security, whether or not you want to. The non-custodial design of the vaults limits what we can do with the current code. It does not limit what could be done with new code."}</p>

      <p>{"That same key wears two other hats, and you should know about both. It is also the admin on the program's configuration account, and it is the address any platform fee would be paid to. One key, three roles. Two things follow, and neither of them needs new code: with a single signature we can pause the creation of new pools, and we can change the default fee and the default cap that new pools copy when they are created. What that key cannot do without new code is reach a pool that already exists. The pause flag blocks creation only, and the program gives it no way to stop a claim or a refund."}</p>

      <p>{"We are not promising to change this. There is a decision to make about that key and it belongs after an audit rather than before one, because the audit changes which answer is right. Keeping it means someone can fix a bug and you are trusting us not to misuse it. Discarding it means the program is frozen exactly as written, including any bug an audit did not catch, and nobody can ever repair it. Sharing it across several holders sits between those, and that option has a history worth stating: a two-of-three multisig was our plan of record and it is not any more, and nothing has replaced it. We have not decided, no option is promised, and no date is attached. Treat the single key as the live state of the world unless and until we publish, verifiably, that it has changed."}</p>

      <p>{"You do not have to take our word for any of this. The program is deployed on Solana devnet at Adb5CFrY4vYiGQnTQ5qsaPPMUAWKyxwVAQtFHWcshjPa, its program data account is 6dMgvhEnxv8QvHWffRTDcB5F5AUe3t9WGMUJLtUUzR4h, and the upgrade authority is HoYb6BCszJUY89WhKt2itTpxtLHMJKuoEwXwQPdbhtVu."}</p>

      <p>{"Look those up in any Solana explorer set to devnet, or run solana program show --url devnet Adb5CFrY4vYiGQnTQ5qsaPPMUAWKyxwVAQtFHWcshjPa. The configuration account that records the admin and the fee treasury is a program address anyone can derive and read, and it will show you the same key again. If the authority ever changes, or is removed so that the program can never be altered again, the chain will show that before we do."}</p>

      <h2>{"Smart contract risk more generally"}</h2>

      <p>{"Even with good intentions and careful code, on-chain software can fail in ways ordinary software does not:"}</p>

      <ul>
        <li>{"A logic error can make funds permanently unclaimable. There is no administrator who can open the vault by hand."}</li>
        <li>{"An error in how accounts are derived or checked can let the wrong party claim."}</li>
        <li>{"Third-party code the program depends on, including the Solana runtime and the SPL token program, can itself change or contain flaws."}</li>
        <li>{"Anything on a public blockchain can be interacted with by anyone, not only by people using our website. Someone can call the program directly with inputs we did not anticipate."}</li>
        <li>{"Transactions are final. There is no chargeback, no dispute process, no reversal."}</li>
      </ul>

      <h2>{"Today this is devnet, with test tokens"}</h2>

      <p>{"At the moment the program is deployed to Solana devnet and pools use test tokens. Devnet money is not money. It has no value, you cannot sell it, and nothing you win on devnet is worth anything. Devnet is a test network: it can be reset or wiped, and it is not intended to be reliable or permanent. Treat anything you do today as a rehearsal."}</p>

      <p>{"If and when we deploy to Solana mainnet, real USDC will be involved and every risk on this page becomes a risk to real money. We will say clearly on the site when that happens. Do not assume the code will have been audited by then, or that the upgrade key will have moved, unless we say so specifically."}</p>

      <p>{"We are not promising a notice period before a mainnet launch. What we will do is keep this page accurate about which network the program is on, so that the page you are reading always tells you whether the money at stake is real."}</p>

      <h2>{"You can lose everything you put in"}</h2>

      <p>{"A pool is not a savings product and there is no protection behind it. There is no deposit insurance, no compensation scheme, no guarantor, and no recourse to us."}</p>

      <p>{"You can lose your entire buy-in by simply losing: making a wrong pick, missing a deadline, or finishing outside the paid places. That is the normal, intended outcome for most members of most pools, and it is not a fault or a failure of the software."}</p>

      <p>{"You can also lose your buy-in for reasons that have nothing to do with football: a bug, a compromised key, a mistake by your commissioner, a wallet you lose access to, or a network problem at the wrong moment."}</p>

      <p>{"DO NOT PUT IN MONEY YOU CANNOT AFFORD TO LOSE ENTIRELY."}</p>

      <h2>{"USDC is not ours"}</h2>

      <p>{"Pools are denominated in USDC, a stablecoin issued and controlled by a third party. We do not issue it, back it, redeem it or control it."}</p>

      <ul>
        <li>{"Its issuer, not us, decides whether it holds its value. It is intended to track the US dollar. It is not guaranteed to, and it has traded away from a dollar in the past."}</li>
        <li>{"The issuer has the technical ability to freeze token accounts, including, in principle, a pool vault."}</li>
        <li>{"The issuer can change its own terms, and its policies are outside our control and outside yours."}</li>
      </ul>

      <p>{"If USDC fails, breaks its peg, or is frozen, we cannot compensate you and we cannot substitute something else for it."}</p>

      <h2>{"Network problems can stop your pick or your claim landing in time"}</h2>

      <p>{"Commish depends on the Solana network, and on infrastructure we do not own. Any of these can prevent a transaction from confirming:"}</p>

      <ul>
        <li>{"Solana network congestion, degraded performance, or a full outage."}</li>
        <li>{"Your RPC connection failing. We route through Helius, a third-party provider. If Helius is down or rate-limiting, the site may not be able to submit or confirm your transaction."}</li>
        <li>{"Your wallet software or extension failing, or a wallet update breaking signing."}</li>
        <li>{"Your own connectivity, your phone, your browser."}</li>
        <li>{"Insufficient SOL in your wallet, which will simply cause the transaction to fail. Every transaction costs a network fee, and joining or creating a pool costs more than that, because the program has to create accounts on chain and you pay the rent on them. There is more on that under Fees."}</li>
        <li>{"The commish.fun website itself being unavailable, whether through an outage, a hosting failure, or because we have taken it down."}</li>
      </ul>

      <p>{"Retrying costs you time you may not have. A transaction that fails, or that lands one second late, is the same as not having acted."}</p>

      <p>{"Yes, and this is the most important thing on this page. Your money sits in a Solana program, not on our servers. If commish.fun is slow, broken, gone, or refusing to serve you, the program keeps working and your funds stay reachable."}</p>

      <p>{"Anyone with a wallet and any Solana node can send that program instructions. Nothing requires our signature or our permission. Settling a member, advancing a week and the other cranks can be triggered by anybody at all, and the program checks the rules itself rather than asking us. Claiming a pot and taking a refund are narrower, and in your favour: each needs a signature from the wallet that owns it, and nobody else can sign for you, including us."}</p>

      <p>{"Every address involved is worked out from public information rather than handed to you by us. The pool address comes from the commissioner's wallet and the pool's number, your member address comes from the pool and your wallet, and the vault is the pool's own token account. The interface description the program was built from ships inside this site's own JavaScript, so a developer can read it out of the page and build the same transactions this site builds."}</p>

      <h2>{"Deadlines are enforced by the program, and a pick gets no grace period"}</h2>

      <p>{"Pick deadlines, claim windows and the refund deadline are enforced on-chain by the program itself, against the blockchain's own clock. They are not enforced by us, so we cannot bend them."}</p>

      <p>{"For a pick or a posting there is no grace period, no late allowance, and no manual override. Nobody, including us and including your commissioner, can accept a pick after the deadline, reopen a closed week, or make an exception because your wallet failed or your internet dropped. If the transaction has not confirmed by the deadline, it did not happen."}</p>

      <p>{"The refund deadline is the one place the program does hold a grace period, and it is written into the code rather than granted by us. It is described under deadlock, below."}</p>

      <p>{"Do not submit a pick in the last minutes before a deadline. Assume you will need to retry at least once."}</p>

      <h2>{"A missed pick eliminates you"}</h2>

      <p>{"In Survivor and Loser pools, failing to submit a valid pick before the deadline eliminates you from the pool in the same way a wrong pick does. Being eliminated does not entitle you to your buy-in back. Your money stays in the pot and goes to whoever ends up claiming it."}</p>

      <p>{"There are two exceptions, and both are in the program rather than in anybody's discretion. If the pool never settles and reaches its refund deadline, being eliminated does not cost you the refund: every member who paid takes a pro-rata share, alive or not. And if everybody still standing is eliminated in the same week, the pot goes to the people who were alive when that week started, which is to say the people who all just lost."}</p>

      <p>{"This applies however good your reason was. Illness, travel, a dead phone, a network outage, a wallet that would not connect: the program cannot see any of it."}</p>

      <h2>{"Your wallet is your responsibility, and a lost key is gone"}</h2>

      <p>{"Commish has no accounts, no passwords and no email. Your wallet is your identity here. That has consequences:"}</p>

      <ul>
        <li>{"If you lose your private key or your seed phrase, your funds and any prize you were owed are unrecoverable. Not by us, not by your commissioner, not by anyone. There is no reset, no recovery, no support ticket that fixes it."}</li>
        <li>{"If someone else obtains your key or your seed phrase, they can act as you: make picks, and claim anything you would have claimed."}</li>
        <li>{"We will never ask for your seed phrase or private key. Anyone who does, including anyone claiming to be us, is trying to rob you."}</li>
        <li>{"Approving a malicious transaction in your wallet, on any site, can drain it. Read what you are signing."}</li>
        <li>{"Because there are no accounts, we cannot verify who you are, so we could not restore access even if we wanted to."}</li>
      </ul>

      <h2>{"The commissioner posts results, and can post them wrong"}</h2>

      <p>{"Commish does not automatically determine outcomes. Your commissioner posts results and, in a league dues pool, posts the payout sheet that decides who can claim which prize slot."}</p>

      <p>{"Commissioners are ordinary people. They can make an honest mistake, read a scoreboard wrong, apply a house rule inconsistently, go quiet halfway through the season, or act dishonestly. We do not vet commissioners, we do not supervise them, and we cannot correct what one of them posts."}</p>

      <p>{"If your commissioner posts a wrong result, the veto is the only remedy the software gives you. There is no appeal to us. We cannot overturn a result, we cannot pay you what you think you were owed, and we cannot move funds out of a vault to an address of our choosing. No instruction in the program does that."}</p>

      <p>{"Only join pools run by people you already know and are willing to trust with money."}</p>

      <p>{"A veto needs a strict majority. After each vote the program checks whether twice the number of vetoes is greater than the number of members entitled to vote. The moment that is true, the posting is struck down. In practice that is three of five, three of four, two of three, and two of two."}</p>

      <p>{"Who counts depends on the pool. For a week of results it is the members still alive, and members already eliminated cannot vote. For a league payout sheet it is the members who have paid."}</p>

      <p>{"Each member gets one vote per posting. A second vote on the same posting is refused. If a posting is struck down and the commissioner posts again, that is a new posting and everybody votes again, including the people who struck down the first one."}</p>

      <p>{"The window opens the moment results are posted and runs for the dispute period the pool was created with. The commissioner cannot finalise a result before that period has elapsed."}</p>

      <h2>{"A pool can deadlock"}</h2>

      <p>{"The veto is a blunt instrument. If enough members veto repeatedly, the pool cannot settle: results never stand, so nobody can claim, and the pot stays in the vault."}</p>

      <p>{"Nothing breaks that deadlock. We cannot step in and decide who was right. There is no arbitrator. The pool simply sits there until the refund deadline set when it was created, at which point any paid member can trigger a pro-rata refund and everyone who paid gets their share of the pot back regardless of what happened on the field. That may be months away, depending on the deadline the pool's creator chose."}</p>

      <p>{"A league dues pool with a prize still outstanding is the exception, and it is worth knowing before you join one. If a payout sheet has been posted and a slot is still waiting to be claimed, the program holds the refund back for thirty days past the refund deadline, so that a slow winner does not have their prize split among everybody else. After those thirty days the block expires and any prize still unclaimed falls into the pro-rata split. A sheet that gets vetoed does not trigger this, because striking one down puts its slots back to unassigned."}</p>

      <p>{"That protection runs both ways, so read this part if you win a league prize. Once the thirty days are up, a refund can empty the vault before you claim. The claim then pays what is actually in the vault, which can be nothing, and it still marks your slot as claimed. Claim what you win."}</p>

      <p>{"Check the refund deadline before you join. It is the only exit the software provides, its date is fixed at creation, and in a league with a prize left outstanding it is that date plus thirty days."}</p>

      <h2>{"We cannot freeze, reverse, seize or redirect funds"}</h2>

      <p>{"We say this elsewhere as a feature. On this page you should read it as a limitation, because it cuts both ways."}</p>

      <p>{"If you are defrauded by a commissioner, argued out of a prize, or send funds you did not mean to send, we cannot help. There is no button on our side. There is no account to suspend, no payment to reverse, no balance to restore. Under the current code, money leaves a vault by exactly four paths: a winner's claim, a prize-slot claim in a league, a pro-rata refund after the refund deadline, and the platform fee to the treasury recorded on the pool, which is zero today. Each of those names its own recipient. There is no fifth path and no destination anybody gets to choose."}</p>

      <p>{"One consequence of that list, since this page tells you elsewhere that funds becoming permanently unclaimable would be a bug. The pot split and the refund split are integer divisions, and the remainder stays in the vault with no instruction anywhere that can move it. That much is stuck for good, on purpose. It is bounded at millionths of a dollar per person, and it is the one place where the design does deliberately what a bug would do by accident."}</p>

      <p>{"The one exception to our powerlessness is the upgrade key described above, and that is a risk to you rather than a protection for you."}</p>

      <h2>{"Fees"}</h2>

      <p>{"The platform fee is three per cent of the pot on Survivor and Loser pools that have a buy-in, capped at 50 USDC, taken once when the pool settles and before the pot is divided. Leagues and pools with no buy-in are charged nothing. Being precise about \"capped\", because it matters: each pool records an absolute ceiling in tokens, copied from our platform default at the moment that pool was created, and the fee can never exceed that or the amount actually in the vault. The percentage rate itself is only validated against a 100 percent ceiling in the code, so the protection that matters is the per pool absolute cap, not a low maximum rate: the program would accept a rate far above the one we set, and what stops any pool paying more than 50 USDC is the ceiling recorded on it at creation. We are not promising a hard rate ceiling in a future version of the program. If one is ever added, this page will say so and will state the number."}</p>

      <p>{"Because a fee mechanism exists and can be configured, and because the upgrade authority can deploy new code, you should not treat a zero fee as permanent or as a guarantee. Separately, every transaction you send costs Solana network fees in SOL, which are paid to the network and not to us."}</p>

      <p>{"There is a second cost in SOL, and it is not a fee to anybody. Solana charges rent for the space an account takes up, and both joining and creating pay it. Joining allocates a 201-byte account that records your membership, paid for by you; once the pool has settled or been abandoned and you have claimed, you can sign to close that account and the rent comes back to you. Creating a pool allocates a 1,616-byte pool account and the vault's token account, both paid for by the commissioner, and nothing in the program can close a pool, so that rent stays where it is."}</p>

      <p>{"Being precise about this, because the word cap can be read more reassuringly than it deserves. Every pool records its own fee rate and its own absolute ceiling in tokens at the moment it is created, both copied from our platform defaults as they stood at that moment, and those two numbers are fixed for that pool for its whole life. Today those defaults are three per cent and a ceiling of 50 USDC. A league pool and a pool with no buy-in record zero for both, because no fee can ever be charged on either. The fee taken can never exceed the ceiling recorded on the pool, and it can never exceed what is actually in the vault."}</p>

      <p>{"The protection that actually binds you is that pair of numbers being copied at creation. The program itself only refuses a rate above one hundred percent, so do not read the existence of a ceiling as meaning the ceiling is low \u2014 what binds is the 50 USDC recorded on your pool, not anything in the code."}</p>

      <p>{"We can change the defaults for pools created in the future, and doing it is easier than the rest of this page might suggest: one signature from our admin key, no new code, no redeploy, and every pool created after that copies the new numbers. We cannot change them for a pool that already exists, and that is enforced by the program rather than promised by us. The deal you joined is the deal that pays out."}</p>

      <p>{"One piece of plumbing belongs here, because it can stop a pool settling. Advancing a week names the fee treasury's token account as a required account on every single call, including at a zero fee, so if that account does not exist no pool can settle. We create it. If it were ever missing, anyone at all could create it, because a token account can be made for any owner by anybody. But it sits in the settlement path, and you should know it is there."}</p>

      <h2>{"Legality is your problem, not ours"}</h2>

      <p>{"We make no representation that using Commish is lawful where you live. We do not assert that these pools are games of skill, and we do not tell you that any particular country, state or territory permits them."}</p>

      <p>{"You are responsible for knowing and following the law that applies to you, including any law about pooling money among private groups. If you are not sure, get advice from someone qualified in your jurisdiction before you join a pool. If it is not lawful for you, do not use Commish."}</p>

      <h2>{"Tax is your responsibility"}</h2>

      <p>{"Any prize you receive may be taxable, and moving between tokens may itself be a taxable event where you live. We do not calculate, withhold, report or file anything. We issue no tax forms and give no tax advice."}</p>

      <p>{"You are responsible for your own records and your own returns. Blockchain transactions are public and permanent, which means your activity is visible to anyone who looks, including tax authorities."}</p>

      <h2>{"Public data and de-anonymisation"}</h2>

      <p>{"Your wallet address and every transaction it makes are public by the nature of the blockchain. Anyone who learns your address can see your entire history with it, on Commish and everywhere else."}</p>

      <p>{"Linking an X account, and separately opting in to the public leaderboard, each make it easier for others to connect that address to you personally. Listing yourself on the public leaderboard is global, and it de-anonymises that wallet to anyone who reads the page. You can take yourself off the page at any time and we will remove you. What you cannot take back is the disclosure: anyone who saw your handle next to your wallet can keep that pairing, and nothing we do reaches them. In that sense it is permanent in effect the moment it is seen. Think carefully before opting in, and read the privacy policy first."}</p>

      <h2>{"Third parties we depend on"}</h2>

      <p>{"We read public NFL scores from ESPN's public endpoint, and, only when a commissioner asks for it, public standings from a Sleeper league. We route RPC traffic through Helius, host this website with Vercel, and host data with Cloudflare. If you use the optional X link, we call X to sign you in. The privacy policy says what each of them sees."}</p>

      <p>{"Any of these can change, break, rate-limit us, return wrong data, or stop being available. We are not affiliated with, endorsed by or sponsored by the NFL, any team, ESPN, Yahoo or Sleeper. We do not control what they publish and we cannot promise the scores we display are correct or current."}</p>

      <h2>{"We may stop"}</h2>

      <p>{"Commish is an early product run on a small scale. We may change it, break it, or stop running the website, with or without notice. Funds already in a vault are governed by the program rather than by the website, but if the site is gone you may find it harder to interact with your pool, and deadlines will keep running regardless."}</p>

      <p>{"If we stop running this site, we will publish the program's source code and instructions for calling it directly, so that anyone with funds in a pool can reach them without us."}</p>

      <p>{"That is a cheap promise for us to make, and we would rather say so than dress it up. Most of the door is already open: the program is on chain where anybody can read it, the interface description ships inside this site's own JavaScript, and the instructions describe something that works today. The one part that is still a promise is the source itself, which is not in a public repository at the moment. Publishing it is a thing we would have to do, not a thing that is already done."}</p>

      <h2>{"No warranty, and limits on what we owe you"}</h2>

      <p>{"The software is provided as it is, with no warranty of any kind, and no promise that it is fit for any particular purpose or free of defects."}</p>

      <p>{"Commish is provided as it is and as it is available, with no warranty of any kind, express or implied. We do not warrant that the software is free of defects, that it will always be reachable, or that it is fit for any particular purpose. It has not been audited."}</p>

      <p>{"To the fullest extent the law allows, HoldFi LLC is not liable for indirect, incidental, special, consequential or exemplary losses, and our total liability for all claims connected with the service is limited to one hundred United States dollars. That is a small number and we would rather you saw it now than found it later. It is the reason the rest of this page exists: the protection you are actually relying on is the program's code and the fact that we cannot reach your money, not a promise from us to make you whole."}</p>

      <p>{"Some places do not allow those exclusions. If you live somewhere that gives you rights which cannot be signed away, you keep them, and where a limit here conflicts with such a right the right wins."}</p>

      <p>{"Commish is operated by HoldFi LLC, a Texas limited liability company, whose registered agent is at 5900 Balcones Dr, STE 100, Austin, TX 78731. This page is governed by the laws of the State of Texas, and disputes go to the state and federal courts sitting in Travis County."}</p>

      <h2>{"Changes to this page"}</h2>

      <p>{"We will update this page as the facts change, in particular if the program is audited, if anything changes about the upgrade authority, or if we deploy to mainnet. The version you agreed to when you joined a pool is not preserved anywhere on-chain, so check back."}</p>

      <p>{"We will post changes to this page and update the date at the top. We hold no email address for you, so we cannot notify you any other way. Continuing to use the site after a change means you accept it, and the honest caveat is that this only works if you look, which is why the date is at the top."}</p>

      <h2>{"Questions"}</h2>

      <p>{"Email hello@commish.fun for anything on this page. If you have found a vulnerability in the program, use the same address and say so in the subject line. Tell us before you tell anyone else, give us a reasonable chance to fix it, and we will not pursue you for having looked."}</p>
    </LegalPage>
  );
}
