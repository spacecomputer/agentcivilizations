import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Survey",
  description: "Three plates over the register: where files sit on the map by their party of record, which files share named actors, and the cadence of entries.",
  alternates: { canonical: "https://agentcivilizations.org/survey" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
