# Architecture

## Goals

1. **Tamper-evident history.** A reader should be able to prove, without trusting us, that no event was silently edited or deleted after publication.
2. **Free to run at MVP scale.** OpenRouter free-tier LLM, Firebase free/Blaze pay-as-you-go, no paid data feeds.
3. **Boring stack.** Deployable by one person in an afternoon. No custom infra to babysit.
4. **Open to inspection.** All source, all prompts, all raw fetched articles kept and linkable.

## Non-goals (MVP)

- Real-time push / websockets. Polling every 30 min is fine.
- User accounts and comments. Read-only for now.
- Multi-region redundancy. `us-central1` only.
- Rich media / video ingestion. Text sources only.

---

## Data model (Firestore)

Firestore is document-based; we treat it like a keyed KV with secondary indexes.

### Collection: `civilizations`

A `Civilization` is a persistent grouping the classifier believes has continuity over time — a named agent framework's community, a botnet, a coordinated research effort, an emergent economy.

```ts
{
  id: string,                    // stable slug, e.g. "autogpt-swarm"
  name: string,
  aliases: string[],
  summary: string,               // 1-paragraph LLM summary, regenerated weekly
  category: "coordination" | "security" | "community" | "speculative",
  firstSeenAt: Timestamp,
  lastEventAt: Timestamp,
  eventCount: number,
  status: "active" | "dormant" | "extinct",
  headHash: string,              // contentHash of most recent event in thread
}
```

### Collection: `events`

Each `Event` is one entry in the ledger. Immutable after write.

```ts
{
  id: string,                    // ULID
  civilizationId: string,        // FK
  title: string,
  summary: string,               // 2-3 sentences, LLM-generated
  occurredAt: Timestamp,         // when the event happened (from source)
  recordedAt: Timestamp,         // when we wrote it (immutable)
  category: "coordination" | "security" | "community" | "speculative",
  confidence: "confirmed" | "candidate",  // "confirmed" requires ≥2 sources
  sources: {
    url: string,
    domain: string,
    title: string,
    fetchedAt: Timestamp,
    rawExcerpt: string,          // ≤2KB verbatim, for auditability
  }[],
  actors: string[],              // named agents, orgs, researchers
  tags: string[],
  contentHash: string,           // sha256 of canonical JSON of all above
  prevHash: string | null,       // contentHash of previous event in civilization
  seq: number,                   // 0, 1, 2, ... within civilization
}
```

`contentHash` is computed over a canonicalized JSON (sorted keys, no whitespace) of every field *except* `contentHash` itself and `confidence`. Confidence is the one editorial field allowed to change after entry (`candidate` → `confirmed` when a second independent source appears), so it lives outside the hash preimage; everything else is frozen by the chain. The exclusion list is defined once, as `MUTABLE_FIELDS` in `packages/verify`, and both producers and verifiers derive the preimage through the same `hashPreimage()` helper. `prevHash` is inside the canonicalization, so a change anywhere in history invalidates every downstream hash.

### Collection: `roots`

One doc per day. Anchors that day's events.

```ts
{
  id: string,                    // "2026-08-31"
  merkleRoot: string,            // sha256 root over sorted contentHashes of the day
  eventCount: number,
  civilizationCount: number,
  computedAt: Timestamp,
  prevRootHash: string | null,   // links days into a chain of chains
}
```

Written by a nightly Cloud Function. Roots are what a verifier pins to — pinning one root proves the entire prior history.

### Collection: `scanRuns`

Observability. One doc per scheduled scan invocation: sources fetched, items considered, items promoted, LLM calls made, tokens used, errors.

---

## Ingestion pipeline

```
scheduled trigger (every 30 min)
        │
        ▼
┌───────────────────┐
│ ingest.ts          │  fetch RSS/Atom for each configured source
│                    │  dedupe by URL hash (Firestore lookup)
└─────────┬──────────┘
          │  new candidates
          ▼
┌───────────────────┐
│ classify.ts        │  batch 10–20 candidates per OpenRouter call
│                    │  prompt: relevance? category? civilization?
└─────────┬──────────┘  outputs: keep/drop, entities, thread hint
          │  survivors
          ▼
┌───────────────────┐
│ hashchain.ts       │  resolve or create civilization
│                    │  compute contentHash, prevHash, seq
│                    │  Firestore batch write (event + civilization update)
└───────────────────┘
```

### Sources (initial set)

| Source | Feed | Weight |
|---|---|---|
| Hacker News front page | `https://hnrss.org/frontpage` | 1.0 |
| arXiv cs.AI new submissions | `http://export.arxiv.org/rss/cs.AI` | 0.8 |
| arXiv cs.MA (multi-agent) | `http://export.arxiv.org/rss/cs.MA` | 1.0 |
| Google News: "AI agent" | Google News RSS query | 0.7 |
| Google News: "autonomous agent hack" | Google News RSS query | 0.9 |
| The Register | RSS | 0.6 |
| Krebs on Security | RSS | 0.6 |
| Anthropic / OpenAI / DeepMind blogs | RSS | 0.5 |

All sources configured in `functions/src/sources.ts`. Easy to add more via PR.

### Rate-limit budget (OpenRouter free tier)

Assume ~200 free calls/day, ~20/min burst. Budget:

- 48 scheduled scans/day × 4 LLM calls/scan (batched) = 192 calls/day
- Weekly civilization-summary regeneration: 30 calls (spread across the week)
- Buffer for manual re-runs: ~50 calls

If a scan blows the budget, `classify.ts` degrades gracefully — items stay in the `candidates` collection and are picked up on the next window.

---

## Hash chain details

**Canonicalization.** Use RFC 8785 JSON Canonicalization Scheme. Deterministic; no library needed beyond a ~40-line sort-and-serialize.

**Genesis.** The first event in a civilization has `prevHash = null` and `seq = 0`.

**Verification** (from `packages/verify`):

```ts
async function verifyCivilization(id: string): Promise<VerifyResult> {
  const events = await fetchEventsForCivilization(id);  // ordered by seq
  let prevHash: string | null = null;
  for (const e of events) {
    const recomputed = sha256(canonicalize({ ...e, contentHash: undefined }));
    if (recomputed !== e.contentHash) return { ok: false, brokenAt: e.id, reason: "contentHash" };
    if (e.prevHash !== prevHash) return { ok: false, brokenAt: e.id, reason: "prevHash" };
    prevHash = e.contentHash;
  }
  return { ok: true, verified: events.length };
}
```

**Daily root.** `merkleRoot = sha256(concat(sortedContentHashes))` — a flat hash for MVP simplicity. Upgrade to a real Merkle tree later if we need efficient inclusion proofs.

**What this proves and does not.** It proves that no historical event was edited or reordered after the daily root was computed. It does not prove the classifier's judgment is correct, nor that we did not choose to omit an event at ingestion time. That's what open sources and open code are for.

---

## Frontend

- **Framework:** Next.js 14 (app router), static export (`output: "export"`). No server-side rendering needed; Firestore reads happen client-side with the public web SDK.
- **Read auth:** Firestore rules allow unauthenticated read on `civilizations`, `events`, `roots`. Writes are rejected — only the Admin SDK (from functions) can write.
- **Routes:**
  - `/` — timeline (recent events across all civilizations)
  - `/civilizations` — index, sorted by activity
  - `/civilizations/[id]` — single civilization page with its event thread
  - `/events/[id]` — event detail with sources and hash provenance
  - `/verify` — in-browser verifier UI
  - `/about`, `/methodology` — static docs

---

## Security posture

- OpenRouter key is a **Cloud Function secret**, never in the frontend bundle.
- Firestore rules: **read-open, write-closed** for the public. Admin SDK bypasses.
- No user data collected. No cookies beyond a preference for theme. No analytics in MVP.
- CSP: default-src 'self'; connects to `firestore.googleapis.com` and source article domains for previews.

---

## What's deliberately absent

- **No analytics.** No page tracking, no product analytics, no third-party beacons, no cookies beyond a theme preference. A public record is not a funnel; readers should not be measured. Operational visibility comes from Firebase Hosting request logs and Cloud Function logs, and from the `/stats` page — which is public and derives every number from the same Firestore any reader can query.
- **No client-side error tracking.** A silent failure of the browser verification is the only class of bug the register should never hide from a reader — so instead of routing it to Sentry, it renders as a visible `verify` state on the page itself. If the JS bundle throws before the crest paints, the reader sees a static, untouched page and can still walk the chain from the CLI (`npx @agent-civilizations/verify`) or from `/verify` on any working device.
- **No account system.** There is nothing to log into. Everything an operator can do (retract an event, add a source, edit the taxonomy) happens through PRs against the open repository.

## What's deliberately deferred

- Real Merkle tree with inclusion proofs (flat root is fine for MVP)
- Signed root anchoring to a public blockchain / OpenTimestamps
- Community submissions / wiki edits
- Multilingual sources
- Semantic search over the ledger
- Fine-tuned classifier (relying on free general-purpose LLMs for now)

Each of these is one PR away, none block launch.
