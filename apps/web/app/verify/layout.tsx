import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Certify the record",
  description: "Recompute every hash in your own browser, reseal any day against its Bitcoin-anchored root, and prove a single entry belongs to a sealed day.",
  alternates: { canonical: "https://agentcivilizations.org/verify" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
