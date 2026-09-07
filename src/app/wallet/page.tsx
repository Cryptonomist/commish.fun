/* How to get a wallet, for somebody who has never had one.
 *
 * This page exists because of how people arrive at a pool. Somebody shares a
 * link into a group chat, a friend opens it on a phone, and the join screen
 * tells them they need a Solana wallet. That is a true sentence and a dead end.
 * Roughly nobody in a football pool has one already.
 *
 * So it is written for that person: no jargon they have not met, one download
 * link that works out their platform for them rather than five links they have
 * to choose between, and an honest note about the two things that surprise
 * people, which are the recovery phrase and needing a little SOL for fees.
 *
 * The download link is phantom.com/download rather than a store URL per
 * platform. That page detects the device and sends them to the right place,
 * and it cannot go stale the way a hardcoded App Store id can.
 */

import type { Metadata } from "next";

import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Getting a wallet",
  description:
    "How to install a Solana wallet on a PC, a Mac, an iPhone or an Android phone, and what you need in it before you join a pool.",
};

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
const IS_MAINNET = CLUSTER === "mainnet-beta" || CLUSTER === "mainnet";

const DOWNLOAD = "https://phantom.com/download";
const CHROME_EXT =
  "https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa";

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
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-night-3 font-mono text-xs text-cream-dim">
        {n}
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="font-bold text-cream">{title}</p>
        <div className="text-sm leading-relaxed text-cream-dim">{children}</div>
      </div>
    </li>
  );
}

function Platform({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-night-3 bg-night-2 p-4">
      <h3 className="text-sm font-bold text-cream">{title}</h3>
      <div className="text-sm leading-relaxed text-cream-dim">{children}</div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 sm:px-8">
      <SiteNav />

      <main className="flex flex-col gap-10 py-10">
        <div className="flex flex-col gap-3">
          <h1 className="display text-2xl uppercase sm:text-3xl">
            Getting a wallet
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-cream-dim">
            A pool holds its money on Solana, so you need a Solana wallet to
            join one. Phantom is the usual choice and it is free. Ten minutes,
            once.
          </p>
        </div>

        {/* PHANTOM'S OWN MARK, not a redrawing of it.
            public/wallets/phantom.svg is the file Phantom publishes for exactly
            this purpose — their integration docs say "for most dapp
            integrations, we recommend using the following icon". Redrawing
            somebody's trademark by hand is how you end up with a nearly-right
            ghost that reads as a knock-off, and the whole job of this icon is
            to be recognised.

            It is square, with no corner radius. Phantom's source file has none
            either; every other UI rounds it on the way in, and this one does
            not round anything.

            The button also stopped being the last rounded sans-serif control on
            the site while I was here. */}
        <a
          href={DOWNLOAD}
          target="_blank"
          rel="noreferrer"
          className="btn btn-primary self-start gap-2.5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/wallets/phantom.svg"
            alt=""
            width={20}
            height={20}
            className="shrink-0"
          />
          GET PHANTOM
        </a>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-cream">On your device</h2>
          <p className="text-sm text-cream-dim">
            That page has the download for every platform. If you would rather
            know what to expect first:
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Platform title="Windows PC">
              Phantom is a browser extension, not a program you install. Use
              Chrome, Brave or Edge and add it from the{" "}
              <a
                className="text-action underline"
                href={CHROME_EXT}
                target="_blank"
                rel="noreferrer"
              >
                Chrome Web Store
              </a>
              . Pin it to your toolbar so you can find it again.
            </Platform>

            <Platform title="Mac">
              Same as a PC, and the same extension. Chrome, Brave and Edge all
              work on a Mac. If you only use Safari, install Chrome for this or
              use your phone instead, which is easier anyway.
            </Platform>

            <Platform title="iPhone">
              Get the Phantom app from the App Store. Then open pool links
              inside Phantom&apos;s own browser, using the browser tab in the
              app rather than Safari. A link opened in Safari will not find
              your wallet.
            </Platform>

            <Platform title="Android">
              Get the Phantom app from Google Play. As on an iPhone, open pool
              links in Phantom&apos;s built-in browser rather than Chrome, or
              the page will not see your wallet.
            </Platform>
          </div>

          <p className="rounded-xl border border-night-3 bg-night-2 p-4 text-sm leading-relaxed text-cream-dim">
            That last point catches almost everybody on a phone. A wallet app
            can only talk to a website opened inside that app. If a pool page
            says no wallet was found and you know you installed one, you are
            probably in the wrong browser.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-cream">Setting it up</h2>
          <ol className="flex flex-col gap-5">
            <Step n={1} title="Create a new wallet">
              Phantom offers to make one for you. Take that option unless you
              already have a wallet somewhere else.
            </Step>
            <Step n={2} title="Write down the recovery phrase">
              It shows you twelve words. Write them on paper and keep them
              somewhere safe. Anybody with those words has your money, and if
              you lose them nobody can get it back for you. Not Phantom, not
              us. This is the part worth slowing down for.
            </Step>
            <Step n={3} title="Add a little SOL">
              Solana charges a tiny fee for each transaction, paid in SOL, and
              joining a pool creates a couple of small accounts. About 0.01 SOL
              covers it comfortably. You can buy some inside Phantom.
            </Step>
            <Step n={4} title="Add the buy-in">
              Pools are paid in USDC, a dollar-pegged token. You need the
              buy-in amount plus nothing else. Phantom can swap or buy it
              directly.
            </Step>
            <Step n={5} title="Open the pool link and press Connect">
              The pool page tells you exactly what is missing if anything is,
              so you can stop guessing.
            </Step>
          </ol>
        </section>

        {!IS_MAINNET ? (
          <section className="flex flex-col gap-3 rounded-xl border border-out/40 bg-out/10 p-5">
            <h2 className="text-lg font-bold text-cream">
              Right now this runs on test money
            </h2>
            <p className="text-sm leading-relaxed text-cream-dim">
              Commish is on Solana devnet at the moment, which is a practice
              network. The tokens there have no value and you cannot buy them.
              Steps 3 and 4 above do not apply yet, and you do not need to
              spend anything to try this.
            </p>
            <p className="text-sm leading-relaxed text-cream-dim">
              You will need to switch Phantom to Devnet: Settings, then
              Developer Settings, then turn on Testnet Mode and pick Devnet.
              Remember to switch it back afterwards.
            </p>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-cream">Worth knowing</h2>
          <p className="text-sm leading-relaxed text-cream-dim">
            Connecting a wallet to a site does not give it permission to spend
            anything. Every payment is a separate thing you approve, and you
            see the amount before you approve it.
          </p>
          <p className="text-sm leading-relaxed text-cream-dim">
            Nobody from Commish will ever ask for your recovery phrase. Anybody
            who does is stealing from you, including anybody claiming to be us.
          </p>
          <p className="text-sm leading-relaxed text-cream-dim">
            Other Solana wallets work too. Solflare and Backpack both do. We
            point at Phantom because it is the one most people already have.
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
