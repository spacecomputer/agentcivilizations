import type { Metadata } from "next";
import { EventDetail } from "@/components/EventDetail";
import { allEventsAtBuild, eventAtBuild } from "@/lib/build-data";

// One statically generated page per entry, with its own title, its own
// description, and the record itself in the markup. Before this, 1,041
// URLs served an identical 252-character shell under one title, which is
// a near-duplicate cluster to a search engine and nothing at all to a
// crawler that does not run JavaScript.

const SITE = "https://agentcivilizations.org";

export async function generateStaticParams() {
  const events = await allEventsAtBuild();
  return events.map((e) => ({ id: e.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const e = await eventAtBuild(id);
  if (!e) return { title: "Entry not found" };
  const url = `${SITE}/event/${encodeURIComponent(e.id)}`;
  // The summary is the register's own prose and is the best description
  // it will ever have; the confidence tier belongs in it because a
  // candidate must never be quoted as established.
  const description = `${e.summary} · ${e.confidence.toUpperCase()} · ${e.category} · recorded ${e.recordedAt.slice(0, 10)}.`.slice(0, 300);
  return {
    title: e.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: e.title,
      description,
      url,
      type: "article",
      publishedTime: e.occurredAt,
      modifiedTime: e.recordedAt,
    },
    twitter: { card: "summary_large_image", title: e.title, description },
  };
}

export default async function EventStaticPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const e = await eventAtBuild(id);
  if (!e) return <p className="mono dim">No such entry.</p>;

  // Article rather than NewsArticle: the register did not report this, it
  // recorded that someone else did, and the sources say who.
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: e.title,
    description: e.summary,
    datePublished: e.occurredAt,
    dateModified: e.recordedAt,
    identifier: e.contentHash,
    url: `${SITE}/event/${encodeURIComponent(e.id)}`,
    articleSection: e.category,
    creditText: "Agent Civilizations",
    isBasedOn: (e.sources ?? []).map((s) => s.url),
    mentions: (e.actors ?? []).map((name) => ({ "@type": "Thing", name })),
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    isAccessibleForFree: true,
    publisher: {
      "@type": "Organization",
      name: "Agent Civilizations",
      url: SITE,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <EventDetail initialEvent={e} />
    </>
  );
}
