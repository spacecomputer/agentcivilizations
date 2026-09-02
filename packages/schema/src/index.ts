import { z } from "zod";

export const Category = z.enum([
  "coordination",
  "security",
  "community",
  "speculative",
]);
export type Category = z.infer<typeof Category>;

export const Confidence = z.enum(["confirmed", "candidate"]);
export type Confidence = z.infer<typeof Confidence>;

export const CivilizationStatus = z.enum(["active", "dormant", "extinct"]);
export type CivilizationStatus = z.infer<typeof CivilizationStatus>;

export const SourceTier = z.enum([
  "primary", // authoritative first-party (arxiv, nvd, github repo, official blog)
  "primary-trade", // named investigative journalist beat (krebs)
  "secondary", // reputable secondary press (The Register, TechCrunch)
  "aggregator", // aggregators that link to primaries (HN, Google News)
  "aggregator-drop", // aggregators whose peerhood must be ignored for corroboration
]);
export type SourceTier = z.infer<typeof SourceTier>;

// Fingerprints are strong external identifiers extracted from a source URL
// or excerpt. Two sources carrying the SAME fingerprint are the same
// underlying report and must not corroborate each other. Two sources with
// disjoint fingerprints may. All fingerprints are inside the hash preimage.
export const Fingerprints = z.object({
  doi: z.string().optional(),
  arxivId: z.string().optional(),
  cve: z.string().optional(),
  gitCommit: z.string().optional(),
  hnItemId: z.string().optional(),
});
export type Fingerprints = z.infer<typeof Fingerprints>;

export const Source = z.object({
  url: z.string().url(),
  domain: z.string(),
  title: z.string(),
  fetchedAt: z.string().datetime(),
  rawExcerpt: z.string().max(2048),
  // -- new corroboration fields (all optional; historical events survive) --
  canonicalUrl: z.string().url().optional(),
  canonicalDomain: z.string().optional(),
  sourceTier: SourceTier.optional(),
  resolvedAt: z.string().datetime().optional(),
  fingerprints: Fingerprints.optional(),
});
export type Source = z.infer<typeof Source>;

export const Event = z.object({
  id: z.string(),
  civilizationId: z.string(),
  title: z.string().max(200),
  summary: z.string().max(1000),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  category: Category,
  confidence: Confidence,
  sources: z.array(Source).min(1),
  actors: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  retracts: z.array(z.string()).default([]),
  retractionReason: z
    .enum(["duplicate", "source-retracted", "misclassified", "hoax"])
    .optional(),
  retractionNotes: z.string().optional(),
  // Event-level identifiers roll up the strongest fingerprint from any
  // source. Inside the hash preimage; optional so historical events
  // survive.
  identifiers: Fingerprints.optional(),
  // When candidate → confirmed happened. Outside the hash preimage — see
  // MUTABLE_FIELDS in @agent-civilizations/verify.
  confidencePromotedAt: z.string().datetime().optional(),
  // When true, this event's confirmation came via cross-civilization
  // corroboration (shared actors across near-miss civ slugs), not
  // within-civ. Outside the hash preimage.
  corroboratedAcrossCivs: z.boolean().optional(),
  contentHash: z.string(),
  prevHash: z.string().nullable(),
  seq: z.number().int().nonnegative(),
});
export type Event = z.infer<typeof Event>;

// ---- origins: where a civilization's sponsors sit on the map ----
//
// Origin is always an inference from actors, never a claim about the
// event. Provenance says how we know: a curated commit, a Wikidata
// headquarters claim (cited by QID), a model's best guess, or nothing —
// "unplaced" is a first-class outcome, shown as such.
export const OriginProvenance = z.enum([
  "curated",
  "wikidata",
  "inferred",
  "unplaced",
]);
export type OriginProvenance = z.infer<typeof OriginProvenance>;

export const Origin = z.object({
  city: z.string().optional(),
  country: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  provenance: OriginProvenance,
  provenanceRef: z.string().optional(), // "wikidata:Q95" | model id | commit
  determinedAt: z.string().datetime(),
});
export type Origin = z.infer<typeof Origin>;

export const ActorKind = z.enum([
  "lab",
  "company",
  "university",
  "government",
  "collective",
  "agent-framework",
  "individual",
  "publication",
  "unknown",
]);
export type ActorKind = z.infer<typeof ActorKind>;

// One document per normalized actor in the `actorRegistry` collection.
export const ActorRegistryEntry = z.object({
  id: z.string(), // actorSlug(name)
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  kind: ActorKind,
  homepage: z.string().url().optional(),
  origin: Origin,
  eventCount: z.number().int().nonnegative().default(0),
  civilizationCount: z.number().int().nonnegative().default(0),
  updatedAt: z.string().datetime(),
});
export type ActorRegistryEntry = z.infer<typeof ActorRegistryEntry>;

export const Sponsor = z.object({
  actorId: z.string(),
  actorName: z.string(),
  mentions: z.number().int().nonnegative(),
  origin: Origin.optional(),
});
export type Sponsor = z.infer<typeof Sponsor>;

export const CivilizationOrigin = z.object({
  // The dominant sponsor's origin; provenance "unplaced" when no sponsor
  // could be located.
  origin: Origin,
  sponsors: z.array(Sponsor).default([]), // top sponsors by mention count
  updatedAt: z.string().datetime(),
});
export type CivilizationOrigin = z.infer<typeof CivilizationOrigin>;

export const Civilization = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  summary: z.string(),
  category: Category,
  firstSeenAt: z.string().datetime(),
  lastEventAt: z.string().datetime(),
  eventCount: z.number().int().nonnegative(),
  status: CivilizationStatus,
  headHash: z.string().nullable(),
  // Derived nightly by the origins job; optional so existing documents
  // validate. Civilization documents are not hash-chained, so this is a
  // plain mutable field.
  origin: CivilizationOrigin.optional(),
});

export { normalizeActor, actorSlug } from "./actors.js";
export type Civilization = z.infer<typeof Civilization>;

export const Root = z.object({
  id: z.string(),
  merkleRoot: z.string(),
  eventCount: z.number().int().nonnegative(),
  civilizationCount: z.number().int().nonnegative(),
  computedAt: z.string().datetime(),
  prevRootHash: z.string().nullable(),
  // OpenTimestamps attestations — appended after the root is written.
  // The merkleRoot itself never changes; these are append-only records
  // about it. See docs/DESIGN.md.
  otsProof: z.string().optional(), // base64 .ots bytes
  otsStampedAt: z.string().datetime().optional(),
  otsCheckedAt: z.string().datetime().optional(),
  otsUpgradedAt: z.string().datetime().optional(),
  otsBitcoinBlockHeight: z.number().int().nonnegative().optional(),
  otsBitcoinTimestamp: z.number().int().nonnegative().optional(),
});
export type Root = z.infer<typeof Root>;

export const ScanRun = z.object({
  id: z.string(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  sourcesQueried: z.number().int(),
  itemsFetched: z.number().int(),
  itemsPromoted: z.number().int(),
  llmCalls: z.number().int(),
  tokensUsed: z.number().int(),
  errors: z.array(z.string()).default([]),
});
export type ScanRun = z.infer<typeof ScanRun>;

export const ClassificationInput = z.object({
  title: z.string(),
  url: z.string(),
  excerpt: z.string(),
});
export type ClassificationInput = z.infer<typeof ClassificationInput>;

// Every field is optional-with-default because free-tier models
// routinely omit fields when they mean "no". `.default()` lets Zod
// safeParse succeed on { keep: true, category: "coordination", ... }
// even when the model didn't include actors/tags/reason. Then the
// downstream promotion gate (scan.ts) explicitly requires the
// mandatory fields (category, civilizationHint, title, summary),
// which is where a truly-malformed keep=true gets dropped honestly.
export const ClassificationOutput = z.object({
  keep: z.boolean().default(false),
  category: Category.nullable().default(null),
  civilizationHint: z.string().nullable().default(null),
  actors: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  title: z.string().nullable().default(null),
  summary: z.string().nullable().default(null),
  reason: z.string().default(""),
});
export type ClassificationOutput = z.infer<typeof ClassificationOutput>;
