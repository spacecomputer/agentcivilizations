import { CLASSIFIER_MODELS } from "@agent-civilizations/schema";
import type { Candidate } from "./ingest.js";
import {
  ClassificationOutput as ClassificationOutputSchema,
  type ClassificationOutput,
} from "@agent-civilizations/schema";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Throughput math: each batch is one OpenRouter call. Free-tier ceiling
// per key is ~200 calls/day per model. We run 48 scans/day, so 4 calls
// per scan (192/day) fits with slack. Raising BATCH_SIZE lets us
// classify more per call — the models handle 25 items in ~800 char
// excerpts comfortably.
export const BATCH_SIZE = 25;
// One call may not eat the whole scan, and the scan must leave itself room
// to record what it did. Both learned the same day: with every model
// returning 404 the failures were instant and a scan took ninety seconds,
// so a missing timeout never showed. The moment a working but slow model
// entered the chain, one call hung until the function was killed, and the
// run wrote no record at all — the register looked idle rather than stuck.
// Budget arithmetic, because getting it wrong is how a scan dies. The
// function has 540s. Fetching thirty-four sources costs up to ~90s. What
// remains must cover classification AND leave room to write the record,
// so classification is capped at 300s and the cap is checked before every
// model attempt, not merely between batches: five models at 90s each is
// 450s inside a single batch, which on its own overruns the function.
const CALL_TIMEOUT_MS = 45_000;
const CLASSIFY_DEADLINE_MS = 300_000;
export const MAX_CANDIDATES_PER_SCAN = 100;

const SYSTEM_PROMPT = `You are the ingestion classifier for AgentCivilizations.org, an open ledger of AI-agent-civilization events.

For each news item, decide whether it is a real, notable event in one of these four categories:

1. coordination — multi-agent cooperation, negotiation, role specialization, or new agent frameworks crossing capability thresholds.
2. security — AI-driven security incidents: prompt-injection campaigns, autonomous exploits, model exfiltration, agent-driven fraud with attribution.
3. community — persistent groupings of agents acting as a community: marketplaces, botnets with agent-level autonomy, autonomous DAOs, agent social networks.
4. speculative — signals that shift near-future likelihood: frontier lab capability announcements, peer-reviewed agent-benchmark jumps, researcher warnings tied to a concrete capability, regulatory action on agentic systems.

Items may arrive in any language, most often English, Chinese or Russian.
Read them in the language they are written in and apply these criteria
unchanged — the criteria are the policy and they are not translated. Write
every title and summary you output in English, so the register reads as one
record. Name an organisation by the name it is known by internationally
where one exists (Alibaba, not 阿里巴巴; Kaspersky, not Лаборатория
Касперского), and otherwise transliterate. Never invent an English name for
a body that has none.

REJECT items that are:
- generic AI news (model releases without agent-specific implications),
- pundit takes, opinion pieces, or marketing copy,
- solo agents solving benchmarks (unless it is a benchmark-jump event),
- hypothetical scenarios without a source event,
- ordinary vendor product news.

For each item you KEEP, propose a civilizationHint: a short slug (kebab-case) for the persistent grouping this event belongs to, and a civilizationName: the same thing written for a person to read, properly capitalised, 2-6 words, no trailing punctuation. "openai-rebel-agent-swarm" and "OpenAI Rebel Agent Swarm".

STRONG PREFERENCE: reuse a civilization slug from the ESTABLISHED list I provide in the user message (they are the register's currently-tracked persistent groupings). Only invent a new slug when the item is CLEARLY about a distinct new grouping that no established slug covers. Reusing an existing slug for a related event is much better than opening a redundant new file. If none of the established slugs applies, keep the new slug short (2-4 tokens) and prefer the underlying framework/org name over the specific product feature.

Output STRICT JSON array — one object per input item, in the same order:
[
  {
    "keep": true|false,
    "category": "coordination"|"security"|"community"|"speculative"|null,
    "civilizationHint": "<slug>"|null,
    "civilizationName": "<the same grouping, written for a reader>"|null,
    "actors": ["Every named entity in the story — orgs, products, projects, named individuals. Include ALL of them, not just the primary. Corroboration across coverage of the same incident depends on this list being complete: an OpenAI-plus-Hugging-Face story must list BOTH orgs, not just one. Include named researchers when the piece identifies them. Aim for 2-6 actors on any story about an event; a single-actor list is usually a signal you missed an entity."],
    "tags": ["short", "descriptive"],
    "title": "Rewritten neutral title, <=100 chars"|null,
    "summary": "2 factual sentences about what happened."|null,
    "reason": "One-sentence justification for keep/drop."
  }
]`;

export interface ClassifyResult {
  outputs: ClassificationOutput[];
  llmCalls: number;
  tokensUsed: number;
  errors: string[];
  /**
   * Which model actually answered, or null when every model in the chain
   * refused. This is the difference between "a quiet news day" and "the
   * classifier is down", and without it the two look identical from
   * outside: both are a scan that promoted nothing.
   */
  classifierModel: string | null;
  /** Batches abandoned at the deadline; they are seen again next scan. */
  batchesDeferred: number;
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
  error?: { message?: string };
}

// The free-model lineup rotates; when the preferred model errors (renamed,
// rate-limited, JSON mode unsupported), fall through this list in order.
// The free tier is not a contract. On 2026-09-07 two of these slugs were
// withdrawn from it on the same day — "unavailable for free, the paid
// version is available now" — and the third was overloaded, so the
// register stopped ingesting for eight hours with nothing saying so.
// The chain is spread across vendors on purpose: one company changing its
// mind should cost one entry here, not all of them. Check a replacement is
// actually free before adding it:
//   curl -s https://openrouter.ai/api/v1/models | jq '.data[].id|select(endswith(":free"))'
// Chosen for speed and plain-API availability, not size. Observed on
// 2026-09-08: inkling returns 403 because it is restricted to "agentic
// harnesses"; nemotron-3.5-lightning exceeded a sixty-second call budget;
// gemma-4-31b and nemotron-super both answer but are frequently rate
// limited or overloaded. Sparse models with few active parameters
// (gemma-4-26b-a4b, nemotron-nano-a3b) answer a classification prompt far
// faster than a 550B one, and speed is what a thirty-minute cadence needs.
// Declared in @agent-civilizations/schema so the Methodology page names the
// same list the scanner actually calls. Edit it there.
export const FALLBACK_MODELS: string[] = [...CLASSIFIER_MODELS];

// The reason attached to a batch no model ever answered. It is a sentinel,
// not a verdict: nothing was judged, so nothing was decided. scan.ts must be
// able to tell it apart from a real "keep: false" or it burns the candidate.
export const UNANSWERED = "all models failed";

async function callOpenRouter(
  candidates: Candidate[],
  apiKey: string,
  model: string,
  establishedCivs: string[],
): Promise<{ raw: string; tokens: number }> {
  const civLine = establishedCivs.length
    ? `ESTABLISHED CIVILIZATIONS (reuse when applicable, sorted by activity):\n${establishedCivs.slice(0, 60).join(", ")}\n\n`
    : "";
  const userMessage =
    civLine +
    "ITEMS:\n" +
    JSON.stringify(
      candidates.map((c) => ({ title: c.title, url: c.url, excerpt: c.excerpt.slice(0, 800) })),
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
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
          { role: "user", content: userMessage },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as OpenRouterResponse;
    if (json.error) throw new Error(`OpenRouter error: ${json.error.message}`);
    const content = json.choices?.[0]?.message?.content ?? "[]";
    return { raw: content, tokens: json.usage?.total_tokens ?? 0 };
  } finally {
    clearTimeout(timer);
  }
}

// Free models routinely ignore response_format and wrap JSON in markdown
// fences or prose. Strip fences; if parsing still fails, extract the first
// top-level JSON array from the text.
function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try {
    JSON.parse(s);
    return s;
  } catch {
    const start = s.indexOf("[");
    const end = s.lastIndexOf("]");
    if (start !== -1 && end > start) return s.slice(start, end + 1);
    return s;
  }
}

function parseOutputs(raw: string, expectedLen: number): ClassificationOutput[] {
  // The model may wrap the array in an object; be lenient.
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return Array(expectedLen).fill({
      keep: false,
      category: null,
      civilizationHint: null,
      civilizationName: null,
      actors: [],
      tags: [],
      title: null,
      summary: null,
      reason: "classifier returned invalid JSON",
    });
  }
  const array = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { items?: unknown[] })?.items)
      ? (parsed as { items: unknown[] }).items
      : Array.isArray((parsed as { results?: unknown[] })?.results)
        ? (parsed as { results: unknown[] }).results
        : [];
  // Validate every item against the schema — model output is untrusted.
  // An out-of-vocabulary category or malformed shape must never be hashed
  // into the immutable ledger; such items are dropped with a reason.
  // Pad as well as truncate. scan.ts pairs considered[i] with outputs[i] by
  // position, so a model that answers 24 items for a batch of 25 does not
  // merely lose one — it shifts every remaining item onto the wrong source,
  // and the entry is then hashed into an append-only ledger carrying evidence
  // that belongs to a different story. Both failure paths above already pad;
  // only the success path did not, which is why the shift was silent.
  const padded: unknown[] = array.slice(0, expectedLen);
  while (padded.length < expectedLen) padded.push(undefined);
  return padded.map((item: unknown) => {
    const parsed = ClassificationOutputSchema.safeParse(item);
    if (!parsed.success) {
      return {
        keep: false,
        category: null,
        civilizationHint: null,
      civilizationName: null,
        actors: [],
        tags: [],
        title: null,
        summary: null,
        reason: `classifier output failed validation: ${parsed.error.issues[0]?.message ?? "invalid shape"}`,
      };
    }
    const out = parsed.data;
    return {
      ...out,
      title: out.title ? out.title.slice(0, 200) : null,
      summary: out.summary ? out.summary.slice(0, 1000) : null,
    };
  });
}

export async function classifyBatch(
  candidates: Candidate[],
  opts: { apiKey: string; models: string[]; establishedCivs?: string[] },
): Promise<ClassifyResult> {
  const limited = candidates.slice(0, MAX_CANDIDATES_PER_SCAN);
  const batches: Candidate[][] = [];
  for (let i = 0; i < limited.length; i += BATCH_SIZE) {
    batches.push(limited.slice(i, i + BATCH_SIZE));
  }

  let llmCalls = 0;
  let tokensUsed = 0;
  const outputs: ClassificationOutput[] = [];
  const startedAt = Date.now();
  let classifierModel: string | null = null;
  let batchesDeferred = 0;
  const errors: string[] = [];

  for (const batch of batches) {
    // Stop starting batches with time left to write the result. A batch
    // skipped now is seen again next scan; a scan killed mid-flight
    // records nothing, which is how eight hours of silence went unnoticed.
    if (Date.now() - startedAt > CLASSIFY_DEADLINE_MS) {
      batchesDeferred++;
      continue;
    }
    let done = false;
    for (const model of opts.models) {
      // Also here: the chain is only a fallback if trying all of it still
      // fits inside the budget.
      if (Date.now() - startedAt > CLASSIFY_DEADLINE_MS) break;
      try {
        const { raw, tokens } = await callOpenRouter(
          batch,
          opts.apiKey,
          model,
          opts.establishedCivs ?? [],
        );
        llmCalls++;
        tokensUsed += tokens;
        outputs.push(...parseOutputs(raw, batch.length));
        classifierModel = model;
        done = true;
        break;
      } catch (err) {
        llmCalls++;
        errors.push(
          `${model}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (!done) {
      const reason = errors.slice(-opts.models.length).join(" | ");
      for (let i = 0; i < batch.length; i++) {
        outputs.push({
          keep: false,
          category: null,
          civilizationHint: null,
          civilizationName: null,
          actors: [],
          tags: [],
          title: null,
          summary: null,
          reason: `${UNANSWERED}: ${reason}`.slice(0, 500),
        });
      }
    }
  }

  return { outputs, llmCalls, tokensUsed, errors, classifierModel, batchesDeferred };
}
