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

export const Source = z.object({
  url: z.string().url(),
  domain: z.string(),
  title: z.string(),
  fetchedAt: z.string().datetime(),
  rawExcerpt: z.string().max(2048),
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
  contentHash: z.string(),
  prevHash: z.string().nullable(),
  seq: z.number().int().nonnegative(),
});
export type Event = z.infer<typeof Event>;

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
});
export type Civilization = z.infer<typeof Civilization>;

export const Root = z.object({
  id: z.string(),
  merkleRoot: z.string(),
  eventCount: z.number().int().nonnegative(),
  civilizationCount: z.number().int().nonnegative(),
  computedAt: z.string().datetime(),
  prevRootHash: z.string().nullable(),
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

export const ClassificationOutput = z.object({
  keep: z.boolean(),
  category: Category.nullable(),
  civilizationHint: z.string().nullable(),
  actors: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  reason: z.string(),
});
export type ClassificationOutput = z.infer<typeof ClassificationOutput>;
