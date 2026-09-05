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
  title: {
    default: "Commish — Survivor pools, escrowed on-chain",
    template: "%s · Commish",
  },
  description:
    "Your Survivor pool, out of that one guy's Venmo. Buy-ins escrowed on-chain, picks locked at kickoff, last one standing takes the pot.",
  applicationName: "Commish",
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Commish",
    title: "Commish — Survivor pools, escrowed on-chain",
    description:
      "Buy-ins escrowed on-chain. Picks locked at kickoff. Last one standing takes the pot.",
    images: [{ url: "/brand/launch.png", width: 1200, height: 675 }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@Commishfun",
    title: "Commish — Survivor pools, escrowed on-chain",
    description:
      "Buy-ins escrowed on-chain. Picks locked at kickoff. Last one standing takes the pot.",
    images: ["/brand/launch.png"],
  },
  icons: { icon: "/brand/appicon.png", apple: "/brand/appicon.png" },
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
