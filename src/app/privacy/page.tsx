/* Privacy Policy.
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
  title: "Privacy Policy",
  description: "What commish.fun collects, which is very little, and what a public blockchain makes permanent regardless.",
};

/* Every placeholder on this page has been answered, so the component that
 * rendered them is gone with them. */

export default function Page() {
  return (
    <LegalPage
      title={"Privacy Policy"}
      updated={"8 September 2026"}
      intro={"No account, no email, no password. What little we do store is listed here, along with the parts of a public blockchain that nobody, including us, can undo."}
    >
      <h2>{"The short version"}</h2>

      <p>{"You do not need an account, an email address or a password to use Commish. Most people who use the site never give us any personal information at all."}</p>

      <p>{"Two things are optional and off by default: linking an X account to your wallet, and appearing on our public leaderboard. The second one is the important one. If you opt in to the leaderboard, you permanently tie a public handle to a wallet address, and anyone can then look up everything that wallet has ever done on the blockchain. Please read that section before you turn it on."}</p>

      <p>{"We run no advertising, no third-party analytics trackers, and we do not sell your data."}</p>

      <h2>{"Who we are"}</h2>

      <p>{"Commish is operated by "}{"HoldFi LLC, a Texas limited liability company, whose registered agent is at 5900 Balcones Dr, STE 100, Austin, TX 78731. We are established in the United States. We have not appointed a Data Protection Officer or an EU or UK representative, because our processing does not meet the thresholds that require one"}{". In this policy \"we\" and \"us\" mean the operator, and \"you\" means the person using the site."}</p>

      <p>{"This policy covers the website at commish.fun. It does not cover the Solana blockchain itself, your wallet software, X, or any league platform you use elsewhere, such as ESPN or Sleeper. Those are run by other people under their own policies."}</p>

      <h2>{"No account, no email, no password"}</h2>

      <p>{"There is no sign-up and there is no login. We do not ask for your email address, your phone number or a password, and we have nowhere to put one."}</p>

      <p>{"We do ask you to type a name for yourself when you join a pool, and that name goes on the blockchain. It is described below, because it is the one piece of this that catches people out."}</p>

      <p>{"To join a pool you connect a Solana wallet and sign transactions with it. Joining is by link, and we do not publish a list of pools on this site."}</p>

      <p>{"That is not the same as a pool being private, and we would rather say so plainly than let the link feel like a lock. Every pool record and every member record can be read straight off the blockchain by anyone, with one ordinary request to a public Solana node. No link needed. Our own leaderboard is built exactly that way."}</p>

      <h2>{"Your wallet address, and why it is public"}</h2>

      <p>{"Your wallet address is a public identifier on the Solana blockchain. It is public by design, not because of anything we do. Every transaction that wallet makes is recorded on a public ledger that anyone in the world can read, copy, and keep forever. That is true of transactions with us and of every unrelated transaction that wallet has ever made or ever will make."}</p>

      <p>{"When you use Commish, your wallet address, the pool you joined, the amount you paid in, your picks once they are locked, and any claim or refund you trigger are written to the blockchain by the program. We do not control that record and we cannot change or delete it. Nobody can."}</p>

      <p>{"The website reads that public data back and displays it inside your pool. Where we hold a copy of on-chain data for display purposes, deleting our copy does not delete the underlying record on the blockchain."}</p>

      <h2>{"The names you type, and where they go"}</h2>

      <p>{"You type names, and the names you type go on the blockchain."}</p>

      <p>{"When you join a pool you type a name for yourself. The form will not let you join without one. The limit is 24 bytes, which is 24 plain characters and fewer if you use accents or emoji. It is written into your member record on the Solana blockchain. It is public, it is permanent, we cannot edit it and we cannot delete it."}</p>

      <p>{"When you create a pool you type a name for the pool, limited to 32 bytes on the same terms. If it is a league pool you also type a short label for each prize place, up to eight of them, 16 bytes each. Those go into the pool record on the blockchain. Public, permanent, and past our reach to change. A survivor pool has no prize labels, so there is nothing to type there."}</p>

      <p>{"In practice this means one thing. Do not put your real name, your email address, your phone number, or anything else you would not want published into either field. Pick something your pool will know you by and nothing more."}</p>

      <p>{"None of these names go into our database. Our database has no column for a display name and no column for a pool name. They exist only on the blockchain."}</p>

      <p>{"The member record also has room for a short note attached to a pick. The site never sends one, so that space is always empty today. If we ever start using it, anything typed there goes on the blockchain like everything else here, and we will update this page before we ship it."}</p>

      <h2>{"Linking an X account (optional, off by default)"}</h2>

      <p>{"You can choose to link an X (formerly Twitter) account to your wallet. You do not have to. Nothing about a pool requires it."}</p>

      <p>{"Linking works in two steps, so that both sides are proved:"}</p>

      <ol>
        <li>{"You sign in to X through X's own OAuth flow, which tells us your X account is yours."}</li>
        <li>{"You sign a message with your wallet, which proves the wallet is yours."}</li>
      </ol>

      <p>{"Storage starts at step one, not step two. The moment X tells us who you are, we write your X id, your handle and your avatar URL to our database and hold them for ten minutes while we wait for your wallet signature. Signing deletes that row. If you walk away instead, it expires, and expired ones are cleared out when the next person starts a link, so on a quiet day an abandoned row can sit there longer than its ten minutes before anything sweeps it up."}</p>

      <p>{"If you complete both steps, we store:"}</p>

      <ul>
        <li>{"your X provider id, the numeric account id X gives us"}</li>
        <li>{"your X handle"}</li>
        <li>{"your X avatar image URL"}</li>
        <li>{"the wallet address you linked it to"}</li>
        <li>{"the date and time of the link"}</li>
        <li>{"which provider it was, which today is always the string \"x\""}</li>
        <li>{"whether you have opted in to the public leaderboard, which starts as no"}</li>
        <li>{"a random token, described below"}</li>
      </ul>

      <p>{"That is the whole of that record. We do not store your X password, and we store no X token at all. We ask X for two permissions, users.read and tweet.read. The second one sounds broader than it is: X requires it before it will answer a request for a profile, and we never read anyone's posts. We do not ask for offline access, so X never issues us a refresh token. The one access token X does give us is used for a single request asking who just signed in, and is gone when that request finishes. We never post anything from your account."}</p>

      <p>{"This record is stored in Cloudflare D1, a database service provided by Cloudflare."}</p>

      <h3>{"The token, and why it exists"}</h3>

      <p>{"When your wallet signature is accepted we generate 32 random bytes, store them on your row, and put a copy in your browser as a cookie called commish_id. It lasts 180 days."}</p>

      <p>{"It exists because of a decision we would rather explain than hide. If this site would tell anyone which X handle owns a given wallet address, then it is a lookup table for everyone who ever linked, including everyone who read the leaderboard warning and said no. Every wallet address is already readable off the blockchain, so such a list would be trivial to build. So we do not answer that question for a bare address. This token is how your own browser proves a record is yours."}</p>

      <p>{"It is not a login and it grants nothing else. It cannot list you publicly, unlist you, unlink you, or move anything. Each of those still costs a fresh signature from your wallet over a sentence saying what it does. Unlinking deletes the token along with the record, so the cookie then opens nothing."}</p>

      <p>{"On its own, linking shows your handle to nobody but you. A pool displays the name you typed when you joined, not your handle, and while you are unlisted the site refuses to answer \"which handle owns this address\" for anyone holding a bare address. Opting into the leaderboard is what lifts that refusal, because the pairing is then on a public page anyway. The one place your handle appears after linking is your own panel on the leaderboard page, which only the browser holding that cookie can open. What linking does is make the next choice available: it is the thing the leaderboard opt-in publishes, if you take it."}</p>

      <h2>{"The public leaderboard (a separate, second opt-in)"}</h2>

      <p>{"Appearing on our public leaderboard is a different decision from linking, and it is off by default. Linking your X account does not put you on the leaderboard. You have to choose that separately."}</p>

      <p>{"Please read this part carefully."}</p>

      <p>{"Linking on its own publishes nothing. Being listed on the public leaderboard is global and permanent in effect. Once your handle appears next to your wallet in public, anyone can copy that pairing. From that point on:"}</p>

      <ul>
        <li>{"Anyone can look up that wallet on a public block explorer and see every transaction it has ever made, including transactions that have nothing to do with Commish, football pools, or us."}</li>
        <li>{"That includes transactions from before you opted in, because the ledger is complete and historical."}</li>
        <li>{"It includes balances and holdings that are visible from the chain."}</li>
        <li>{"Anyone who saw the pairing can keep it. Screenshots, archives, search engine caches and third-party copies are outside our control."}</li>
      </ul>

      <p>{"In plain words: opting in to the public leaderboard permanently de-anonymises that wallet. You cannot undo that in the real world, even though you can remove yourself from our page. If you are not comfortable with the whole history of that wallet being public and attached to your name, do not opt in, or use a wallet you keep separate for this purpose."}</p>

      <p>{"You can opt out of the leaderboard at any time. We will remove you from the page. We cannot remove the pairing from anyone who already recorded it, and we cannot remove anything from the blockchain."}</p>

      <p>{"Building that page also caches a row for each listed wallet: the address, how many pools it has joined, how many it has won, and how much it has claimed. Every figure in it is read off the blockchain, none of it is anything you told us, and it exists so the page still renders when the Solana node we read from is slow. Opting out takes you off the page and leaves that row behind. It is deleted when you unlink."}</p>

      <h2>{"Cookies and local storage"}</h2>

      <p>{"This site sets five cookies. All five are set only if you choose to link an X account. Browse the site, join a pool, make picks and claim a pot, and we set none of them."}</p>

      <p>{"Every one is httpOnly, which means no script on the page can read it, SameSite Lax, and Secure everywhere except plain http on a developer's own machine."}</p>

            <ul>
        <li>{"commish_pkce, commish_state and commish_link_from. Set when you press Connect X. They hold the proof that the sign-in started here, a value that stops somebody replaying another person's sign-in into your browser, and the page to return you to. All three last ten minutes and are deleted the moment you come back from X."}</li>
        <li>{"commish_link. Set when X tells us who you are, and holds the reference to the pending link that your wallet is about to sign. It lasts ten minutes and is deleted as soon as you sign. If the attempt fails we do not clear it, so it sits there until the ten minutes are up. It cannot be used to finish a link afterwards: the pending record it points at is single use and runs out on the same clock."}</li>
        <li>{"commish_id. Set when your wallet signature is accepted. It lasts 180 days and is described in its own section above. It is deleted when you unlink."}</li>
      </ul>

      <p>{"The wallet library we use also writes to your browser's local storage to remember which wallet you connected, so it can reconnect without asking again. That never leaves your browser and we never read it on our servers."}</p>

      <p>{"The site keeps two values of its own in local storage. commish.sfx remembers whether you turned sound on, which is the speaker button on the home page and in the arcade. commish.bowl.best remembers your longest run in the Commish Bowl game on the arcade page. Both are written by the page in your browser, neither is ever sent to us, and neither says anything about who you are. Clearing site data in your browser removes them."}</p>

      <p>{"We set no advertising cookie, no analytics cookie and no tracking cookie, because we run no advertising and no analytics. Vercel and Cloudflare sit in front of this site and may set their own cookies at the network layer for security and routing. Those are theirs, not ours, and we do not read them."}</p>

      <p>{"We do not use cookies or similar technology for advertising or cross-site tracking."}</p>

      <h2>{"Third parties, and what they see"}</h2>

      <p>{"Running a website means other companies handle some of the traffic. Here is who, and what they get."}</p>

      <p><strong>{"Helius (Solana RPC)."}</strong>{" Helius runs the Solana node our blockchain requests end up at. Your browser does not talk to it directly. Requests go first to a proxy we run on Cloudflare, which rebuilds each one and forwards the blockchain call by itself, with none of your browser's headers on it. So Helius sees the wallet addresses being read and the signed transactions being sent, and it sees our proxy's network address rather than yours. Requests our own servers make, such as building the leaderboard, come from our hosting and not from your browser at all."}</p>

      <p><strong>{"Cloudflare (hosting, DNS, database and the RPC proxy)."}</strong>{" Cloudflare serves and protects the site, hosts the D1 database, and runs the proxy that every blockchain request from your browser passes through. That last one is worth saying plainly: Cloudflare sees your IP address alongside the wallet addresses you are reading and the transactions you have signed. The database holds three things, all described above: the X link records, the short-lived pending rows for links nobody has signed yet, and a cached standings row for each wallet on the leaderboard. Cloudflare processes technical connection data, including IP addresses, as part of delivering and protecting the site."}</p>

      <p><strong>{"Vercel (hosting)."}</strong>{" Vercel hosts the web application. It processes technical connection data, including IP addresses, in order to serve pages."}</p>

      <p><strong>{"ESPN (public score endpoint)."}</strong>{" We read public NFL scores from an ESPN public endpoint so that results settle correctly. This is a read we make. We do not send your wallet address, your handle or any other information about you to ESPN."}</p>

      <p><strong>{"Sleeper (only on request)."}</strong>{" If a commissioner asks us to, we read a Sleeper league's public standings to pre-fill a payout sheet. This only happens when a commissioner supplies a league id. We do not send information about individual members to Sleeper."}</p>

      <p><strong>{"X."}</strong>{" If you use the optional link, X handles the sign-in and knows you authorised our application. X's own privacy policy applies to what X does. There is a second, quieter contact with X that has nothing to do with linking: the avatars on our leaderboard are loaded from X's own servers rather than copied to ours, so opening that page asks X for those images and X sees your IP address and the page that asked for them. That happens whether or not you have ever linked anything."}</p>

      <p><strong>{"Your wallet provider."}</strong>{" Your wallet is software you chose. It has its own policy and may see the sites you connect to."}</p>

      <p><strong>{"Share buttons and explorer links."}</strong>{" The share buttons on a pool hand that pool's link to X, WhatsApp, Telegram or your phone's messages app, and the explorer links open Solana Explorer. Nothing goes anywhere until you press one, and what travels is the pool address, not anything about you."}</p>

      <p>{"An earlier version of this policy named Supabase as a scaffolded but unused provider. It never received any data, and the code that would have talked to it has now been deleted from the project, so there is nothing left to describe."}</p>

      <p>{"The website keeps no server logs of its own. The RPC proxy is the exception, and it is one we should name rather than round off: it runs on Cloudflare with logging switched on, so a record of each blockchain request that passes through it is kept in our Cloudflare account, for as long as Cloudflare keeps it rather than for a period we set. It holds no request bodies and no credentials. Vercel and Cloudflare also keep their own operational logs, which is ordinary for any hosted site, and those can include your IP address and which pages you asked for. We can read all of it while troubleshooting. We do not copy it anywhere, we do not join it to anything else, and we do not build any profile from it."}</p>

      <p>{"Our own code writes log lines only when something has gone wrong or a request is refused, and those lines carry error messages and the name of the refused call, not wallet addresses and not IP addresses."}</p>

      <p>{"We perform no geographic check. There is no country lookup anywhere in this site, at join time or any other time, so no country or region is recorded or kept by us."}</p>

      <h2>{"Advertising, analytics and selling data"}</h2>

      <p>{"We do not run advertising."}</p>

      <p>{"We do not embed third-party analytics or tracking scripts."}</p>

      <p>{"We do not sell personal information, and we do not share it for cross-context behavioural advertising. We have no advertising business and no data business."}</p>

      <p>{"No analytics run on this site. Not third-party analytics, not self-hosted analytics, not error reporting, not session recording, not product telemetry. Earlier planning notes considered adding a privacy-preserving one and it was never built. We checked the shipped production build rather than our intentions, and it contains no code from any analytics or monitoring vendor."}</p>

      <p>{"One thing sits close enough to that line to name. Our RPC proxy tags the requests it forwards with the site's name, so that Helius can tell our traffic apart from everybody else's in its own dashboard. It identifies the application, not the person, and there is nothing in it that points back at you."}</p>

      <h2>{"How long we keep things"}</h2>

      <p><strong>{"X link records."}</strong>{" Kept until you unlink, or until we stop offering the feature. When you unlink we delete the record. The delete is immediate and real: the row goes, along with the cached standings row and the random token, and there is no hidden flag keeping a copy alive. Cloudflare, who run the database, keep their own backups for their own disaster recovery, so a deleted row can persist in those for a period we do not set and cannot shorten. We do not restore backups to recover deleted records."}</p>

      <p><strong>{"Pending links."}</strong>{" The row we write when X tells us who you are lasts ten minutes and is deleted the moment you sign. An abandoned one expires on the same clock, but nothing sweeps it until the next person starts a link, so on a quiet day it can outlast its ten minutes in the table."}</p>

      <p><strong>{"Leaderboard listing."}</strong>{" Displayed while you are opted in. Removed from the page when you opt out. The cached standings row behind it is not deleted then. It goes when you unlink."}</p>

      <p><strong>{"On-chain data."}</strong>{" Permanent. Not ours to delete. See below."}</p>

      <p><strong>{"Server and network logs."}</strong>{" Retained under Vercel's and Cloudflare's own policies rather than ours. We do not set those periods and we have not asked either provider to keep anything for longer. The one log surface we operate ourselves is our RPC proxy's, which sits in our Cloudflare account on Cloudflare's retention. Our own code writes a log line only when something has gone wrong or a request is refused, and those lines carry error messages and the name of the refused call, not wallet addresses and not IP addresses."}</p>

      <h2>{"Unlinking, and what unlinking cannot undo"}</h2>

      <p>{"You can unlink your X account at any time. Open the leaderboard page, connect the wallet you linked, and use the Unlink control in the panel there. Your wallet will ask you to sign a short message saying what you are doing, and once you approve it the record is gone."}</p>

      <p>{"If you have lost that wallet, this route is closed to you, because signing with it is the only way we can tell the record is yours. Write to hello@commish.fun, tell us what you can, and we will do what we reasonably can. Be aware that we may not be able to act on a request we cannot tie to a record, and that refusing in that situation is what protects the person whose record it actually is."}</p>

      <p>{"Unlinking removes the connection between your handle and your wallet from our database, and removes your handle and avatar from what we display."}</p>

      <p>{"Unlinking cannot undo the following, and we want to be blunt about it:"}</p>

      <ul>
        <li>{"It does not delete anything from the Solana blockchain. Nothing can. The record of your pool payments, picks, claims and refunds stays public forever."}</li>
        <li>{"It does not retrieve the handle-to-wallet pairing from anybody who already saw it, saved it, screenshotted it, or indexed it."}</li>
        <li>{"It does not remove the pairing from search engine caches, web archives, or anyone else's database."}</li>
      </ul>

      <p>{"If you were listed on the public leaderboard, treat that wallet as permanently identified."}</p>

      <h2>{"Children"}</h2>

      <p>{"Commish is not intended for children and is not directed at them. You must be at least 18 years old, or the age of majority where you live if that is higher, which is the same requirement the Terms set to use it."}</p>

      <p>{"We do not knowingly collect personal information from children. If you believe a child has linked an X account to a wallet on our site, contact us at hello@commish.fun and we will delete the record we hold. We cannot delete anything from the blockchain."}</p>

      <h2>{"Where your data is processed"}</h2>

      <p>{"Our providers operate globally and may process data outside the country you live in. We are based in the United States and our providers, Vercel, Cloudflare and Helius, are United States companies operating global networks."}</p>

      <p>{"If you are in the United Kingdom or the European Economic Area and your data reaches us, that is a transfer out of your region. We rely on the standard contractual clauses in each provider's own terms of service, which we have accepted. We have not separately negotiated data processing agreements with any of them."}</p>

      <h2>{"If you are in the UK or the EEA"}</h2>

      <p>{"This section applies if UK GDPR or EU GDPR applies to you."}</p>

      <p><strong>{"Controller."}</strong>{" "}{"HoldFi LLC is the controller of the personal data described in this policy. We have not appointed an Article 27 representative, because we are not established in the EU or the UK and do not target users there."}</p>

      <p><strong>{"What we process and why."}</strong></p>

      <div className="overflow-x-auto">
      <table>
        <thead>
          <tr><th>{"What"}</th><th>{"Why"}</th><th>{"Legal basis"}</th></tr>
        </thead>
        <tbody>
          <tr><td>{"Wallet address, as displayed in a pool"}</td><td>{"To run the pool you joined and show its state"}</td><td>{"performance of a contract, because you asked us to link the account and we cannot do it without the record, together with our legitimate interest in running the site"}</td></tr>
          <tr><td>{"X provider id, handle, avatar URL, linked wallet, timestamp"}</td><td>{"To hold the proof that this wallet controls this X account, so your own panel can show you what is linked and the leaderboard has something to publish if you opt in"}</td><td>{"Consent"}</td></tr>
          <tr><td>{"Public leaderboard listing"}</td><td>{"To publish a leaderboard you asked to be on"}</td><td>{"Consent, given separately"}</td></tr>
          <tr><td>{"Technical connection data handled by our hosting providers"}</td><td>{"To deliver the site and keep it secure"}</td><td>{"Legitimate interests"}</td></tr>
        </tbody>
      </table>
      </div>

      <p><strong>{"Your rights."}</strong>{" Subject to conditions in the law, you have the right to ask for access to your personal data, correction, erasure, restriction of processing, portability, and to object to processing based on legitimate interests. Where we rely on consent, you can withdraw it at any time, and withdrawing it does not affect what was lawful before."}</p>

      <p>{"Because we hold so little, most requests are simple. If you ask us to delete what we hold, the practical answer is usually that we delete your X link record."}</p>

      <p><strong>{"The honest limit on erasure."}</strong>{" We cannot erase anything from the Solana blockchain. We do not control it, we did not create the record on our own, and no one has the ability to delete or alter it. If your erasure request covers on-chain data, we will tell you plainly that we cannot comply as to that data, and explain what we did delete. We treat a wallet address as personal data when we hold it next to something that identifies you, such as your X handle, and we delete our copy on request. What we cannot do is reach the chain. There is no mechanism, for us or for anyone, to remove or alter a record once the network has accepted it. Erasure rights reach our database and stop there, and we would rather say that plainly than imply a power nobody has."}</p>

      <p><strong>{"Complaints."}</strong>{" You can complain to your local supervisory authority. In the UK that is the Information Commissioner's Office. "}{"We have no establishment in the EU, so no single lead supervisory authority applies to us. Complain to the authority where you live."}</p>

      <p><strong>{"How to ask."}</strong>{" Contact hello@commish.fun. We hold no account and no password, so the way to prove a record is yours is to sign a message with the wallet it is attached to, the same way you proved it when you linked. We will tell you the exact words to sign. If you have lost that wallet, tell us what you can and we will do what we reasonably can, but we may not be able to act on a request we cannot tie to a record."}</p>

      <h2>{"If you are in California"}</h2>

      <p>{"This section applies if the California Consumer Privacy Act, as amended, applies to you."}</p>

      <p><strong>{"Categories we collect."}</strong>{" Identifiers, which for us means a wallet address and, if you link one, an X provider id, handle and avatar URL. Internet or network activity information processed by our hosting providers in the ordinary course of serving the site. We do not collect Social Security numbers, financial account credentials, precise geolocation from you, biometric data, or the contents of your communications."}</p>

      <p><strong>{"Sources."}</strong>{" From you and from your wallet directly, from the public blockchain, and from X if you choose to link."}</p>

      <p><strong>{"Purposes."}</strong>{" To run pools, to hold an X link where you asked us to make one, to publish a leaderboard where you asked us to put you on it, and to keep the site available and secure."}</p>

      <p><strong>{"Sale or sharing."}</strong>{" We do not sell personal information and we do not share it for cross-context behavioural advertising. We have not done so in the preceding twelve months. We do not knowingly sell or share the personal information of consumers under 16."}</p>

      <p><strong>{"Sensitive personal information."}</strong>{" We do not collect it, and therefore do not use it for purposes that would trigger a right to limit."}</p>

      <p><strong>{"Your rights."}</strong>{" You have the right to know what we collect, to access it, to delete it, to correct it, to opt out of sale or sharing (which does not arise here, because we do neither), and not to be discriminated against for exercising any of these. You may use an authorised agent."}</p>

      <p><strong>{"The same honest limit."}</strong>{" A deletion request reaches what we hold in our own database. It cannot reach the blockchain, and it cannot reach a handle-to-wallet pairing that other people already copied from a public leaderboard."}</p>

      <p><strong>{"How to ask."}</strong>{" Contact "}{"hello@commish.fun. We do not operate a telephone line. We are a small operation with no call centre, and email is the only channel we can answer reliably"}{"."}</p>

      <h2>{"Security"}</h2>

      <p>{"We take reasonable care with the small amount of data we hold. We should also be straight with you about the wider picture, because it is part of an honest privacy statement."}</p>

      <p>{"The Solana program that holds pool money has never been audited. It is deployed to Solana mainnet and pools hold real USDC. The program's upgrade authority is a single private key held by us, which in principle could be used to deploy new program code. We are not promising to change that, and what happens to the key is a decision for after an audit. The Terms cover what this means for your money. We mention it here because you should not form a view about trusting this site without knowing it."}</p>

      <p>{"No method of transmission or storage is completely secure, and we cannot guarantee absolute security."}</p>

      <h2>{"Changes to this policy"}</h2>

      <p>{"If we change what we collect or who we send it to, we will update this page. If the change is significant, we will say so on the site. We cannot email you, because we hold no email address for you and have nowhere to put one, so posting here is the only notice we are able to give. The date at the top is how you tell whether anything has moved."}</p>

      <h2>{"Contact"}</h2>

      <p>{"Email hello@commish.fun, or write to HoldFi LLC, 5900 Balcones Dr, STE 100, Austin, TX 78731."}</p>

      <p>{"This policy is governed by the laws of the State of Texas, and disputes about it go to the same courts named in the Terms."}</p>

      <h2>{"About the NFL and other names"}</h2>

      <p>{"We use city names and standard team abbreviations factually. We do not use NFL or team logos, wordmarks or other marks. We are not affiliated with, endorsed by or sponsored by the NFL, any team, ESPN, Yahoo or Sleeper."}</p>
    </LegalPage>
  );
}
