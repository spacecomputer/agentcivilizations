# Taxonomy

This document defines what qualifies as an event in the ledger, and how events cluster into civilizations. The classifier prompt in [`functions/src/classify.ts`](../functions/src/classify.ts) is a direct encoding of this document — keep them in sync.

## The four categories

### 1. Multi-agent coordination
Documented cases of two or more AI agents (LLM-based or otherwise) cooperating, negotiating, competing, delegating, or forming persistent structures.

**Qualifies:**
- Published research demonstrating agent-to-agent negotiation, market formation, or role specialization.
- Production incidents caused by unexpected coordination between agents (e.g. two trading bots colluding).
- New agent frameworks (Autogen, CrewAI, LangGraph, etc.) crossing meaningful adoption or capability thresholds.
- Verified real-world deployments of multi-agent systems at scale.

**Does not qualify:**
- Solo agents solving benchmarks.
- General LLM capability releases (unless they enable qualitatively new coordination).
- Hypothetical scenarios without a source event.

### 2. AI-driven security incidents
Real events where AI systems were the attacker, the target, or the enabling infrastructure of an incident.

**Qualifies:**
- Prompt-injection campaigns against deployed agents.
- Autonomous exploit generation or execution.
- Model exfiltration, weight theft, jailbreak-at-scale.
- Agent-driven fraud, phishing, or social engineering (with attribution or strong signal).
- Novel supply-chain attacks targeting AI infrastructure.

**Does not qualify:**
- Generic "AI could be used for X" warnings without a real incident.
- Ordinary vulnerabilities in AI vendor products (unless AI itself was the exploit vector).

### 3. Emergent agent communities
Persistent groupings of agents behaving as a community: shared protocols, economies, social layers, coordinated activity beyond a single deployment.

**Qualifies:**
- Agent marketplaces (agents buying/selling services from each other).
- Botnets or agent swarms with observable coordination.
- Autonomous DAOs whose primary actors are agents.
- Agent-native social networks or communication protocols.
- Agent-run services (accounts, wallets, business entities) with sustained activity.

**Does not qualify:**
- One-off demos without persistence.
- Human-run bot networks (traditional botnets without agent-level autonomy).

### 4. Speculative signals
Signals that shift the near-future likelihood of the other categories.

**Qualifies:**
- Frontier lab announcements of agent-relevant capabilities (long-horizon planning, tool use, self-improvement).
- Peer-reviewed capability jumps on agent benchmarks (SWE-bench, GAIA, WebArena, MLE-bench, etc.).
- Named-researcher warnings tied to a concrete new capability.
- Regulatory or standards actions specifically about agentic systems.

**Does not qualify:**
- Pundit takes, opinion pieces, marketing copy.
- Generic AI news (model releases without agent-specific implications).

## Confidence tiers

| Tier | Requirement | Where it appears |
|---|---|---|
| `confirmed` | ≥2 independent sources OR one primary source (paper, official incident report, court filing) | Default timeline |
| `candidate` | Single non-primary source | Filtered out by default, visible under "Candidates" toggle |

`candidate` → `confirmed` promotion happens automatically when a second qualifying source appears within 30 days.

## Civilizations vs events

- An **event** is a discrete happening (paper published, incident disclosed, milestone reached).
- A **civilization** is a persistent grouping the classifier believes has continuity — a named framework's community, a specific botnet, an ongoing research program.

**Heuristics for opening a new civilization:**
- Named entity that the classifier hasn't seen before AND
- Signal of persistence (>1 event across >30 days, OR primary-source declaration of an ongoing program).

**Heuristics for extending an existing civilization:**
- Named entity match OR
- Actor overlap (≥2 shared named actors) OR
- Explicit reference (this incident involves X system).

Ambiguous cases are logged with the higher-confidence civilization and cross-linked; the classifier prefers false continuity over duplicate civilizations, on the theory that merging is easy and forking after the fact is hard.

## Retractions

Events are immutable. When an event turns out to be wrong (source retracted, misclassified, duplicate), a new event with `retracts: [oldEventId]` supersedes it. Verifiers surface both. See [`RETRACTIONS.md`](RETRACTIONS.md).
