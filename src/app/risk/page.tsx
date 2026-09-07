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

      <p><Tbc>{"whether we want to commit on this page to a specific plan or date for an audit, or say nothing beyond the fact that there has not been one"}</Tbc></p>

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

      <p>{"We are not promising to change this. There is a decision to make about that key and it belongs after an audit rather than before one, because the audit changes which answer is right. Keeping it means someone can fix a bug and you are trusting us not to misuse it. Discarding it means the program is frozen exactly as written, including any bug an audit did not catch, and nobody can ever repair it. Sharing it across several holders sits between those. We have not decided, no option is promised, and no date is attached. Treat the single key as the live state of the world unless and until we publish, verifiably, that it has changed."}</p>

      <p><Tbc>{"whether we should publish the current upgrade authority address on this page so a reader can check the on-chain state for themselves, and whether the page should name the decision about that key rather than leaving it open"}</Tbc></p>

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

      <p><Tbc>{"whether we want to commit here to giving notice before a mainnet launch, and how much"}</Tbc></p>

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
        <li>{"Insufficient SOL in your wallet to pay the network fee, which will simply cause the transaction to fail."}</li>
        <li>{"The commish.fun website itself being unavailable, whether through an outage, a hosting failure, or because we have taken it down."}</li>
      </ul>

      <p>{"Retrying costs you time you may not have. A transaction that fails, or that lands one second late, is the same as not having acted."}</p>

      <p><Tbc>{"whether members can interact with the program directly, without our website, if commish.fun is unavailable, and if so whether we want to document how here"}</Tbc></p>

      <h2>{"Deadlines are enforced by the program, and there is no grace period"}</h2>

      <p>{"Pick deadlines, claim windows and the refund deadline are enforced on-chain by the program itself, against the blockchain's own clock. They are not enforced by us, so we cannot bend them."}</p>

      <p>{"There is no grace period, no late allowance, and no manual override. Nobody, including us and including your commissioner, can accept a pick after the deadline, reopen a closed week, or make an exception because your wallet failed or your internet dropped. If the transaction has not confirmed by the deadline, it did not happen."}</p>

      <p>{"Do not submit a pick in the last minutes before a deadline. Assume you will need to retry at least once."}</p>

      <h2>{"A missed pick eliminates you"}</h2>

      <p>{"In Survivor and Loser pools, failing to submit a valid pick before the deadline eliminates you from the pool in the same way a wrong pick does. Being eliminated does not entitle you to your buy-in back. Your money stays in the pot and goes to whoever ends up claiming it."}</p>

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

      <p>{"If your commissioner posts a wrong result, the veto is the only remedy the software gives you. There is no appeal to us. We cannot overturn a result, we cannot pay you what you think you were owed, and we cannot move funds out of a vault under any circumstances."}</p>

      <p>{"Only join pools run by people you already know and are willing to trust with money."}</p>

      <p><Tbc>{"the exact veto threshold and the exact window during which members can veto, so this page matches what the program actually enforces"}</Tbc></p>

      <h2>{"A pool can deadlock"}</h2>

      <p>{"The veto is a blunt instrument. If enough members veto repeatedly, the pool cannot settle: results never stand, so nobody can claim, and the pot stays in the vault."}</p>

      <p>{"Nothing breaks that deadlock. We cannot step in and decide who was right. There is no arbitrator. The pool simply sits there until the refund deadline set when it was created, at which point any paid member can trigger a pro-rata refund and everyone gets their share of the pot back regardless of what happened on the field. That may be months away, depending on the deadline the pool's creator chose."}</p>

      <p>{"Check the refund deadline before you join. It is the only exit the software provides, and its date is fixed at creation."}</p>

      <h2>{"We cannot freeze, reverse, seize or redirect funds"}</h2>

      <p>{"We say this elsewhere as a feature. On this page you should read it as a limitation, because it cuts both ways."}</p>

      <p>{"If you are defrauded by a commissioner, argued out of a prize, or send funds you did not mean to send, we cannot help. There is no button on our side. There is no account to suspend, no payment to reverse, no balance to restore. Under the current code, the only ways money leaves a vault are a winner's claim, a prize-slot claim in a league, and a pro-rata refund after the refund deadline."}</p>

      <p>{"The one exception to our powerlessness is the upgrade key described above, and that is a risk to you rather than a protection for you."}</p>

      <h2>{"Fees"}</h2>

      <p>{"Season one charges a zero platform fee. The fee mechanism exists in the program and is currently set to zero. Being precise about \"capped\", because it matters: each pool records an absolute ceiling in tokens chosen when the pool is created, and the fee can never exceed that or the amount actually in the vault. The percentage rate itself is only validated against a 100 percent ceiling in the code, so the protection that matters is the per pool absolute cap and the zero rate, not a low maximum rate. "}<Tbc>{"whether to add a hard rate ceiling in a future program version and say so here"}</Tbc></p>

      <p>{"Because a fee mechanism exists and can be configured, and because the upgrade authority can deploy new code, you should not treat a zero fee as permanent or as a guarantee. Separately, every transaction you send costs Solana network fees in SOL, which are paid to the network and not to us."}</p>

      <p><Tbc>{"the fee cap written into the program, and whether we want to state it numerically here and commit to how much notice we would give before changing the fee"}</Tbc></p>

      <h2>{"Legality is your problem, not ours"}</h2>

      <p>{"We make no representation that using Commish is lawful where you live. We do not assert that these pools are games of skill, and we do not tell you that any particular country, state or territory permits them."}</p>

      <p>{"You are responsible for knowing and following the law that applies to you, including any law about pooling money among private groups. If you are not sure, get advice from someone qualified in your jurisdiction before you join a pool. If it is not lawful for you, do not use Commish."}</p>

      <h2>{"Tax is your responsibility"}</h2>

      <p>{"Any prize you receive may be taxable, and moving between tokens may itself be a taxable event where you live. We do not calculate, withhold, report or file anything. We issue no tax forms and give no tax advice."}</p>

      <p>{"You are responsible for your own records and your own returns. Blockchain transactions are public and permanent, which means your activity is visible to anyone who looks, including tax authorities."}</p>

      <h2>{"Public data and de-anonymisation"}</h2>

      <p>{"Your wallet address and every transaction it makes are public by the nature of the blockchain. Anyone who learns your address can see your entire history with it, on Commish and everywhere else."}</p>

      <p>{"Linking an X account, and separately opting in to the public leaderboard, each make it easier for others to connect that address to you personally. Listing yourself on the public leaderboard is permanent and global, and de-anonymises that wallet to anyone who reads the page. Think carefully before opting in, and read the privacy policy first."}</p>

      <h2>{"Third parties we depend on"}</h2>

      <p>{"We read public NFL scores from ESPN's public endpoint, and, only when a commissioner asks for it, public standings from a Sleeper league. We route RPC traffic through Helius and host data with Cloudflare."}</p>

      <p>{"Any of these can change, break, rate-limit us, return wrong data, or stop being available. We are not affiliated with, endorsed by or sponsored by the NFL, any team, ESPN, Yahoo or Sleeper. We do not control what they publish and we cannot promise the scores we display are correct or current."}</p>

      <h2>{"We may stop"}</h2>

      <p>{"Commish is an early product run on a small scale. We may change it, break it, or stop running the website, with or without notice. Funds already in a vault are governed by the program rather than by the website, but if the site is gone you may find it harder to interact with your pool, and deadlines will keep running regardless."}</p>

      <p><Tbc>{"what, if anything, we are willing to commit to on wind-down, for example publishing the source and instructions for interacting with the program directly"}</Tbc></p>

      <h2>{"No warranty, and limits on what we owe you"}</h2>

      <p>{"The software is provided as it is, with no warranty of any kind, and no promise that it is fit for any particular purpose or free of defects."}</p>

      <p><Tbc>{"the disclaimer of warranties and limitation of liability wording, the liability cap, the operating entity's legal name, governing law and jurisdiction, and whether any of these limits are enforceable against consumers in the places our users actually live"}</Tbc></p>

      <h2>{"Changes to this page"}</h2>

      <p>{"We will update this page as the facts change, in particular if the program is audited, if anything changes about the upgrade authority, or if we deploy to mainnet. The version you agreed to when you joined a pool is not preserved anywhere on-chain, so check back."}</p>

      <p><Tbc>{"whether we notify users of changes to this page, how, and whether continued use counts as acceptance"}</Tbc></p>

      <h2>{"Questions"}</h2>

      <p><Tbc>{"contact address for risk and security questions, and a separate address or process for responsible disclosure of a vulnerability in the program"}</Tbc></p>
    </LegalPage>
  );
}
