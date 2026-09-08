import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { SOURCES } from "./sources.js";
import { fetchAll, type Candidate } from "./ingest.js";
import { classifyBatch, MAX_CANDIDATES_PER_SCAN, UNANSWERED } from "./classify.js";
import { promoteEvent } from "./hashchain.js";
import { extractFingerprints, isEmpty, mergeFingerprints } from "./fingerprint.js";
import { resolveCanonical, tierOf, canonicalHostname } from "./tiers.js";
import { ulid } from "ulid";

export interface ScanSummary {
  runId: string;
  itemsFetched: number;
  itemsPromoted: number;
  llmCalls: number;
  tokensUsed: number;
  errors: string[];
}

// Firestore-backed URL dedupe. Uses the `seenUrls` collection with the
// sha1(url) as the doc id. Read-only: items are marked seen only AFTER
// they have actually been through the classifier (markSeen below), so a
// backlog larger than one scan's classification budget drains across
// scans instead of being silently lost.
//
// Batch getAll instead of sequential gets — at 400+ candidates/scan the
// sequential path was adding ~5s of serial round-trips to Firestore.
async function filterNewCandidates(candidates: Candidate[]): Promise<Candidate[]> {
  const db = getFirestore();
  const withIds: Array<{ c: Candidate; id: string }> = [];
  for (const c of candidates) {
    if (!c.url) continue;
    withIds.push({ c, id: await sha1Hex(c.url) });
  }
  const out: Candidate[] = [];
  const CHUNK = 200; // Firestore getAll has no strict limit but 500 refs per RPC is the norm
  for (let i = 0; i < withIds.length; i += CHUNK) {
    const slice = withIds.slice(i, i + CHUNK);
    const refs = slice.map((x) => db.collection("seenUrls").doc(x.id));
    const snaps = await db.getAll(...refs);
    for (let j = 0; j < snaps.length; j++) {
      if (!snaps[j].exists) out.push(slice[j].c);
    }
  }
  return out;
}

const TIER_RANK: Record<string, number> = {
  primary: 0,
  "primary-trade": 1,
  secondary: 2,
  aggregator: 3,
  "aggregator-drop": 4,
};

function prioritizeByTier(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    const ra = TIER_RANK[a.sourceTier ?? "secondary"] ?? 2;
    const rb = TIER_RANK[b.sourceTier ?? "secondary"] ?? 2;
    return ra - rb;
  });
}

// Normalize a title for dedup: lowercase, strip non-alphanumeric, split
// into trigrams. Very cheap and catches the common case of the same
// story surfacing under slightly different titles from multiple feeds.
function trigramSet(title: string): Set<string> {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const grams = new Set<string>();
  if (s.length < 3) return grams;
  for (let i = 0; i < s.length - 2; i++) grams.add(s.slice(i, i + 3));
  return grams;
}

function jaccardOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / (a.size + b.size - inter);
}

// Keep the FIRST occurrence of each near-duplicate cluster — because
// prioritizeByTier has already ordered primaries first, the survivor
// is the highest-tier version of the story.
function titleDedupe(candidates: Candidate[], threshold = 0.7): Candidate[] {
  const out: Candidate[] = [];
  const grams: Set<string>[] = [];
  for (const c of candidates) {
    const g = trigramSet(c.title);
    let dup = false;
    for (const prev of grams) {
      if (jaccardOverlap(g, prev) >= threshold) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      out.push(c);
      grams.push(g);
    }
  }
  return out;
}

async function topActiveCivilizations(n: number): Promise<string[]> {
  const db = getFirestore();
  try {
    const snap = await db
      .collection("civilizations")
      .orderBy("lastEventAt", "desc")
      .limit(n)
      .get();
    return snap.docs.map((d) => (d.data() as { id: string }).id);
  } catch {
    return [];
  }
}

async function markSeen(candidates: Candidate[]): Promise<void> {
  const db = getFirestore();
  const now = new Date().toISOString();
  let batch = db.batch();
  let n = 0;
  for (const c of candidates) {
    const id = await sha1Hex(c.url);
    batch.set(db.collection("seenUrls").doc(id), { url: c.url, seenAt: now });
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (n % 400 !== 0) await batch.commit();
}

async function sha1Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  const arr = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex;
}

export async function runScan(opts: { apiKey: string; models: string[] }): Promise<ScanSummary> {
  const runId = ulid();
  const startedAt = new Date().toISOString();
  // A scan that dies mid-flight used to write nothing at all, so a killed
  // pipeline was indistinguishable from a quiet one. The record is opened
  // here and closed at the end; a run left "running" with an old start is
  // a run that was killed, and the health endpoint reads it as such.
  const db0 = getFirestore();
  await db0.collection("scanRuns").doc(runId).set({
    id: runId,
    startedAt,
    status: "running",
    sourcesQueried: SOURCES.length,
  });
  const errors: string[] = [];

  const { candidates: fetched, errors: fetchErrors, perSource } =
    await fetchAll(SOURCES);
  errors.push(...fetchErrors);
  const fresh = await filterNewCandidates(fetched);
  // Two throughput fixes:
  //  1) Tier priority — primary/primary-trade sources go to the classifier
  //     first. When we're LLM-budget-bound, arxiv/NVD/Krebs beat the
  //     15th vendor product news of the scan.
  //  2) In-scan dedupe by normalized-title trigrams — if two candidates
  //     have >70% overlapping trigrams (e.g. the SAME story surfaced by
  //     three feeds), classify only the highest-tier one. Saves LLM calls
  //     that would just get a "duplicate coverage" drop.
  const prioritized = prioritizeByTier(fresh);
  const deduped = titleDedupe(prioritized);
  const considered = deduped.slice(0, MAX_CANDIDATES_PER_SCAN);

  // Pull the top established civilizations by activity so the classifier
  // can reuse their slugs instead of inventing near-miss variants (see
  // deep-dive: civilization-slug fragmentation is the #1 corroboration
  // blocker). Bounded to 60 to keep the prompt lean.
  const establishedCivs = await topActiveCivilizations(60);

  const { outputs, llmCalls, tokensUsed, errors: classifyErrors, classifierModel, batchesDeferred } =
    await classifyBatch(considered, { ...opts, establishedCivs });
  errors.push(...classifyErrors);
  // classifyBatch returns one output per input, always. If it ever does not,
  // every pairing below is off by the difference and entries get hashed into
  // an append-only ledger against the wrong source — so refuse rather than
  // guess.
  if (outputs.length !== considered.length) {
    throw new Error(
      `classifier returned ${outputs.length} outputs for ${considered.length} inputs; refusing to pair them`,
    );
  }

  // Mark seen only what a model actually answered. A batch that every model
  // refused was never judged, and burning those URLs meant they could never
  // be reconsidered: measured over 24 hours, 887 of 1,850 candidates (48%)
  // were discarded this way while /api/health.json still read "running",
  // because a model had answered *some* batch that window.
  const unanswered = outputs.filter((o) => o.reason?.startsWith(UNANSWERED)).length;
  await markSeen(considered.filter((_, i) => !outputs[i].reason?.startsWith(UNANSWERED)));
  if (unanswered) {
    logger.warn(
      `[scan] ${unanswered}/${considered.length} candidates went unclassified and were left unseen for the next window`,
    );
  }

  let promoted = 0;
  for (let i = 0; i < outputs.length; i++) {
    const c = considered[i];
    const o = outputs[i];
    if (!o.keep || !o.category || !o.civilizationHint || !o.title || !o.summary) continue;
    try {
      // Fingerprints: merge what the producer already knew (arXiv API
      // gives us arxivId + DOI verbatim from the atom entry) with what
      // the regex extractor pulls from URL + excerpt. Producer-set
      // fingerprints win by being listed first in the merge.
      const fp = mergeFingerprints(
        c.fingerprints ?? {},
        extractFingerprints({ url: c.url, excerpt: c.excerpt }),
      );
      // Canonical resolution: use producer-set canonical fields when the
      // producer already knows them (arXiv API always sets them), else
      // unwrap known aggregators via a bounded HEAD.
      const resolved = c.canonicalDomain
        ? {
            canonicalUrl: c.canonicalUrl ?? c.url,
            canonicalDomain: c.canonicalDomain,
            resolvedAt: new Date().toISOString(),
          }
        : await resolveCanonical(c.url);
      const canonicalDomain =
        resolved?.canonicalDomain ?? canonicalHostname(c.domain);
      const sourceTier = c.sourceTier ?? tierOf(canonicalDomain);
      // Occurred-at defense in depth: an unparseable pubDate falls back
      // to now(), so a bad date can never abort promotion.
      let occurredAt = new Date().toISOString();
      if (c.publishedAt) {
        const d = new Date(c.publishedAt);
        if (!Number.isNaN(d.getTime())) occurredAt = d.toISOString();
      }

      await promoteEvent({
        civilizationHint: o.civilizationHint,
        civilizationName: o.civilizationHint,
        category: o.category,
        title: o.title,
        summary: o.summary,
        occurredAt,
        actors: o.actors,
        tags: o.tags,
        source: {
          url: c.url,
          domain: c.domain,
          title: c.title,
          fetchedAt: startedAt,
          rawExcerpt: c.excerpt.slice(0, 2000),
          ...(resolved && { canonicalUrl: resolved.canonicalUrl }),
          canonicalDomain,
          sourceTier,
          ...(c.language && { language: c.language }),
          ...(resolved && { resolvedAt: resolved.resolvedAt }),
          ...(isEmpty(fp) ? {} : { fingerprints: fp }),
        },
        identifiers: isEmpty(fp) ? undefined : fp,
      });
      promoted++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Tally why items were dropped — without this, a silent parsing or
  // validation failure looks identical to "nothing relevant today".
  const dropReasons: Record<string, number> = {};
  for (const o of outputs) {
    if (o.keep) continue;
    const key = (o.reason || "unstated").slice(0, 80);
    dropReasons[key] = (dropReasons[key] ?? 0) + 1;
  }

  const summary: ScanSummary = {
    runId,
    itemsFetched: fetched.length,
    itemsPromoted: promoted,
    llmCalls,
    tokensUsed,
    errors,
  };

  const db = getFirestore();
  await db.collection("scanRuns").doc(runId).set({
    id: runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    // "ok" only when a model actually answered. A scan that fetched and
    // considered items but had every model refuse is not a quiet day.
    status: classifierModel
      ? "ok"
      : considered.length > 0
        ? "no-classifier"
        : "nothing-to-classify",
    classifierModel: classifierModel ?? null,
    batchesDeferred,
    sourcesQueried: SOURCES.length,
    itemsFetched: summary.itemsFetched,
    itemsConsidered: considered.length,
    itemsPromoted: summary.itemsPromoted,
    llmCalls: summary.llmCalls,
    tokensUsed: summary.tokensUsed,
    errors: summary.errors,
    dropReasons,
    perSource,
  });

  return summary;
}
