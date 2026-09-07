import { initializeApp } from "firebase-admin/app";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { runScan } from "./scan.js";
import { retractEvent } from "./retract.js";
import { runCatalog } from "./catalog.js";
import { buildSnapshot, buildRetractionsFeed, buildFigures, figuresToCsv } from "./reference.js";
import { computeDailyRoot, backfillCorroboration } from "./hashchain.js";
import { FALLBACK_MODELS } from "./classify.js";
import { buildAtomFeed, buildSitemap } from "./feeds.js";
import { regenerateStaleSummaries } from "./summarize.js";
import { anchorDailyRoot, upgradeAllPendingProofs } from "./opentimestamps.js";
import { runOrigins } from "./origins.js";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 5 });

const OPENROUTER_API_KEY = defineSecret("OPENROUTER_API_KEY");

// OPENROUTER_MODEL (comma-separated) overrides; otherwise the fallback
// chain of currently-available free models applies.
function models(): string[] {
  const env = process.env.OPENROUTER_MODEL;
  return env ? env.split(",").map((m) => m.trim()) : FALLBACK_MODELS;
}

// Scheduled: every 30 minutes.
// HTTP FUNCTION INVOCATION POLICY
//
// onRequest in Firebase Functions v2 is PUBLIC by default: the CLI grants
// run.invoker to allUsers unless the function says otherwise. Anything
// that writes to the ledger, seals a root, or spends the free-inference
// budget therefore declares invoker: "private" explicitly and is called
// with a Cloud Run identity token:
//
//   curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" <url>
//
// Exactly three functions are deliberately public, and all three are
// read-only: otsProof, feed, sitemap.

export const scheduledScan = onSchedule(
  { schedule: "every 30 minutes", secrets: [OPENROUTER_API_KEY], timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const summary = await runScan({
      apiKey: OPENROUTER_API_KEY.value(),
      models: models(),
    });
    console.log("scan summary", summary);
  },
);

// Manual trigger (unauthenticated GET) — useful for testing. Reject in prod
// by checking a shared secret if abuse becomes an issue.
export const scanNow = onRequest(
  { secrets: [OPENROUTER_API_KEY], timeoutSeconds: 540, memory: "512MiB", invoker: "private" },
  async (_req, res) => {
    const summary = await runScan({
      apiKey: OPENROUTER_API_KEY.value(),
      models: models(),
    });
    res.json(summary);
  },
);

// Retraction — a governance act, never a public endpoint.
//
// The register does not edit or delete; a correction is a new entry that
// supersedes the old one and says why. This writes that entry, chained
// onto the file's head like any other, and it is permanent: the next
// nightly root seals it and OpenTimestamps anchors it. Invoke it the way
// the other admin callables are invoked, with a Cloud Run identity token:
//
//   curl -X POST https://<retractnow-url> \
//     -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
//     -H "content-type: application/json" \
//     -d '{"eventId":"01M...","reason":"misclassified","notes":"why"}'
export const retractNow = onRequest(
  { timeoutSeconds: 120, memory: "256MiB", invoker: "private" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "POST a JSON body" });
      return;
    }
    const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body) ?? {};
    const result = await retractEvent({
      eventId: String(body.eventId ?? ""),
      reason: body.reason,
      notes: String(body.notes ?? ""),
      ...(body.title && { title: String(body.title) }),
      ...(body.summary && { summary: String(body.summary) }),
    });
    // Every retraction is logged, successful or refused.
    console.log("retraction", JSON.stringify({ request: { eventId: body.eventId, reason: body.reason }, result }));
    res.status(result.ok ? 200 : 400).json(result);
  },
);

// The catalog pass — recompute every file's derived fields from the
// ledger. Runs nightly at 00:45 UTC, after the root is sealed, and is
// exposed as a private callable for a manual run.
export const nightlyCatalog = onSchedule(
  { schedule: "45 0 * * *", timeZone: "UTC", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const result = await runCatalog();
    console.log("catalog", JSON.stringify(result));
  },
);

export const catalogNow = onRequest(
  { timeoutSeconds: 540, memory: "512MiB", invoker: "private" },
  async (_req, res) => {
    res.json(await runCatalog());
  },
);

// The reference desk's public endpoints. All read-only, all public: a
// researcher who must ask permission cannot check us independently.
//
// A snapshot is the register as sealed on a day, named for that day's
// root, so a paper can cite a dataset rather than a URL.
export const snapshot = onRequest(
  { invoker: "public", timeoutSeconds: 120, memory: "512MiB" },
  async (req, res) => {
    const day = (req.path.match(/(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? "";
    const out = await buildSnapshot(day);
    res.set("Content-Type", "application/json; charset=utf-8");
    // A sealed day never changes, so it may be cached hard.
    res.set("Cache-Control", out.ok ? "public, max-age=86400, s-maxage=86400" : "public, max-age=60");
    res.set("Access-Control-Allow-Origin", "*");
    res.status(out.status).send(out.body);
  },
);

// Corrections, for anyone who has already published on this record.
export const corrections = onRequest(
  { invoker: "public", memory: "256MiB" },
  async (_req, res) => {
    const body = await buildRetractionsFeed();
    res.set("Content-Type", "application/atom+xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=300, s-maxage=300");
    res.set("Access-Control-Allow-Origin", "*");
    res.status(200).send(body);
  },
);

// Headline counts, so a newsroom chart is not typed by hand.
export const figures = onRequest(
  { invoker: "public", timeoutSeconds: 120, memory: "512MiB" },
  async (req, res) => {
    const f = await buildFigures();
    const csv = /\.csv$/.test(req.path);
    res.set("Content-Type", csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8");
    res.set("Cache-Control", "public, max-age=900, s-maxage=900");
    res.set("Access-Control-Allow-Origin", "*");
    res.status(200).send(csv ? figuresToCsv(f) : JSON.stringify(f, null, 2));
  },
);

// Nightly root computation (00:15 UTC computes previous day).
// After sealing the root, submit it to OpenTimestamps calendars —
// fire-and-forget, since attaching the Bitcoin header takes hours.
export const nightlyRoot = onSchedule(
  { schedule: "15 0 * * *", timeZone: "UTC", timeoutSeconds: 300 },
  async () => {
    const yesterday = new Date(Date.now() - 86400_000);
    const day = yesterday.toISOString().slice(0, 10);
    await computeDailyRoot(day);
    console.log("root computed for", day);
    try {
      await anchorDailyRoot(day);
      console.log("ots stamped", day);
    } catch (err) {
      console.warn("ots anchor failed", err);
    }
  },
);

// Weekly: upgrade any incomplete .ots proofs by asking the calendars
// for their Bitcoin attestation. Once the block header attaches, the
// proof becomes standalone-verifiable — no server, no calendar, only
// Bitcoin. Runs Wednesday 06:00 UTC (well past the ~day-latency of
// typical Bitcoin confirmations for calendar aggregations).
export const upgradeOtsProofs = onSchedule(
  {
    schedule: "0 6 * * 3",
    timeZone: "UTC",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const result = await upgradeAllPendingProofs();
    console.log("ots upgrade", result);
  },
);

// Manual triggers for both — authenticated by Cloud Run default.
export const anchorRoot = onRequest(
  { timeoutSeconds: 60, invoker: "private" },
  async (req, res) => {
    const day = String(req.query.day ?? new Date().toISOString().slice(0, 10));
    await anchorDailyRoot(day);
    res.json({ ok: true, day });
  },
);
export const upgradeRoots = onRequest(
  { timeoutSeconds: 540, memory: "512MiB", invoker: "private" },
  async (_req, res) => {
    const result = await upgradeAllPendingProofs();
    res.json(result);
  },
);

// Serve the raw .ots proof for a given day — a reader can save this to
// {day}.ots and run `ots verify --raw <merkleRoot-hex> {day}.ots`,
// which walks the proof against Bitcoin without needing us or the
// calendars once the header is attached.
export const otsProof = onRequest(
  { invoker: "public", memory: "256MiB" },
  async (req, res) => {
    // Accept either ?day=YYYY-MM-DD or a path like /api/roots/YYYY-MM-DD/ots
    // (Firebase Hosting rewrites forward the original path to req.path).
    const fromQuery = String(req.query.day ?? "");
    const fromPath = req.path.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
    const day = fromQuery || fromPath;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      res.status(400).send("day must be YYYY-MM-DD");
      return;
    }
    const { getFirestore } = await import("firebase-admin/firestore");
    const snap = await getFirestore().collection("roots").doc(day).get();
    if (!snap.exists) {
      res.status(404).send("no root for that day");
      return;
    }
    const r = snap.data() as { otsProof?: string; merkleRoot: string };
    if (!r.otsProof) {
      res.status(404).send("no .ots proof for that day yet");
      return;
    }
    res.set("Content-Type", "application/vnd.opentimestamps.ots");
    res.set(
      "Content-Disposition",
      `attachment; filename="${day}.ots"`,
    );
    res.set("X-Merkle-Root", r.merkleRoot);
    res.set("Cache-Control", "public, max-age=3600");
    res.status(200).send(Buffer.from(r.otsProof, "base64"));
  },
);

// One-shot retroactive corroboration backfill — apply the current
// predicates to every event in the last 60 days. Authenticated (Cloud
// Run default) because it's operator-scoped.
export const backfillConfirmations = onRequest(
  { timeoutSeconds: 540, memory: "512MiB", invoker: "private" },
  async (_req, res) => {
    const result = await backfillCorroboration();
    res.json(result);
  },
);

// Manual root trigger.
export const computeRoot = onRequest({ invoker: "private" }, async (req, res) => {
  const day = String(req.query.day ?? new Date().toISOString().slice(0, 10));
  await computeDailyRoot(day);
  res.json({ ok: true, day });
});

// Atom feed — served fresh every request through the /feed.xml rewrite in
// firebase.json. Cache at the edge for 5 minutes so a busy day doesn't
// hammer Firestore, but not longer — the register is meant to be current.
export const feed = onRequest(
  { invoker: "public", memory: "256MiB" },
  async (_req, res) => {
    const body = await buildAtomFeed();
    res.set("Content-Type", "application/atom+xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=300, s-maxage=300");
    res.status(200).send(body);
  },
);

// Sitemap — same treatment; hosts, search engines pull it fresh.
export const sitemap = onRequest(
  { invoker: "public", memory: "256MiB" },
  async (_req, res) => {
    const body = await buildSitemap();
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=1800, s-maxage=1800");
    res.status(200).send(body);
  },
);

// Weekly: regenerate up to 5 civilization summaries — missing first, then
// stalest active. Cheap on the free-inference budget (5 calls/week).
export const weeklySummaries = onSchedule(
  {
    schedule: "0 6 * * 1", // Mondays 06:00 UTC
    timeZone: "UTC",
    secrets: [OPENROUTER_API_KEY],
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    const result = await regenerateStaleSummaries(OPENROUTER_API_KEY.value());
    console.log("summaries", result);
  },
);

// Nightly 01:00 UTC: place sponsors on the map. Wikidata first (cited by
// QID), the free-tier model second (labelled inferred), "unplaced" third.
// At most 25 lookups a night — the free-inference budget stays intact.
export const nightlyOrigins = onSchedule(
  {
    schedule: "0 1 * * *",
    timeZone: "UTC",
    secrets: [OPENROUTER_API_KEY],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const result = await runOrigins({ apiKey: OPENROUTER_API_KEY.value(), models: models() });
    console.log("origins", result);
  },
);

// Manual origins trigger — authenticated by Cloud Run default.
export const originsNow = onRequest(
  { secrets: [OPENROUTER_API_KEY], timeoutSeconds: 540, memory: "512MiB", invoker: "private" },
  async (_req, res) => {
    const result = await runOrigins({ apiKey: OPENROUTER_API_KEY.value(), models: models() });
    res.json(result);
  },
);

// Manual summary trigger — private (see the note above onRequest defaults) (invoker
// role required), so it cannot be used to drain the free-inference quota.
export const summarizeNow = onRequest(
  { secrets: [OPENROUTER_API_KEY], timeoutSeconds: 300, memory: "256MiB", invoker: "private" },
  async (_req, res) => {
    const result = await regenerateStaleSummaries(OPENROUTER_API_KEY.value());
    res.json(result);
  },
);
