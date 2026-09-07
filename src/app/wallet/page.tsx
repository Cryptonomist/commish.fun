/* How to get a wallet, for somebody who has never had one.
 *
 * This page exists because of how people arrive at a pool. Somebody shares a
 * link into a group chat, a friend opens it on a phone, and the join screen
 * tells them they need a Solana wallet. That is a true sentence and a dead end.
 * Roughly nobody in a football pool has one already.
 *
 * So it is written for that person: no jargon they have not met, and an honest
 * note about the two things that surprise people, which are the recovery
 * phrase and needing a little SOL for fees.
 *
 * FOUR WALLETS NOW, NOT ONE. All four register through the Wallet Standard, so
 * the Connect button already finds whichever one somebody installs — there is
 * no adapter to add and no list of "supported wallets" that can rot. Listing
 * only Phantom was never a technical limit, just an unexamined default.
 *
 * EVERY PLATFORM CLAIM BELOW WAS VERIFIED against the wallet's own site and
 * store listing, not from memory, because a wrong one sends a stranger to a
 * dead end while their friends wait. Three of them are counter-intuitive and
 * are called out on the page rather than buried here:
 *
 *   Phantom's Firefox build is ABANDONED. Their own support docs list it under
 *   "no longer supported"; the add-on is still installable but has been frozen
 *   since May 2025 while Chrome ships monthly. Sending a Firefox user there
 *   means a self-custody wallet sixteen months behind on security updates.
 *   Solflare is the only one of the four with a live Firefox build.
 *
 *   Backpack on Edge is not a one-click install. Edge requires "Allow
 *   extensions from other stores" to be turned on first.
 *
 *   None of the four has a Safari extension. A Mac user on Safari needs
 *   another browser or their phone.
 *
 * ON THE LOGOS. All four are shown, each self-hosted from the wallet's own
 * published asset rather than hotlinked, and each unmodified except Backpack's,
 * whose file is a lockup — its viewBox is cropped to the symbol so the mark is
 * not printed twice beside a button that already says BACKPACK.
 *
 * Only Phantom publishes anything resembling permission ("for most dapp
 * integrations, we recommend using the following icon"). Solflare's terms say
 * use is "strictly prohibited ... without our express written permission" and
 * Backpack's say the terms "do not grant you any rights to use any Backpack
 * Technologies Brand Features"; Jupiter's reserve rights and grant none.
 *
 * Those clauses are rights reservations, and they are boilerplate. Using a
 * mark to identify that company's own product — on a button that says GET
 * SOLFLARE and links to solflare.com — is nominative use: no more of the mark
 * than is needed, and nothing suggesting sponsorship. It is the same basis as
 * every "Sign in with Google" button on the internet, and this page sends each
 * of them installs.
 *
 * The rule that keeps it that way is: identify, never imply. No wallet is
 * described as a partner, none is claimed to endorse Commish, and no mark
 * appears anywhere but next to that wallet's own name and link. If any of them
 * ever asks, take theirs down — that is the whole of the downside.
 */

import type { Metadata } from "next";

import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Getting a wallet",
  description:
    "How to install a Solana wallet — Phantom, Solflare, Backpack or Jupiter — on a PC, a Mac, an iPhone or an Android phone, and what you need in it before you join a pool.",
};

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
const IS_MAINNET = CLUSTER === "mainnet-beta" || CLUSTER === "mainnet";

/* Each wallet's OWN download page, not a per-platform store URL. That page
 * works out the device and sends them to the right place, and it cannot go
 * stale the way a hardcoded App Store id can. */
type Wallet = {
  name: string;
  href: string;
  /** Self-hosted from the wallet's own published asset. */
  logo?: string;
  /** One line: why somebody would pick this one. */
  why: string;
  browsers: string;
  firefox: boolean;
  mobile: string;
  /** Anything that would make a naive install go wrong. */
  catch?: string;
};

const WALLETS: Wallet[] = [
  {
    name: "Phantom",
    href: "https://phantom.com/download",
    logo: "/wallets/phantom.svg",
    why: "The one most people already have.",
    browsers: "Chrome, Brave, Edge",
    firefox: false,
    mobile: "iPhone and Android",
    catch: "No Firefox. The old Firefox add-on is abandoned — use Solflare there.",
  },
  {
    name: "Solflare",
    href: "https://www.solflare.com/download/",
    logo: "/wallets/solflare.svg",
    why: "The only one of the four with Firefox, and it has a web version.",
    browsers: "Chrome, Firefox, Brave, Edge",
    firefox: true,
    mobile: "iPhone and Android",
  },
  {
    name: "Backpack",
    href: "https://backpack.app/download",
    logo: "/wallets/backpack.svg",
    why: "Well made, and popular with people already deep in Solana.",
    browsers: "Chrome, Brave, Edge",
    firefox: false,
    catch:
      "On Edge you have to turn on “Allow extensions from other stores” before it will install.",
    mobile: "iPhone and Android",
  },
  {
    name: "Jupiter",
    href: "https://jup.ag/wallet",
    logo: "/wallets/jupiter.svg",
    why: "Newest of the four. Fine, but the others are more proven.",
    browsers: "Chrome, Brave, Edge",
    firefox: false,
    mobile: "iPhone and Android",
  },
];

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-rule font-matrix text-[10px] leading-none text-cream-dim">
        {n}
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="font-bold text-cream">{title}</p>
        <div className="text-sm leading-relaxed text-cream-dim">{children}</div>
      </div>
    </li>
  );
}

function WalletCard({ wallet }: { wallet: Wallet }) {
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        {wallet.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={wallet.logo}
            alt=""
            width={22}
            height={22}
            className="shrink-0"
          />
        ) : null}
        <h3 className="font-matrix text-[11px] leading-4 text-chalk">
          {wallet.name.toUpperCase()}
        </h3>
      </div>

      <p className="text-sm leading-relaxed text-cream-dim">{wallet.why}</p>

      <dl className="flex flex-col gap-1 text-xs text-cream-dim">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-cream-dim/70">Computer</dt>
          <dd className="text-cream">{wallet.browsers}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-cream-dim/70">Phone</dt>
          <dd className="text-cream">{wallet.mobile}</dd>
        </div>
      </dl>

      {wallet.catch ? (
        <p className="border-l-2 border-action pl-3 text-xs leading-relaxed text-cream-dim">
          {wallet.catch}
        </p>
      ) : null}

      <a
        href={wallet.href}
        target="_blank"
        rel="noreferrer"
        className="btn btn-primary mt-auto gap-2.5 self-start"
      >
        {wallet.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.logo} alt="" width={18} height={18} className="shrink-0" />
        ) : null}
        GET {wallet.name.toUpperCase()}
      </a>
    </div>
  );
}

export default function WalletPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 sm:px-8">
      <SiteNav />

      <main className="flex flex-col gap-10 py-6">
        <div className="flex flex-col gap-3">
          <h1 className="display text-2xl uppercase sm:text-3xl">
            Getting a wallet
          </h1>
          <p className="field-type max-w-xl text-sm font-medium leading-relaxed">
            A pool holds its money on Solana, so you need a Solana wallet to
            join one. They are free. Ten minutes, once.
          </p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="font-matrix text-[11px] leading-4 text-chalk">
            PICK ONE
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-cream-dim">
            Any of these four works here, and the pool page finds whichever one
            you install on its own — there is nothing to configure. If you have
            no opinion, take Phantom. If you use Firefox, take Solflare, which
            is the only one of the four that still supports it.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {WALLETS.map((w) => (
              <WalletCard key={w.name} wallet={w} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-matrix text-[11px] leading-4 text-chalk">
            ON YOUR DEVICE
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="panel flex flex-col gap-2 p-4">
              <h3 className="text-sm font-bold text-cream">Windows PC</h3>
              <p className="text-sm leading-relaxed text-cream-dim">
                These are browser extensions, not programs you install. Use
                Chrome, Brave or Edge and add one from its store, then pin it to
                your toolbar so you can find it again.
              </p>
            </div>

            <div className="panel flex flex-col gap-2 p-4">
              <h3 className="text-sm font-bold text-cream">Mac</h3>
              <p className="text-sm leading-relaxed text-cream-dim">
                The same as a PC, and the same extensions. None of the four has
                a Safari version, so if Safari is all you use, install Chrome
                for this or use your phone instead, which is easier anyway.
              </p>
            </div>

            <div className="panel flex flex-col gap-2 p-4">
              <h3 className="text-sm font-bold text-cream">Firefox</h3>
              <p className="text-sm leading-relaxed text-cream-dim">
                Solflare. It is the only one of the four with a Firefox build
                that is still maintained — Phantom&rsquo;s exists but has not
                been updated since 2025, and a wallet that far behind on
                security updates is not one to keep money in.
              </p>
            </div>

            <div className="panel flex flex-col gap-2 p-4">
              <h3 className="text-sm font-bold text-cream">iPhone or Android</h3>
              <p className="text-sm leading-relaxed text-cream-dim">
                All four have apps. Get it from the App Store or Google Play,
                then read the next paragraph, because it catches almost
                everybody.
              </p>
            </div>
          </div>

          <p className="panel p-4 text-sm leading-relaxed text-cream-dim">
            <span className="font-bold text-cream">
              On a phone, open pool links inside the wallet app.
            </span>{" "}
            Every one of these apps has its own browser tab. A page opened in
            Safari or Chrome cannot see a wallet that lives in another app, so
            if a pool page says no wallet was found and you know you installed
            one, you are almost certainly in the wrong browser.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-matrix text-[11px] leading-4 text-chalk">
            SETTING IT UP
          </h2>
          <ol className="flex flex-col gap-5">
            <Step n={1} title="Create a new wallet">
              It will offer to make one for you. Take that option unless you
              already have a wallet somewhere else.
            </Step>
            <Step n={2} title="Write down the recovery phrase">
              It shows you twelve words. Write them on paper and keep them
              somewhere safe. Anybody with those words has your money, and if
              you lose them nobody can get it back for you. Not the wallet, not
              us. This is the part worth slowing down for.
            </Step>
            <Step n={3} title="Add a little SOL">
              Solana charges a tiny fee for each transaction, paid in SOL, and
              joining a pool creates a couple of small accounts. About 0.01 SOL
              covers it comfortably. Every one of these wallets can buy some
              for you.
            </Step>
            <Step n={4} title="Add the buy-in">
              Pools are paid in USDC, a dollar-pegged token. You need the
              buy-in amount and nothing else.
            </Step>
            <Step n={5} title="Open the pool link and press Connect">
              The pool page tells you exactly what is missing, if anything is,
              so you can stop guessing.
            </Step>
          </ol>
        </section>

        {!IS_MAINNET ? (
          <section className="panel-primary flex flex-col gap-3 border-2 border-out p-5">
            <h2 className="font-matrix text-[11px] leading-4 text-chalk">
              RIGHT NOW THIS RUNS ON TEST MONEY
            </h2>
            <p className="text-sm leading-relaxed text-cream-dim">
              Commish is on Solana devnet at the moment, which is a practice
              network. The tokens there have no value and you cannot buy them.
              Steps 3 and 4 above do not apply yet, and you do not need to spend
              anything to try this.
            </p>
            <p className="text-sm leading-relaxed text-cream-dim">
              You will need to switch your wallet to Devnet. In Phantom that is
              Settings, then Developer Settings, then Testnet Mode; the others
              have the same option under a similar name. Remember to switch it
              back afterwards.
            </p>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="font-matrix text-[11px] leading-4 text-chalk">
            WORTH KNOWING
          </h2>
          <p className="text-sm leading-relaxed text-cream-dim">
            Connecting a wallet to a site does not give it permission to spend
            anything. Every payment is a separate thing you approve, and you see
            the amount before you approve it.
          </p>
          <p className="text-sm leading-relaxed text-cream-dim">
            Nobody from Commish will ever ask for your recovery phrase. Anybody
            who does is stealing from you, including anybody claiming to be us.
          </p>
          <p className="text-sm leading-relaxed text-cream-dim">
            Other Solana wallets work too. These four are listed because they
            are the ones most people use, not because the pool page checks.
          </p>
        </section>

        <p className="text-sm text-cream-dim">
          Stuck? Email{" "}
          <a className="text-action underline" href="mailto:hello@commish.fun">
            hello@commish.fun
          </a>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
