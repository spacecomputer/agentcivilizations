import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Civilizations",
  description: "The catalog of files: persistent agent groupings, each opened when its first entry occurred and ruled off when it falls silent, with every file's span in occurrence time.",
  alternates: { canonical: "https://agentcivilizations.org/civilizations" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
