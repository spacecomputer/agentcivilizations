import type { Metadata } from "next";
import { earliestOccurrenceAtBuild, latestSealedDayAtBuild } from "@/lib/build-data";

const SITE = "https://agentcivilizations.org";

export const metadata: Metadata = {
  title: "The reference desk",
  description:
    "For the press and for research: how to cite the register, how to get the data, how to verify it without us, and the two ways it could mislead you.",
  alternates: { canonical: `${SITE}/reference` },
};

// The Dataset block belongs here rather than in the page, because the page
// is a client component: rendered at build it had no fetched values yet, so
// it emitted a snapshot URL containing the literal string YYYY-MM-DD. A
// dataset record pointing at a 404 is worse than no dataset record, since
// something will follow it. Built here, the day is a day that exists.
export default async function ReferenceLayout({ children }: { children: React.ReactNode }) {
  const [day, earliest] = await Promise.all([
    latestSealedDayAtBuild(),
    earliestOccurrenceAtBuild(),
  ]);
  const snapshot = day ? `${SITE}/api/snapshot/${day}.json` : null;

  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Agent Civilizations register",
    description:
      "An open, hash-chained register of publicly reported events in which AI agents coordinate, attack, or form persistent communities. Every entry cites its sources, is sealed daily into a Merkle root, and is anchored to Bitcoin through OpenTimestamps. Entries carry one of four categories and one of two confidence tiers; a candidate entry rests on a single uncorroborated report.",
    url: `${SITE}/reference`,
    sameAs: SITE,
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "Agent Civilizations", url: SITE },
    publisher: { "@type": "Organization", name: "Agent Civilizations", url: SITE },
    ...(earliest && { temporalCoverage: `${earliest.slice(0, 10)}/..` }),
    ...(snapshot && { identifier: snapshot }),
    measurementTechnique:
      "Continuous ingestion of public feeds, classified against a published taxonomy, hash-chained and sealed daily.",
    keywords: [
      "AI agents",
      "multi-agent systems",
      "AI security incidents",
      "agent coordination",
      "transparency log",
      "hash chain",
      "Merkle tree",
    ],
    distribution: [
      ...(snapshot
        ? [{
            "@type": "DataDownload",
            name: `Sealed snapshot, ${day}`,
            encodingFormat: "application/json",
            contentUrl: snapshot,
          }]
        : []),
      { "@type": "DataDownload", name: "Headline figures", encodingFormat: "application/json", contentUrl: `${SITE}/api/figures.json` },
      { "@type": "DataDownload", name: "Headline figures", encodingFormat: "text/csv", contentUrl: `${SITE}/api/figures.csv` },
      { "@type": "DataDownload", name: "Entries feed", encodingFormat: "application/atom+xml", contentUrl: `${SITE}/feed.xml` },
      { "@type": "DataDownload", name: "Corrections feed", encodingFormat: "application/atom+xml", contentUrl: `${SITE}/corrections.xml` },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dataset) }}
      />
      {children}
    </>
  );
}
