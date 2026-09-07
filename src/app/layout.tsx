import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/Providers";
import "./globals.css";

/* Self-hosted, not Google-hosted. Two reasons: a font request to a third party
 * on every page load is a privacy leak and a render-blocking dependency we do
 * not control, and `next/font/local` inlines the metrics so there is zero
 * layout shift when the face swaps in. */
const anton = localFont({
  src: "./fonts/anton.woff2",
  variable: "--font-anton",
  weight: "400",
  display: "swap",
});

const grotesk = localFont({
  src: "./fonts/space-grotesk.woff2",
  variable: "--font-grotesk",
  weight: "300 700",
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
  robots: { index: false, follow: false, nocache: true },
  title: {
    default: "Commish · NFL football pools, escrowed on-chain",
    template: "%s · Commish",
  },
  /* The one line that shows up in a search result and a pasted link, so it
     says what the product is rather than telling a joke about it. */
  description:
    "Escrow for NFL football pools. Members pay into a vault that is the pool's own account, picks and results are recorded on chain, and the commissioner never holds the money.",
  applicationName: "Commish",
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Commish",
    title: "Commish · NFL football pools, escrowed on-chain",
    description:
      "Survivor pools now, league dues next. The commissioner runs the pool and never holds the money.",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Commish" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@Commishfun",
    title: "Commish · NFL football pools, escrowed on-chain",
    description:
      "Survivor pools now, league dues next. The commissioner runs the pool and never holds the money.",
    images: ["/brand/og.png"],
  },
  icons: { icon: "/brand/appicon.png", apple: "/brand/favicon-180.png" },
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
    <html lang="en" className={`${anton.variable} ${grotesk.variable}`}>
      <body className="field-ground min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
