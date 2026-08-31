import { getFirestore } from "firebase-admin/firestore";
import { SOURCES } from "./sources.js";
import { fetchAll, type Candidate } from "./ingest.js";
import { classifyBatch } from "./classify.js";
import { promoteEvent } from "./hashchain.js";
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
// sha1(url) as the doc id so a query is a single get().
async function filterNewCandidates(candidates: Candidate[]): Promise<Candidate[]> {
  const db = getFirestore();
  const out: Candidate[] = [];
  for (const c of candidates) {
    if (!c.url) continue;
    const id = await sha1Hex(c.url);
    const ref = db.collection("seenUrls").doc(id);
    const snap = await ref.get();
    if (snap.exists) continue;
    await ref.set({ url: c.url, seenAt: new Date().toISOString() });
    out.push(c);
  }
  return out;
}

async function sha1Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  const arr = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex;
}

export async function runScan(opts: { apiKey: string; model: string }): Promise<ScanSummary> {
  const runId = ulid();
  const startedAt = new Date().toISOString();
  const errors: string[] = [];

  const fetched = await fetchAll(SOURCES);
  const fresh = await filterNewCandidates(fetched);

  const { outputs, llmCalls, tokensUsed } = await classifyBatch(fresh, opts);

  let promoted = 0;
  for (let i = 0; i < outputs.length; i++) {
    const c = fresh[i];
    const o = outputs[i];
    if (!o.keep || !o.category || !o.civilizationHint || !o.title || !o.summary) continue;
    try {
      await promoteEvent({
        civilizationHint: o.civilizationHint,
        civilizationName: o.civilizationHint,
        category: o.category,
        title: o.title,
        summary: o.summary,
        occurredAt: c.publishedAt
          ? new Date(c.publishedAt).toISOString()
          : new Date().toISOString(),
        actors: o.actors,
        tags: o.tags,
        source: {
          url: c.url,
          domain: c.domain,
          title: c.title,
          fetchedAt: startedAt,
          rawExcerpt: c.excerpt.slice(0, 2000),
        },
      });
      promoted++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
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
    itemsPromoted: summary.itemsPromoted,
    llmCalls: summary.llmCalls,
    tokensUsed: summary.tokensUsed,
    errors: summary.errors,
  });

  return summary;
}
