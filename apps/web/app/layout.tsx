import type { Metadata } from "next";
import { Archivo, Literata, IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import { Ticker } from "@/components/Ticker";
import "./globals.css";

// The three registers. The wdth axis on Archivo must be requested
// explicitly or Expanded silently degrades to normal width.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});
const literata = Literata({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-literata",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Agent Civilizations — the public record of the agent era",
    template: "%s · Agent Civilizations",
  },
  description:
    "An open, tamper-evident ledger of AI-agent-civilization events — coordinated agent behavior, agent-driven incidents, and emergent agent communities — verifiable in your browser.",
  metadataBase: new URL("https://agentcivilizations.org"),
  alternates: {
    canonical: "https://agentcivilizations.org/",
    types: { "application/atom+xml": "https://agentcivilizations.org/feed.xml" },
  },
  openGraph: {
    title: "Agent Civilizations",
    description:
      "The public record of the agent era. Hash-chained, append-only, verifiable in your browser.",
    url: "https://agentcivilizations.org",
    siteName: "Agent Civilizations",
    type: "website",
    images: [
      { url: "/og.svg", width: 1200, height: 630, alt: "Agent Civilizations" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Civilizations",
    description:
      "The public record of the agent era. Verifiable in your browser.",
    images: ["/og.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${literata.variable} ${plexMono.variable}`}
    >
      <body>
        {/* Said once, for anything that reads structure rather than prose:
            what this is, who publishes it, and that it is free to use. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://agentcivilizations.org/#organization",
                  name: "Agent Civilizations",
                  url: "https://agentcivilizations.org",
                  description:
                    "An open, hash-chained public register of events in which AI agents coordinate, attack, or form persistent communities.",
                  sameAs: ["https://github.com/spacecomputer/agentcivilizations"],
                },
                {
                  "@type": "WebSite",
                  "@id": "https://agentcivilizations.org/#website",
                  url: "https://agentcivilizations.org",
                  name: "Agent Civilizations",
                  publisher: { "@id": "https://agentcivilizations.org/#organization" },
                  license: "https://creativecommons.org/publicdomain/zero/1.0/",
                  isAccessibleForFree: true,
                  inLanguage: "en",
                },
              ],
            }),
          }}
        />
        <link
          rel="alternate"
          type="application/atom+xml"
          title="Agent Civilizations — Atom feed"
          href="/feed.xml"
        />
        <header className="masthead">
          <div className="masthead-inner">
            <a href="/" className="wordmark">
              Agent Civilizations
            </a>
            <Ticker />
          </div>
        </header>
        <nav className="sitenav" aria-label="Primary">
          <div className="sitenav-inner">
            <a href="/">The Register</a>
            <a href="/civilizations">Civilizations</a>
            <a href="/survey">The Survey</a>
            <a href="/verify">Certify</a>
            <a href="/stats">Stats</a>
            <a href="/about">Methodology</a>
            <a href="/reference">Reference</a>
          </div>
        </nav>
        <main>{children}</main>
        <Analytics />
        <footer className="colophon">
          <div className="colophon-inner">
            <span>AGENTCIVILIZATIONS.ORG</span>
            <span>AN OPEN, APPEND-ONLY RECORD · MIT LICENSE</span>
            <a href="https://github.com/spacecomputer/agentcivilizations">
              SOURCE
            </a>
            <a href="/feed.xml">ATOM FEED</a>
            <a href="/corrections.xml">CORRECTIONS</a>
            <span>SET IN ARCHIVO · LITERATA · IBM PLEX MONO</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
