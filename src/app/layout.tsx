import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/Providers";
import "./globals.css";

/* Self-hosted, not Google-hosted. Two reasons: a font request to a third party
 * on every page load is a privacy leak and a render-blocking dependency we do
 * not control, and `next/font/local` inlines the metrics so there is zero
 * layout shift when the face swaps in. */
/* THE DISPLAY FACE. Silkscreen: a bitmap face, and the reason the headings on
 * this site are made of squares.
 *
 * IT REPLACED ANTON, which was the last thing here still speaking the old
 * language. The comment below this one used to say Anton was the cartridge
 * label and the bitmap face was what was printed on the screen inside it —
 * genuinely how NES sports titles worked, heavy condensed poster type on the
 * box and bitmap type in the game. That pairing was right for a site with one
 * blocky panel on it. It stopped being right once the attract loop, the
 * sprites, the field, the playable drive and the profile header were all
 * drawn from rectangles: at that point the smooth condensed headline was the
 * odd one out, and the box was the only thing left that was not the screen.
 *
 * WHY NOT JUST USE PRESS START 2P for the headings and keep one bitmap face.
 * Because it is exactly one em wide per character, so a 24px section heading
 * set in it has to come down to about 10px to fit the same column — which is
 * the size the rails and labels already use, and a heading indistinguishable
 * from a label is not a heading. Silkscreen runs about 0.7em per character,
 * measured, which is what makes it work at size.
 *
 * The two are still doing different jobs, which is what keeps this a system
 * rather than one gimmick: Silkscreen is the voice, Press Start 2P is the
 * furniture.
 *
 * SIL Open Font License 1.1, carried in ./fonts/silkscreen-OFL.txt. */
const silkscreen = localFont({
  src: [
    { path: "./fonts/silkscreen.woff2", weight: "400", style: "normal" },
    { path: "./fonts/silkscreen-bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-silkscreen",
  display: "swap",
});

const grotesk = localFont({
  src: "./fonts/space-grotesk.woff2",
  variable: "--font-grotesk",
  weight: "300 700",
  display: "swap",
});

/* The furniture face: rails, tile labels, buttons, counters.
 *
 * IT IS RATIONED, and the rules live next to --font-matrix in globals.css.
 * Labels only, never language. The moment it sets a sentence, a paragraph, an
 * error message or a legal page, this stops looking like a design and starts
 * looking like a game jam. Headings are not language in that sense — they are
 * three or four words — but they are not labels either, which is why they go
 * to Silkscreen above and not here.
 *
 * Latin subset, vendored rather than requested from Google at page load, for
 * the same reason as the two above. 12KB. */
const pressStart = localFont({
  src: "./fonts/press-start-2p.woff2",
  variable: "--font-press-start",
  weight: "400",
  display: "swap",
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://commish.fun";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  /* Belt and braces with src/app/robots.ts, because the two are read by
   * different things at different moments. robots.txt is a request not to
   * CRAWL and is fetched once; this tag is a request not to INDEX and travels
   * with every page, so it still applies to a URL a crawler reached from
   * somebody else's link rather than from our site.
   *
   * REMOVE BOTH AT MAINNET. A launched product nobody can find is a bug that
   * announces itself with total silence. `scripts/mainnet-cutover.sh` names
   * them so this is not left to memory. */
  title: {
    default: "Commish · Fantasy dues and pick'em pots, escrowed on-chain",
    template: "%s · Commish",
  },
  /* The one line that shows up in a search result and a pasted link, so it
     says what the product is rather than telling a joke about it. */
  description:
    "Escrow for fantasy league dues and weekly pick'em pots. Every buy-in goes into a vault that is the pool's own account, picks and results are recorded on chain, and the commissioner never holds the money.",
  applicationName: "Commish",
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Commish",
    title: "Commish · Fantasy dues and pick'em pots, escrowed on-chain",
    description:
      "Fantasy league dues and weekly pick'em pots, held in escrow. The commissioner runs the pool and never holds the money.",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Commish" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@Commishfun",
    title: "Commish · Fantasy dues and pick'em pots, escrowed on-chain",
    description:
      "Fantasy league dues and weekly pick'em pots, held in escrow. The commissioner runs the pool and never holds the money.",
    images: ["/brand/og.png"],
  },
  /* TWO ICONS ARE DECLARED AND THE BROWSER PICKS, so both have to be right.
   * Next emits a link for src/app/favicon.ico automatically; this adds a
   * second. Chrome chooses by display scale, so pointing this at the square
   * app tile meant a hard-cornered square appeared at some densities and a
   * rounded icon at others. Both now come from scripts/build-favicon.mjs.
   *
   * `apple` stays SQUARE on purpose: iOS applies its own mask, and an icon
   * that arrives pre-rounded is rounded twice — the corners go transparent and
   * iOS fills them with black. */
  icons: { icon: "/brand/icon-round.png", apple: "/brand/favicon-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#0A100C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${silkscreen.variable} ${grotesk.variable} ${pressStart.variable}`}
    >
      <body className="field-ground min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
