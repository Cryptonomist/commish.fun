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
      title={"Privacy Policy"}
      updated={"7 September 2026"}
      intro={"No account, no email, no password. What little we do store is listed here, along with the parts of a public blockchain that nobody, including us, can undo."}
    >
      <h2>{"The short version"}</h2>

      <p>{"You do not need an account, an email address or a password to use Commish. Most people who use the site never give us any personal information at all."}</p>

      <p>{"Two things are optional and off by default: linking an X account to your wallet, and appearing on our public leaderboard. The second one is the important one. If you opt in to the leaderboard, you permanently tie a public handle to a wallet address, and anyone can then look up everything that wallet has ever done on the blockchain. Please read that section before you turn it on."}</p>

      <p>{"We run no advertising, no third-party analytics trackers, and we do not sell your data."}</p>

      <h2>{"Who we are"}</h2>

      <p>{"Commish is operated by "}<Tbc>{"legal entity name, registered address and, if applicable, EU/UK representative and Data Protection Officer"}</Tbc>{". In this policy \"we\" and \"us\" mean the operator, and \"you\" means the person using the site."}</p>

      <p>{"This policy covers the website at commish.fun. It does not cover the Solana blockchain itself, your wallet software, X, or any league platform you use elsewhere, such as ESPN or Sleeper. Those are run by other people under their own policies."}</p>

      <h2>{"No account, no email, no password"}</h2>

      <p>{"There is no sign-up. There is no login. We do not ask for your name, your email address, your phone number or a password, and we have no way to store one."}</p>

      <p>{"To join a pool you connect a Solana wallet and sign transactions with it. Joining is by link. There is no public directory of pools."}</p>

      <h2>{"Your wallet address, and why it is public"}</h2>

      <p>{"Your wallet address is a public identifier on the Solana blockchain. It is public by design, not because of anything we do. Every transaction that wallet makes is recorded on a public ledger that anyone in the world can read, copy, and keep forever. That is true of transactions with us and of every unrelated transaction that wallet has ever made or ever will make."}</p>

      <p>{"When you use Commish, your wallet address, the pool you joined, the amount you paid in, your picks once they are locked, and any claim or refund you trigger are written to the blockchain by the program. We do not control that record and we cannot change or delete it. Nobody can."}</p>

      <p>{"The website reads that public data back and displays it inside your pool. Where we hold a copy of on-chain data for display purposes, deleting our copy does not delete the underlying record on the blockchain."}</p>

      <p>{"We do not currently collect a name for you. Pool members typically know who each other are already, because someone sent them the link."}</p>

      <p><Tbc>{"whether the site stores any user-supplied display name, pool name, or free-text field, and whether those are treated as personal data here. Pool names in particular may be user-supplied and visible to anyone with the link."}</Tbc></p>

      <h2>{"Linking an X account (optional, off by default)"}</h2>

      <p>{"You can choose to link an X (formerly Twitter) account to your wallet. You do not have to. Nothing about a pool requires it."}</p>

      <p>{"Linking works in two steps, so that both sides are proved:"}</p>

      <ol>
        <li>{"You sign in to X through X's own OAuth flow, which tells us your X account is yours."}</li>
        <li>{"You sign a message with your wallet, which proves the wallet is yours."}</li>
      </ol>

      <p>{"If you complete both steps, we store:"}</p>

      <ul>
        <li>{"your X provider id (the numeric account id X gives us)"}</li>
        <li>{"your X handle"}</li>
        <li>{"your X avatar image URL"}</li>
        <li>{"the wallet address you linked it to"}</li>
        <li>{"the date and time of the link"}</li>
      </ul>

      <p>{"That is the whole record. We do not store your X password, and we do not store X access or refresh tokens beyond what is needed to complete the link. We never post anything from your account. "}<Tbc>{"confirm with engineering that no OAuth access or refresh token is retained after the link is verified, and state the position explicitly."}</Tbc></p>

      <p>{"This record is stored in Cloudflare D1, a database service provided by Cloudflare."}</p>

      <p>{"Within a league, linking means other members of that league see your handle and avatar next to your entry instead of a raw wallet address. That is the point of it: it is easier to tell who is who."}</p>

      <h2>{"The public leaderboard (a separate, second opt-in)"}</h2>

      <p>{"Appearing on our public leaderboard is a different decision from linking, and it is off by default. Linking your X account does not put you on the leaderboard. You have to choose that separately."}</p>

      <p>{"Please read this part carefully."}</p>

      <p>{"Linking is scoped to your league. Being listed on the public leaderboard is global and permanent in effect. Once your handle appears next to your wallet in public, anyone can copy that pairing. From that point on:"}</p>

      <ul>
        <li>{"Anyone can look up that wallet on a public block explorer and see every transaction it has ever made, including transactions that have nothing to do with Commish, football pools, or us."}</li>
        <li>{"That includes transactions from before you opted in, because the ledger is complete and historical."}</li>
        <li>{"It includes balances and holdings that are visible from the chain."}</li>
        <li>{"Anyone who saw the pairing can keep it. Screenshots, archives, search engine caches and third-party copies are outside our control."}</li>
      </ul>

      <p>{"In plain words: opting in to the public leaderboard permanently de-anonymises that wallet. You cannot undo that in the real world, even though you can remove yourself from our page. If you are not comfortable with the whole history of that wallet being public and attached to your name, do not opt in, or use a wallet you keep separate for this purpose."}</p>

      <p>{"You can opt out of the leaderboard at any time. We will remove you from the page. We cannot remove the pairing from anyone who already recorded it, and we cannot remove anything from the blockchain."}</p>

      <h2>{"Cookies and local storage"}</h2>

      <p><Tbc>{"exact list of cookies and browser storage the site sets, what each is for, how long it lasts, and whether any consent banner is legally required given that there is no advertising and no third-party analytics. Typical items to check: wallet adapter connection state, theme preference, the X OAuth session cookie during linking, and any Cloudflare security cookie set at the network layer."}</Tbc></p>

      <p>{"We do not use cookies or similar technology for advertising or cross-site tracking."}</p>

      <h2>{"Third parties, and what they see"}</h2>

      <p>{"Running a website means other companies handle some of the traffic. Here is who, and what they get."}</p>

      <p><strong>{"Helius (Solana RPC)."}</strong>{" When the site reads from or writes to the blockchain, those requests go through Helius. Helius can see the requests we make, which will include wallet addresses and the network address the request comes from."}</p>

      <p><strong>{"Cloudflare (hosting, DNS and database)."}</strong>{" Cloudflare serves and protects the site and hosts the D1 database that holds X link records. Cloudflare processes technical connection data, including IP addresses, as part of delivering and protecting the site."}</p>

      <p><strong>{"Vercel (hosting)."}</strong>{" Vercel hosts the web application. It processes technical connection data, including IP addresses, in order to serve pages."}</p>

      <p><strong>{"ESPN (public score endpoint)."}</strong>{" We read public NFL scores from an ESPN public endpoint so that results settle correctly. This is a read we make. We do not send your wallet address, your handle or any other information about you to ESPN."}</p>

      <p><strong>{"Sleeper (only on request)."}</strong>{" If a commissioner asks us to, we read a Sleeper league's public standings to pre-fill a payout sheet. This only happens when a commissioner supplies a league id. We do not send information about individual members to Sleeper."}</p>

      <p><strong>{"X."}</strong>{" If you use the optional link, X handles the sign-in and knows you authorised our application. X's own privacy policy applies to what X does."}</p>

      <p><strong>{"Your wallet provider."}</strong>{" Your wallet is software you chose. It has its own policy and may see the sites you connect to."}</p>

      <p>{"We also have a Supabase project scaffolded in the codebase. It is not in use and holds no member data. "}<Tbc>{"this policy will need updating before Supabase is switched on, and the lawyer should decide whether to name an unused provider at all."}</Tbc></p>

      <p><Tbc>{"whether server logs held by Vercel or Cloudflare are retained by us, for how long, and by whom they can be read. Also confirm whether any IP-based geographic check is performed at join time and, if so, what is recorded and kept, because that would be additional personal data not described above."}</Tbc></p>

      <h2>{"Advertising, analytics and selling data"}</h2>

      <p>{"We do not run advertising."}</p>

      <p>{"We do not embed third-party analytics or tracking scripts."}</p>

      <p>{"We do not sell personal information, and we do not share it for cross-context behavioural advertising. We have no advertising business and no data business."}</p>

      <p><Tbc>{"whether any privacy-preserving, self-hosted usage analytics are running in production. Earlier project notes contemplated one. If anything is running, it must be described here, along with confirmation that it never receives wallet addresses."}</Tbc></p>

      <h2>{"How long we keep things"}</h2>

      <p><strong>{"X link records."}</strong>{" Kept until you unlink, or until we stop offering the feature. When you unlink we delete the record. "}<Tbc>{"whether deletion is immediate and hard, and how long copies persist in database backups."}</Tbc></p>

      <p><strong>{"Leaderboard listing."}</strong>{" Displayed while you are opted in. Removed from the page when you opt out."}</p>

      <p><strong>{"On-chain data."}</strong>{" Permanent. Not ours to delete. See below."}</p>

      <p><strong>{"Server and network logs held by our providers."}</strong>{" "}<Tbc>{"retention periods set by, or available from, Vercel and Cloudflare."}</Tbc></p>

      <h2>{"Unlinking, and what unlinking cannot undo"}</h2>

      <p>{"You can unlink your X account at any time. "}<Tbc>{"describe the exact in-app route, and provide a fallback contact route for anyone who has lost access to the wallet or the X account."}</Tbc></p>

      <p>{"Unlinking removes the connection between your handle and your wallet from our database, and removes your handle and avatar from what we display."}</p>

      <p>{"Unlinking cannot undo the following, and we want to be blunt about it:"}</p>

      <ul>
        <li>{"It does not delete anything from the Solana blockchain. Nothing can. The record of your pool payments, picks, claims and refunds stays public forever."}</li>
        <li>{"It does not retrieve the handle-to-wallet pairing from anybody who already saw it, saved it, screenshotted it, or indexed it."}</li>
        <li>{"It does not remove the pairing from search engine caches, web archives, or anyone else's database."}</li>
      </ul>

      <p>{"If you were listed on the public leaderboard, treat that wallet as permanently identified."}</p>

      <h2>{"Children"}</h2>

      <p>{"Commish is not intended for children and is not directed at them. You must be at least "}<Tbc>{"minimum age, and whether it varies by jurisdiction, aligned with the position taken in the Terms"}</Tbc>{" to use it."}</p>

      <p>{"We do not knowingly collect personal information from children. If you believe a child has linked an X account to a wallet on our site, contact us at "}<Tbc>{"contact address"}</Tbc>{" and we will delete the record we hold. We cannot delete anything from the blockchain."}</p>

      <h2>{"Where your data is processed"}</h2>

      <p>{"Our providers operate globally and may process data outside the country you live in. "}<Tbc>{"processing locations, the transfer mechanism relied on for UK and EEA transfers, such as Standard Contractual Clauses or the UK Addendum, and whether data processing agreements are in place with Cloudflare, Vercel and Helius."}</Tbc></p>

      <h2>{"If you are in the UK or the EEA"}</h2>

      <p>{"This section applies if UK GDPR or EU GDPR applies to you."}</p>

      <p><strong>{"Controller."}</strong>{" "}<Tbc>{"the controller entity, and whether an Article 27 representative is required."}</Tbc></p>

      <p><strong>{"What we process and why."}</strong></p>

      <div className="overflow-x-auto">
      <table>
        <thead>
          <tr><th>{"What"}</th><th>{"Why"}</th><th>{"Legal basis"}</th></tr>
        </thead>
        <tbody>
          <tr><td>{"Wallet address, as displayed in a pool"}</td><td>{"To run the pool you joined and show its state"}</td><td><Tbc>{"contract, or legitimate interests in operating the service"}</Tbc></td></tr>
          <tr><td>{"X provider id, handle, avatar URL, linked wallet, timestamp"}</td><td>{"To show your handle in your league instead of a raw address"}</td><td>{"Consent"}</td></tr>
          <tr><td>{"Public leaderboard listing"}</td><td>{"To publish a leaderboard you asked to be on"}</td><td>{"Consent, given separately"}</td></tr>
          <tr><td>{"Technical connection data handled by our hosting providers"}</td><td>{"To deliver the site and keep it secure"}</td><td>{"Legitimate interests"}</td></tr>
        </tbody>
      </table>
      </div>

      <p><strong>{"Your rights."}</strong>{" Subject to conditions in the law, you have the right to ask for access to your personal data, correction, erasure, restriction of processing, portability, and to object to processing based on legitimate interests. Where we rely on consent, you can withdraw it at any time, and withdrawing it does not affect what was lawful before."}</p>

      <p>{"Because we hold so little, most requests are simple. If you ask us to delete what we hold, the practical answer is usually that we delete your X link record."}</p>

      <p><strong>{"The honest limit on erasure."}</strong>{" We cannot erase anything from the Solana blockchain. We do not control it, we did not create the record on our own, and no one has the ability to delete or alter it. If your erasure request covers on-chain data, we will tell you plainly that we cannot comply as to that data, and explain what we did delete. "}<Tbc>{"how the operator wishes to characterise this in law, and whether the wallet address as processed by us is treated as personal data. A lawyer should settle the position on immutable ledgers and Article 17."}</Tbc></p>

      <p><strong>{"Complaints."}</strong>{" You can complain to your local supervisory authority. In the UK that is the Information Commissioner's Office. "}<Tbc>{"lead supervisory authority in the EU, if one applies."}</Tbc></p>

      <p><strong>{"How to ask."}</strong>{" Contact "}<Tbc>{"contact address"}</Tbc>{". "}<Tbc>{"how identity is verified for a request when we hold no account, and whether a signed message from the wallet is an acceptable proof."}</Tbc></p>

      <h2>{"If you are in California"}</h2>

      <p>{"This section applies if the California Consumer Privacy Act, as amended, applies to you."}</p>

      <p><strong>{"Categories we collect."}</strong>{" Identifiers, which for us means a wallet address and, if you link one, an X provider id, handle and avatar URL. Internet or network activity information processed by our hosting providers in the ordinary course of serving the site. We do not collect Social Security numbers, financial account credentials, precise geolocation from you, biometric data, or the contents of your communications."}</p>

      <p><strong>{"Sources."}</strong>{" From you and from your wallet directly, from the public blockchain, and from X if you choose to link."}</p>

      <p><strong>{"Purposes."}</strong>{" To run pools, to show handles in leagues where you asked us to, to publish a leaderboard where you asked us to, and to keep the site available and secure."}</p>

      <p><strong>{"Sale or sharing."}</strong>{" We do not sell personal information and we do not share it for cross-context behavioural advertising. We have not done so in the preceding twelve months. We do not knowingly sell or share the personal information of consumers under 16."}</p>

      <p><strong>{"Sensitive personal information."}</strong>{" We do not collect it, and therefore do not use it for purposes that would trigger a right to limit."}</p>

      <p><strong>{"Your rights."}</strong>{" You have the right to know what we collect, to access it, to delete it, to correct it, to opt out of sale or sharing (which does not arise here, because we do neither), and not to be discriminated against for exercising any of these. You may use an authorised agent."}</p>

      <p><strong>{"The same honest limit."}</strong>{" A deletion request reaches what we hold in our own database. It cannot reach the blockchain, and it cannot reach a handle-to-wallet pairing that other people already copied from a public leaderboard."}</p>

      <p><strong>{"How to ask."}</strong>{" Contact "}<Tbc>{"contact address and, if required, a toll-free number or the basis for not providing one"}</Tbc>{"."}</p>

      <h2>{"Security"}</h2>

      <p>{"We take reasonable care with the small amount of data we hold. We should also be straight with you about the wider picture, because it is part of an honest privacy statement."}</p>

      <p>{"The Solana program that holds pool money has never been audited. It is currently deployed to Solana devnet with test tokens only, so no real money is involved at the moment. The program's upgrade authority is a single private key held by us, which in principle could be used to deploy new program code. We intend to move that authority to a 2-of-3 multisig and then discard it, but that has not happened yet. The Terms cover what this means for your money. We mention it here because you should not form a view about trusting this site without knowing it."}</p>

      <p>{"No method of transmission or storage is completely secure, and we cannot guarantee absolute security."}</p>

      <h2>{"Changes to this policy"}</h2>

      <p>{"If we change what we collect or who we send it to, we will update this page. If the change is significant, we will say so on the site. "}<Tbc>{"whether any form of notice beyond posting is promised, given we hold no email addresses and therefore cannot email anyone."}</Tbc></p>

      <h2>{"Contact"}</h2>

      <p><Tbc>{"contact email or postal address for privacy questions and rights requests."}</Tbc></p>

      <p><Tbc>{"governing law and jurisdiction for this policy, aligned with the Terms."}</Tbc></p>

      <h2>{"About the NFL and other names"}</h2>

      <p>{"We use city names and standard team abbreviations factually. We do not use NFL or team logos, wordmarks or other marks. We are not affiliated with, endorsed by or sponsored by the NFL, any team, ESPN, Yahoo or Sleeper."}</p>
    </LegalPage>
  );
}
