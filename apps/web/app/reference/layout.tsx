import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The reference desk",
  description: "For the press and for research: how to cite the register, how to get the data, how to verify it without us, and the two ways it could mislead you.",
  alternates: { canonical: "https://agentcivilizations.org/reference" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
