import { getFirestore } from "firebase-admin/firestore";
import type { Civilization, Event } from "@agent-civilizations/schema";
import { fileName } from "@agent-civilizations/schema";
import { FALLBACK_MODELS } from "./classify.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CIVS_PER_RUN = 5; // free-tier budget: 5 civs/week is ~260/year — plenty
const MAX_EVENTS = 30;
const CALL_TIMEOUT_MS = 45_000;
// A run stops here and reports what it did rather than being killed mid-file.
const RUN_DEADLINE_MS = 480_000;

const SYSTEM_PROMPT = `You write registrar summaries for AgentCivilizations.org. Given a civilization's name and its ordered event thread, produce a 2-sentence, factual summary of what this grouping is and what it has been observed doing. No hype vocabulary. No exclamation marks. Refer to the grouping by name once, then plainly. Under 400 characters total.`;

interface SummarizeResult {
  attempted: number;
  updated: number;
  errors: string[];
  /** True when the run stopped on its own deadline with work left. */
  deadlineHit?: boolean;
  /** Files still carrying no usable summary after this run. */
  remaining?: number;
}

async function callModel(
  civ: Civilization,
  events: Event[],
  apiKey: string,
  models: string[],
): Promise<string | null> {
  const thread = events
    .slice(0, MAX_EVENTS)
    .map((e) => `#${e.seq} [${e.category}] ${e.title} — ${e.summary}`)
    .join("\n");
  const userMsg = `Name: ${fileName(civ.id, civ.name)}\nCategory: ${civ.category}\nFirst seen: ${civ.firstSeenAt}\nLast entry: ${civ.lastEventAt}\nEvent count: ${civ.eventCount}\n\nThread:\n${thread}`;

  let lastErr = "";
  for (const model of models) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "http-referer": "https://agentcivilizations.org",
          "x-title": "Agent Civilizations",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMsg },
          ],
          temperature: 0.2,
        }),
      });
      if (!res.ok) {
        lastErr = `${model}: HTTP ${res.status}`;
        continue;
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (text.length > 20) return text.slice(0, 500);
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastErr || "all summary models failed");
}

export async function regenerateStaleSummaries(
  apiKey: string,
  opts: { limit?: number } = {},
): Promise<SummarizeResult> {
  const startedAt = Date.now();
  const perRun = Math.min(Math.max(1, opts.limit ?? CIVS_PER_RUN), 60);
  const db = getFirestore();
  const models = FALLBACK_MODELS;
  // Priority order: no summary yet, then oldest lastEventAt (still active).
  const snap = await db.collection("civilizations").get();
  const all = snap.docs.map((d) => d.data() as Civilization);
  const missing = all.filter((c) => !c.summary || c.summary.length < 40);
  const rest = all
    .filter((c) => c.summary && c.summary.length >= 40)
    .sort((a, b) => a.lastEventAt.localeCompare(b.lastEventAt));
  const targets = [...missing, ...rest].slice(0, perRun);

  const errors: string[] = [];
  let updated = 0;
  let deadlineHit = false;
  for (const civ of targets) {
    if (Date.now() - startedAt > RUN_DEADLINE_MS) {
      deadlineHit = true;
      break;
    }
    try {
      const eventsSnap = await db
        .collection("events")
        .where("civilizationId", "==", civ.id)
        .orderBy("seq", "asc")
        .limit(MAX_EVENTS)
        .get();
      const events = eventsSnap.docs.map((d) => d.data() as Event);
      if (events.length === 0) continue;
      const summary = await callModel(civ, events, apiKey, models);
      if (!summary) continue;
      await db
        .collection("civilizations")
        .doc(civ.id)
        .update({ summary, summaryUpdatedAt: new Date().toISOString() });
      updated++;
    } catch (err) {
      errors.push(
        `${civ.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return { attempted: targets.length, updated, errors, deadlineHit, remaining: missing.length - updated };
}
