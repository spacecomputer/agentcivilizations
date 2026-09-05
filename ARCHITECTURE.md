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

**Daily root.** Two sealing algorithms coexist, recorded per root in `rootAlgo`:

| `rootAlgo` | Sealing | Per-entry proof |
|---|---|---|
| `flat-v1` (absent) | `sha256(concat(sortedContentHashes))` | No — the day is resealed in full |
| `merkle-v2` | RFC 6962 binary Merkle tree over the same sorted leaves | Yes — about log₂(n) sibling hashes |

A root is **never recomputed**. Days sealed under `flat-v1` keep that root and the Bitcoin anchor already attached to it; `merkle-v2` applies to days sealed after the tree shipped, and `DEFAULT_ROOT_ALGO` in `packages/verify` is what new days use. Leaves are hashed under `0x00` and interior nodes under `0x01`, so no interior node can be presented as a leaf, and an odd node is promoted rather than duplicated — the collision RFC 6962 avoids and Bitcoin's tree does not.

Inclusion proofs are generated and checked client-side (`inclusionProof` / `verifyInclusion`), on the entry page and in the CLI. The proof is self-verifying: a forged sibling path cannot reconstruct an anchored root.

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
- Google Analytics (GA4) is loaded via the Firebase Analytics SDK, which sets its own cookies and reports page views to Google. It is the only third party the site talks to. It is skipped for readers who send Do Not Track or Global Privacy Control, on localhost, and wherever the SDK reports itself unsupported. No other user data is collected, and nothing about a reader is written to the ledger.
- CSP: default-src 'self'; connects to `firestore.googleapis.com` and source article domains for previews.

---

## What's deliberately absent

- **~~No analytics.~~** This was the original position: a public record is not a funnel, and readers should not be measured. It no longer holds. Google Analytics was added deliberately in September 2026, and this entry is amended rather than deleted because a document that quietly drops its own commitments is worth less than one that records changing them. What remains true: the register itself never records anything about a reader, no reader data reaches Firestore or the ledger, the analytics path is skipped for anyone sending Do Not Track or Global Privacy Control, and nothing about the site's function depends on it — the whole register, including in-browser verification, works with analytics blocked. The `/stats` page remains the public, self-derived view of the register's own activity, computed from the same Firestore any reader can query.
- **No client-side error tracking.** A silent failure of the browser verification is the only class of bug the register should never hide from a reader — so instead of routing it to Sentry, it renders as a visible `verify` state on the page itself. If the JS bundle throws before the crest paints, the reader sees a static, untouched page and can still walk the chain from the CLI (`npx @agent-civilizations/verify`) or from `/verify` on any working device.
- **No account system.** There is nothing to log into. Everything an operator can do (retract an event, add a source, edit the taxonomy) happens through PRs against the open repository.

## What's deliberately deferred

- Community submissions / wiki edits — a moderation surface, not a missing feature
- Multilingual sources — needs a classifier that reasons across languages, not just more feeds
- Semantic search over the ledger — a real product decision, and the tables are the record
- Fine-tuned classifier — unnecessary while free general-purpose models hold

Shipped since this list was written: OpenTimestamps root anchoring, and the RFC 6962 tree with per-entry inclusion proofs.

## Governance surfaces

Two operations change the public record and neither is a public endpoint. Both are authenticated callables invoked with a Cloud Run identity token, and both leave their trace in the ledger itself.

- **`retractNow`** writes a retraction: a new entry in the same file, chained onto the head, carrying `retracts`, a reason from a closed list, and a note. See `docs/RETRACTIONS.md`.
- **Seed edits** (`functions/src/actorSeed.ts`) move where files sit on the Survey's origins plate; they ship as their own commits.
