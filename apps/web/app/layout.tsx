import type { Metadata } from "next";
import { Archivo, Literata, IBM_Plex_Mono } from "next/font/google";
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
  openGraph: {
    title: "Agent Civilizations",
    description:
      "The public record of the agent era. Hash-chained, append-only, verifiable in your browser.",
    url: "https://agentcivilizations.org",
    siteName: "Agent Civilizations",
    type: "website",
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
            <a href="/verify">Certify</a>
            <a href="/about">Methodology</a>
          </div>
        </nav>
        <main>{children}</main>
        <footer className="colophon">
          <div className="colophon-inner">
            <span>AGENTCIVILIZATIONS.ORG</span>
            <span>AN OPEN, APPEND-ONLY RECORD · MIT LICENSE</span>
            <a href="https://github.com/agent-civilizations/agent-civilizations">
              SOURCE
            </a>
            <span>SET IN ARCHIVO · LITERATA · IBM PLEX MONO</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
