import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Statistics",
  description: "The register's own figures: entries, files, coverage by source language, scan activity, and whether the register is still recording.",
  alternates: { canonical: "https://agentcivilizations.org/stats" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
