import { initializeApp } from "firebase-admin/app";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { runScan } from "./scan.js";
import { computeDailyRoot } from "./hashchain.js";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 5 });

const OPENROUTER_API_KEY = defineSecret("OPENROUTER_API_KEY");
const DEFAULT_MODEL = "deepseek/deepseek-chat-v3.1:free";

// Scheduled: every 30 minutes.
export const scheduledScan = onSchedule(
  { schedule: "every 30 minutes", secrets: [OPENROUTER_API_KEY], timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const summary = await runScan({
      apiKey: OPENROUTER_API_KEY.value(),
      model: process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
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
      model: process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
    });
    res.json(summary);
  },
);

// Nightly root computation (00:15 UTC computes previous day).
export const nightlyRoot = onSchedule(
  { schedule: "15 0 * * *", timeZone: "UTC", timeoutSeconds: 300 },
  async () => {
    const yesterday = new Date(Date.now() - 86400_000);
    const day = yesterday.toISOString().slice(0, 10);
    await computeDailyRoot(day);
    console.log("root computed for", day);
  },
);

// Manual root trigger.
export const computeRoot = onRequest(async (req, res) => {
  const day = String(req.query.day ?? new Date().toISOString().slice(0, 10));
  await computeDailyRoot(day);
  res.json({ ok: true, day });
});
