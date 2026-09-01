import type { Candidate } from "./ingest.js";
import {
  ClassificationOutput as ClassificationOutputSchema,
  type ClassificationOutput,
} from "@agent-civilizations/schema";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const BATCH_SIZE = 10;
export const MAX_CANDIDATES_PER_SCAN = 40;

const SYSTEM_PROMPT = `You are the ingestion classifier for AgentCivilizations.org, an open ledger of AI-agent-civilization events.

For each news item, decide whether it is a real, notable event in one of these four categories:

1. coordination — multi-agent cooperation, negotiation, role specialization, or new agent frameworks crossing capability thresholds.
2. security — AI-driven security incidents: prompt-injection campaigns, autonomous exploits, model exfiltration, agent-driven fraud with attribution.
3. community — persistent groupings of agents acting as a community: marketplaces, botnets with agent-level autonomy, autonomous DAOs, agent social networks.
4. speculative — signals that shift near-future likelihood: frontier lab capability announcements, peer-reviewed agent-benchmark jumps, researcher warnings tied to a concrete capability, regulatory action on agentic systems.

REJECT items that are:
- generic AI news (model releases without agent-specific implications),
- pundit takes, opinion pieces, or marketing copy,
- solo agents solving benchmarks (unless it is a benchmark-jump event),
- hypothetical scenarios without a source event,
- ordinary vendor product news.

For each item you KEEP, propose a civilizationHint: a short slug (kebab-case) for the persistent grouping this event belongs to. Reuse an obvious existing name (e.g. "autogpt", "chaosgpt", "openai-swarm") if the item names one. Only invent a new name when the item names a specific new grouping.

Output STRICT JSON array — one object per input item, in the same order:
[
  {
    "keep": true|false,
    "category": "coordination"|"security"|"community"|"speculative"|null,
    "civilizationHint": "<slug>"|null,
    "actors": ["Named entities, orgs, researchers"],
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
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
  error?: { message?: string };
}

// The free-model lineup rotates; when the preferred model errors (renamed,
// rate-limited, JSON mode unsupported), fall through this list in order.
export const FALLBACK_MODELS = [
  "minimax/minimax-m3:free",
  "z-ai/glm-5.2:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];

async function callOpenRouter(
  candidates: Candidate[],
  apiKey: string,
  model: string,
): Promise<{ raw: string; tokens: number }> {
  const userMessage = JSON.stringify(
    candidates.map((c) => ({ title: c.title, url: c.url, excerpt: c.excerpt.slice(0, 800) })),
  );
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
  return array.slice(0, expectedLen).map((item: unknown) => {
    const parsed = ClassificationOutputSchema.safeParse(item);
    if (!parsed.success) {
      return {
        keep: false,
        category: null,
        civilizationHint: null,
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
  opts: { apiKey: string; models: string[] },
): Promise<ClassifyResult> {
  const limited = candidates.slice(0, MAX_CANDIDATES_PER_SCAN);
  const batches: Candidate[][] = [];
  for (let i = 0; i < limited.length; i += BATCH_SIZE) {
    batches.push(limited.slice(i, i + BATCH_SIZE));
  }

  let llmCalls = 0;
  let tokensUsed = 0;
  const outputs: ClassificationOutput[] = [];
  const errors: string[] = [];

  for (const batch of batches) {
    let done = false;
    for (const model of opts.models) {
      try {
        const { raw, tokens } = await callOpenRouter(batch, opts.apiKey, model);
        llmCalls++;
        tokensUsed += tokens;
        outputs.push(...parseOutputs(raw, batch.length));
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
          actors: [],
          tags: [],
          title: null,
          summary: null,
          reason: `all models failed: ${reason}`.slice(0, 500),
        });
      }
    }
  }

  return { outputs, llmCalls, tokensUsed, errors };
}
