import { getFirestore } from "firebase-admin/firestore";
import { SOURCES } from "./sources.js";
import { fetchAll, type Candidate } from "./ingest.js";
import { classifyBatch, MAX_CANDIDATES_PER_SCAN } from "./classify.js";
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
// sha1(url) as the doc id so a lookup is a single get(). Read-only: items
// are marked seen only AFTER they have actually been through the
// classifier (markSeen below), so a backlog larger than one scan's
// classification budget drains across scans instead of being silently lost.
async function filterNewCandidates(candidates: Candidate[]): Promise<Candidate[]> {
  const db = getFirestore();
  const out: Candidate[] = [];
  for (const c of candidates) {
    if (!c.url) continue;
    const id = await sha1Hex(c.url);
    const snap = await db.collection("seenUrls").doc(id).get();
    if (snap.exists) continue;
    out.push(c);
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
  const errors: string[] = [];

  const { candidates: fetched, errors: fetchErrors, perSource } =
    await fetchAll(SOURCES);
  errors.push(...fetchErrors);
  const fresh = await filterNewCandidates(fetched);
  const considered = fresh.slice(0, MAX_CANDIDATES_PER_SCAN);

  // Pull the top established civilizations by activity so the classifier
  // can reuse their slugs instead of inventing near-miss variants (see
  // deep-dive: civilization-slug fragmentation is the #1 corroboration
  // blocker). Bounded to 60 to keep the prompt lean.
  const establishedCivs = await topActiveCivilizations(60);

  const { outputs, llmCalls, tokensUsed, errors: classifyErrors } =
    await classifyBatch(considered, { ...opts, establishedCivs });
  errors.push(...classifyErrors);
  // Only what was actually put to the classifier is marked seen; the rest
  // of the backlog stays fresh for the next scan window.
  await markSeen(considered.slice(0, outputs.length));

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
