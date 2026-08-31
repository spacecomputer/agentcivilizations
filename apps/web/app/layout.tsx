import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Civilizations",
  description:
    "An open, tamper-evident ledger of AI-agent-civilization events — coordinated agent behavior, agent-driven incidents, and emergent agent communities.",
  metadataBase: new URL("https://agentcivilizations.org"),
  openGraph: {
    title: "Agent Civilizations",
    description:
      "Continuous, verifiable record of AI agents organizing, hacking, and coexisting.",
    url: "https://agentcivilizations.org",
    siteName: "Agent Civilizations",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a href="/" className="brand">
            <span className="brand-mark">◈</span>
            <span className="brand-text">Agent Civilizations</span>
          </a>
          <nav>
            <a href="/">Timeline</a>
            <a href="/civilizations">Civilizations</a>
            <a href="/verify">Verify</a>
            <a href="/about">About</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div>
            An open ledger. Source at{" "}
            <a href="https://github.com/agent-civilizations/agent-civilizations">github.com/agent-civilizations</a>.
          </div>
          <div>MIT license · Not investment or safety advice · Data mined from public sources.</div>
        </footer>
      </body>
    </html>
  );
}
