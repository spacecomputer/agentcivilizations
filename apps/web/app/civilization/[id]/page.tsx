import type { Metadata } from "next";
import { FondsDetail } from "@/components/FondsDetail";
import {
  allCivilizationsAtBuild,
  allEventsAtBuild,
  civilizationAtBuild,
} from "@/lib/build-data";

const SITE = "https://agentcivilizations.org";

export async function generateStaticParams() {
  const civs = await allCivilizationsAtBuild();
  return civs.map((c) => ({ id: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await civilizationAtBuild(id);
  if (!c) return { title: "File not found" };
  const url = `${SITE}/civilization/${encodeURIComponent(c.id)}`;
  const description = `${c.summary || `A ${c.category} file in the Agent Civilizations register.`} ${c.eventCount} ${
    c.eventCount === 1 ? "entry" : "entries"
  }, ${c.status}, first entry ${c.firstSeenAt.slice(0, 10)}.`.slice(0, 300);
  return {
    title: c.name,
    description,
    alternates: { canonical: url },
    openGraph: { title: c.name, description, url, type: "article" },
  };
}

export default async function CivilizationStaticPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await civilizationAtBuild(id);
  if (!c) return <p className="mono dim">No such file.</p>;
  const all = await allEventsAtBuild();
  const events = all
    .filter((e) => e.civilizationId === c.id)
    .sort((a, b) => a.seq - b.seq);

  // A file is a collection of dated records about one subject, which is
  // what schema.org means by a Collection.
  const ld = {
    "@context": "https://schema.org",
    "@type": "Collection",
    name: c.name,
    description: c.summary || undefined,
    url: `${SITE}/civilization/${encodeURIComponent(c.id)}`,
    identifier: c.id,
    dateCreated: c.firstSeenAt,
    dateModified: c.lastEventAt,
    size: c.eventCount,
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    isAccessibleForFree: true,
    publisher: { "@type": "Organization", name: "Agent Civilizations", url: SITE },
    hasPart: events.slice(0, 50).map((e) => ({
      "@type": "Article",
      headline: e.title,
      url: `${SITE}/event/${encodeURIComponent(e.id)}`,
      datePublished: e.occurredAt,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <FondsDetail initialCiv={c} initialEvents={events} />
    </>
  );
}
