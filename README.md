# Agent Civilizations

> An open, tamper-evident ledger of AI-agent-civilization events — coordinated agent behavior, agent-driven incidents, and emergent agent communities — mined continuously from public sources.

**Live:** [AgentCivilizations.org](https://agentcivilizations.org)
**Data:** summaries and metadata under [CC0 1.0](LICENSE-DATA) · **Code:** [MIT](LICENSE)
**Verify it yourself:** `npx @agent-civilizations/verify --root=2026-09-07`

---

## What this is

The web observes a rising class of events that don't fit neatly in any existing tracker:

- Multi-agent coordination (research demos, production incidents, agent-to-agent negotiation)
- AI-driven security incidents (prompt-injection campaigns, autonomous exploits, model exfiltration)
- Emergent agent communities (botnets, agent marketplaces, autonomous DAOs, agent social networks)
- Speculative signals (lab announcements, capability jumps, researcher warnings)

`Agent Civilizations` scans public sources continuously, uses a free-tier LLM to classify and cluster events into **civilizations** (persistent agent groupings) and **threads** (event lineages), and writes each entry into a **hash-chained**, append-only Firestore ledger that anyone can independently verify.

See [`docs/TAXONOMY.md`](docs/TAXONOMY.md) for what counts and what doesn't, and [`ARCHITECTURE.md`](ARCHITECTURE.md) for how it fits together.

---

## Architecture in one paragraph

Cloud Scheduler fires every 30 minutes → a Cloud Function pulls RSS/Atom feeds (Google News, HN, arXiv cs.AI, security advisories) → candidate items go to OpenRouter (free-tier LLM) for relevance + entity extraction → surviving items become `Event` docs in Firestore, each stamped with `contentHash = sha256(canonicalJSON)` and `prevHash` of the previous event in its civilization thread. A daily "root" doc hashes the day's leaves. A standalone verifier (`packages/verify`) can walk the chain in the browser or from CLI and prove the ledger hasn't been tampered with. The frontend (Next.js static export on Firebase Hosting) reads Firestore directly for the timeline, civilization pages, and event detail.

```
┌──────────────┐    ┌────────────────┐    ┌───────────────┐    ┌─────────────┐
│ Cloud        │───▶│ ingest         │───▶│ classify      │───▶│ hashchain + │
│ Scheduler    │    │ (RSS/Atom)     │    │ (OpenRouter)  │    │ Firestore   │
└──────────────┘    └────────────────┘    └───────────────┘    └──────┬──────┘
                                                                     │
                                          ┌──────────────────────────┴──┐
                                          │                             │
                                    ┌─────▼─────┐                 ┌─────▼──────┐
                                    │ Next.js   │                 │ verify CLI │
                                    │ frontend  │                 │ + browser  │
                                    └───────────┘                 └────────────┘
```

---

## Repo layout

```
agent-civilizations/
├── apps/web/           Next.js 14 app router, static export
├── functions/          Cloud Functions (2nd gen) — ingest, classify, hashchain, api
├── packages/
│   ├── schema/         Zod schemas shared by frontend + functions
│   └── verify/         Standalone hash-chain verifier (browser + Node CLI)
├── docs/               Methodology, taxonomy, contributor guide
├── infra/              (firebase.json, firestore.rules, indexes live at repo root for Firebase CLI)
├── firebase.json
├── firestore.rules
└── firestore.indexes.json
```

---

## Quick start (local)

```bash
# 1. Install deps (npm workspaces)
npm install

# 2. Copy env template and fill in an OpenRouter key (free tier)
cp functions/.env.example functions/.env
# OPENROUTER_API_KEY=sk-or-v1-...

# 3. Run Firebase emulators (Firestore + Functions + Hosting)
npm run emulate

# 4. Trigger a scan manually
curl http://localhost:5001/agent-civilizations/us-central1/scanNow
```

---

## Deploy (GCP + Firebase)

Prerequisites: [Firebase CLI](https://firebase.google.com/docs/cli), [gcloud CLI](https://cloud.google.com/sdk/docs/install), a GCP project with billing enabled (Blaze plan — Cloud Functions require it; free tier still covers MVP traffic).

```bash
# 1. Create the GCP/Firebase project
gcloud projects create agent-civilizations --name="Agent Civilizations"
gcloud config set project agent-civilizations
gcloud services enable \
  firebase.googleapis.com \
  firestore.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com

# 2. Link Firebase and select the project
firebase login
firebase use --add agent-civilizations

# 3. Initialize Firestore (native mode, us-central)
gcloud firestore databases create --location=us-central1

# 4. Store the OpenRouter key as a Cloud Function secret
firebase functions:secrets:set OPENROUTER_API_KEY

# 5. Deploy everything
npm run build
firebase deploy

# 6. Wire up the custom domain (one-time, from Firebase console)
#    Hosting → Add custom domain → AgentCivilizations.org
#    Firebase issues a managed cert automatically.
```

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the full walkthrough, including scheduler setup and rate-limit tuning.

---

## Verifying the ledger

Anyone can independently walk the hash chain:

```bash
npx @agent-civilizations/verify --civilization=<id>
# or in the browser: https://agentcivilizations.org/verify
```

The verifier fetches every event doc in a thread, recomputes `contentHash` from the canonicalized JSON, and asserts each `prevHash` matches the previous event's `contentHash`. It also fetches the daily root doc and verifies the Merkle-style root over that day's leaves.

---

## Contributing

This is an open-source project. See [`CONTRIBUTING.md`](CONTRIBUTING.md). The taxonomy and classification prompt live in [`docs/TAXONOMY.md`](docs/TAXONOMY.md) and [`functions/src/classify.ts`](functions/src/classify.ts) — those are the two files with the highest leverage for improving what gets logged.

---

## License

Two licences, because the repository holds two different things.

**The register's own summaries and metadata** — every entry's title, summary, category,
actors, tags and hashes, and everything served from `/api/` — are dedicated to the public
domain under [CC0 1.0](LICENSE-DATA). Use them for anything, with or without credit.
The sources those entries point at retain their own rights; quote them from the publisher,
not from us.

**The code** in this repository is [MIT](LICENSE).
