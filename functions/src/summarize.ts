import { getFirestore } from "firebase-admin/firestore";
import type { Civilization, Event } from "@agent-civilizations/schema";
import { FALLBACK_MODELS } from "./classify.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CIVS_PER_RUN = 5; // free-tier budget: 5 civs/week is ~260/year — plenty
const MAX_EVENTS = 30;

const SYSTEM_PROMPT = `You write registrar summaries for AgentCivilizations.org. Given a civilization's name and its ordered event thread, produce a 2-sentence, factual summary of what this grouping is and what it has been observed doing. No hype vocabulary. No exclamation marks. Refer to the grouping by name once, then plainly. Under 400 characters total.`;

interface SummarizeResult {
  attempted: number;
  updated: number;
  errors: string[];
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
  const userMsg = `Name: ${civ.name}\nCategory: ${civ.category}\nFirst seen: ${civ.firstSeenAt}\nLast entry: ${civ.lastEventAt}\nEvent count: ${civ.eventCount}\n\nThread:\n${thread}`;

  let lastErr = "";
  for (const model of models) {
    try {
      const res = await fetch(OPENROUTER_URL, {
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
): Promise<SummarizeResult> {
  const db = getFirestore();
  const models = FALLBACK_MODELS;
  // Priority order: no summary yet, then oldest lastEventAt (still active).
  const snap = await db.collection("civilizations").get();
  const all = snap.docs.map((d) => d.data() as Civilization);
  const missing = all.filter((c) => !c.summary || c.summary.length < 40);
  const rest = all
    .filter((c) => c.summary && c.summary.length >= 40)
    .sort((a, b) => a.lastEventAt.localeCompare(b.lastEventAt));
  const targets = [...missing, ...rest].slice(0, CIVS_PER_RUN);

  const errors: string[] = [];
  let updated = 0;
  for (const civ of targets) {
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
  return { attempted: targets.length, updated, errors };
}
