import { initializeApp } from "firebase-admin/app";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { runScan } from "./scan.js";
import { computeDailyRoot } from "./hashchain.js";
import { FALLBACK_MODELS } from "./classify.js";
import { buildAtomFeed, buildSitemap } from "./feeds.js";
import { regenerateStaleSummaries } from "./summarize.js";
import { anchorDailyRoot, upgradeAllPendingProofs } from "./opentimestamps.js";

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
  { secrets: [OPENROUTER_API_KEY], timeoutSeconds: 540, memory: "512MiB" },
  async (_req, res) => {
    const summary = await runScan({
      apiKey: OPENROUTER_API_KEY.value(),
      models: models(),
    });
    res.json(summary);
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
  { timeoutSeconds: 60 },
  async (req, res) => {
    const day = String(req.query.day ?? new Date().toISOString().slice(0, 10));
    await anchorDailyRoot(day);
    res.json({ ok: true, day });
  },
);
export const upgradeRoots = onRequest(
  { timeoutSeconds: 540, memory: "512MiB" },
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

// Manual root trigger.
export const computeRoot = onRequest(async (req, res) => {
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

// Manual summary trigger — authenticated by Cloud Run default (invoker
// role required), so it cannot be used to drain the free-inference quota.
export const summarizeNow = onRequest(
  { secrets: [OPENROUTER_API_KEY], timeoutSeconds: 300, memory: "256MiB" },
  async (_req, res) => {
    const result = await regenerateStaleSummaries(OPENROUTER_API_KEY.value());
    res.json(result);
  },
);
