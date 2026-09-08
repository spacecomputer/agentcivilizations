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

// Status is derived from silence in OCCURRENCE time, never written by
// hand: a file is dormant when nothing has happened in it for
// DORMANT_AFTER_DAYS, and ruled off as extinct after EXTINCT_AFTER_DAYS.
// Both thresholds are printed on the catalog beside the column they
// govern, so the rule is always legible next to its effect.
export const DORMANT_AFTER_DAYS = 90;
export const EXTINCT_AFTER_DAYS = 365;

export function statusFromSilence(
  latestOccurrenceIso: string,
  nowIso: string,
): CivilizationStatus {
  const days = (Date.parse(nowIso) - Date.parse(latestOccurrenceIso)) / 86_400_000;
  if (days >= EXTINCT_AFTER_DAYS) return "extinct";
  if (days >= DORMANT_AFTER_DAYS) return "dormant";
  return "active";
}

// The source list, as a dated record.
//
// Adding a source changes what the register can see, which changes its
// sensitivity on that date exactly as switching the scanner on did. An
// unmarked change quietly corrupts every trend drawn across it, so the
// list is kept as an append-only log and drawn onto the coverage plate as
// a rule. Editing this array is a governance act: it ships in its own
// commit and explains itself.
export interface SourceChange {
  date: string; // YYYY-MM-DD, the day the change took effect
  note: string; // what changed, in one line, for the plate's caption
  added?: string[];
  removed?: string[];
}

export const SOURCE_CHANGELOG: SourceChange[] = [
  {
    date: "2026-09-01",
    note: "The register opens: research indexes, vulnerability data, security reporting and English news.",
  },
  {
    date: "2026-09-07",
    note: "Framework release feeds added — eight agent projects' own release notes.",
    added: ["github releases: langgraph, autogen, crewai, autogpt, openai-agents, mcp servers, openhands, browser-use"],
  },
  {
    date: "2026-09-08",
    note: "Chinese and Russian sources added; coverage before this date is English-language only.",
    added: [
      "zh: qbitai, anquanke, infoq.cn, Google News (zh-Hans)",
      "ru: habr (AI and infosecurity), securelist.ru, xakep, Google News (ru)",
    ],
  },
];

export const SourceTier = z.enum([
  "primary", // authoritative first-party (arxiv, nvd, github repo, official blog)
  "primary-trade", // named investigative journalist beat (krebs)
  "secondary", // reputable secondary press (The Register, TechCrunch)
  "aggregator", // aggregators that link to primaries (HN, Google News)
  "aggregator-drop", // aggregators whose peerhood must be ignored for corroboration
  // State-controlled or state-directed outlets. Authoritative for what
  // that state and its institutions claim, and reportable as such, but
  // two of them are not independent of each other: see corroborates().
  "state-affiliated",
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
  // BCP-47 tag of the language this source publishes in, declared by the
  // feed rather than detected, so it is a fact about the source and not a
  // guess about the text. Absent means "en" on documents written before
  // the register read anything else.
  language: z.string().optional(),
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
  "product",
  "protocol",
  "unknown",
]);
export type ActorKind = z.infer<typeof ActorKind>;

// Only organisations place a file. People, author groups, publications,
// products and protocols are recorded in the registry — with a citable
// rule — and never place. (Reader-facing copy calls a placing actor a
// "party of record"; the identifiers here stay.)
export const PLACING_KINDS: ReadonlySet<ActorKind> = new Set<ActorKind>([
  "lab",
  "company",
  "university",
  "government",
  "agent-framework",
]);

// One document per normalized actor in the `actorRegistry` collection.
export const ActorRegistryEntry = z.object({
  id: z.string(), // actorSlug(name)
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  kind: ActorKind,
  homepage: z.string().url().optional(),
  // For products and protocols: the registry id of the organisation that
  // makes them. "GPT-5-mini" names OpenAI; naming a product counts as
  // naming its maker.
  productOf: z.string().optional(),
  origin: Origin,
  eventCount: z.number().int().nonnegative().default(0),
  civilizationCount: z.number().int().nonnegative().default(0),
  placedCount: z.number().int().nonnegative().optional(), // files this actor placed
  updatedAt: z.string().datetime(),
});
export type ActorRegistryEntry = z.infer<typeof ActorRegistryEntry>;

export const SponsorExclusion = z.enum([
  "publication",
  "individual",
  "collective",
  "product",
  "protocol",
  "unknown",
]);
export type SponsorExclusion = z.infer<typeof SponsorExclusion>;

export const Sponsor = z.object({
  actorId: z.string(),
  actorName: z.string(),
  mentions: z.number().int().nonnegative(),
  origin: Origin.optional(),
  // Set when this actor can never place a file, with the kind that
  // excludes it. Absent for organisations (placed or not yet located).
  excluded: SponsorExclusion.optional(),
});
export type Sponsor = z.infer<typeof Sponsor>;

export const UnplacedReason = z.enum([
  "no-actors", // the file's entries name no actor at all
  "no-organisation", // every named actor is a person, group, product or publication
  "not-located", // an organisation is named but has no located headquarters
]);
export type UnplacedReason = z.infer<typeof UnplacedReason>;

export const CivilizationOrigin = z.object({
  // The placing party's origin; provenance "unplaced" when no organisation
  // could be located.
  origin: Origin,
  sponsors: z.array(Sponsor).default([]), // ranked by mention count
  // Who placed the file, and at what rank among its named actors — a
  // file placed by its third-most-named actor says so.
  placedBy: z
    .object({
      actorId: z.string(),
      actorName: z.string(),
      rank: z.number().int().min(1),
      mentions: z.number().int().nonnegative(),
    })
    .optional(),
  reason: UnplacedReason.optional(),
  // For reason "not-located": the organisations named in the file's
  // entries that have no located headquarters yet — the public worklist
  // for the curated seed, ranked by mentions.
  unlocated: z
    .array(z.object({ actorId: z.string(), actorName: z.string(), mentions: z.number().int().nonnegative() }))
    .optional(),
  updatedAt: z.string().datetime(),
});
export type CivilizationOrigin = z.infer<typeof CivilizationOrigin>;

export const Civilization = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  summary: z.string(),
  category: Category,
  // The register keeps two clocks and never mixes them.
  //   firstSeenAt / lastEventAt  OCCURRENCE time: when the earliest and
  //     latest entries in this file actually happened. lastEventAt is the
  //     MAXIMUM occurrence, so a late-recorded old story can never drag a
  //     file's span backwards.
  //   openedAt / lastRecordedAt  RECORD time: when the register first and
  //     last wrote into this file. Optional; absent on documents written
  //     before the two clocks were separated.
  firstSeenAt: z.string().datetime(),
  lastEventAt: z.string().datetime(),
  openedAt: z.string().datetime().optional(),
  lastRecordedAt: z.string().datetime().optional(),
  eventCount: z.number().int().nonnegative(),
  // Confidence split, so the catalog can show what a file rests on.
  confirmedCount: z.number().int().nonnegative().optional(),
  candidateCount: z.number().int().nonnegative().optional(),
  status: CivilizationStatus,
  headHash: z.string().nullable(),
  // Derived nightly by the origins job; optional so existing documents
  // validate. Civilization documents are not hash-chained, so this is a
  // plain mutable field.
  origin: CivilizationOrigin.optional(),
});

export { normalizeActor, actorSlug } from "./actors.js";
export type Civilization = z.infer<typeof Civilization>;

export const RootAlgo = z.enum(["flat-v1", "merkle-v2"]);
export type RootAlgo = z.infer<typeof RootAlgo>;

export const Root = z.object({
  id: z.string(),
  merkleRoot: z.string(),
  // How this day was sealed. Absent means "flat-v1" — every root sealed
  // before the Merkle tree shipped. A root is never recomputed under a
  // new algorithm; the field records which one to verify it under.
  rootAlgo: RootAlgo.optional(),
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
