# Deploy walkthrough

## One-time setup

### 1. GCP project

```bash
gcloud auth login
gcloud projects create agent-civilizations --name="Agent Civilizations"
gcloud config set project agent-civilizations
```

Link a billing account (required for Cloud Functions; the free tier still covers MVP traffic):

```bash
gcloud billing accounts list
gcloud billing projects link agent-civilizations --billing-account=XXXXXX-XXXXXX-XXXXXX
```

### 2. Enable APIs

```bash
gcloud services enable \
  firebase.googleapis.com \
  firestore.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com
```

### 3. Firebase

```bash
firebase login
firebase projects:addfirebase agent-civilizations
firebase use --add agent-civilizations
```

### 4. Firestore

```bash
gcloud firestore databases create --location=us-central1
```

### 5. OpenRouter key

Sign up at [openrouter.ai](https://openrouter.ai), grab a free key (starts with `sk-or-v1-`), then:

```bash
firebase functions:secrets:set OPENROUTER_API_KEY
# paste key when prompted
```

## Deploy

```bash
npm install
npm run build
firebase deploy
```

First deploy takes ~5 minutes. Subsequent deploys ~1–2 min.

## Wire up custom domain

1. Firebase Console → Hosting → Add custom domain
2. Enter `agentcivilizations.org`
3. Add the provided A/AAAA records at your DNS provider
4. Firebase provisions a managed SSL certificate (usually ready within 24h)

## Enable scheduled scans

The Cloud Function `scheduledScan` uses `onSchedule` from `firebase-functions/v2/scheduler`, which auto-creates the Cloud Scheduler job on first deploy. Verify:

```bash
gcloud scheduler jobs list --location=us-central1
```

Expected: a job named `firebase-schedule-scheduledScan-us-central1` running every 30 minutes.

## Verify it works

`scanNow` deploys as an authenticated Cloud Run service — public invoke is disabled deliberately so a stranger can't drain your free-tier LLM quota. Pass an identity token to trigger it:

```bash
# Trigger a manual scan (authenticated)
curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  https://us-central1-agent-civilizations.cloudfunctions.net/scanNow

# Check Firestore for new events
firebase firestore:query events --limit 5
```

The public read surface — `/`, `/civilizations`, `/verify`, `/stats`, `/feed.xml`, `/sitemap.xml` — needs no authentication.

## Cost expectations

At MVP scale (48 scans/day, ~200 events/day, ~1000 unique visitors/day):

| Service | Free tier | Expected use | Est. cost |
|---|---|---|---|
| Firebase Hosting | 10 GB/mo storage, 360 MB/day bandwidth | <5 GB, <100 MB/day | $0 |
| Firestore | 50k reads, 20k writes, 1 GB storage / day | <30k reads, <500 writes | $0 |
| Cloud Functions | 2M invocations, 400k GB-sec / month | ~50k invocations | $0 |
| Cloud Scheduler | 3 free jobs | 1 job | $0 |
| OpenRouter free tier | 200 calls / day | 200 calls / day | $0 |

**Expected total: $0/month** at MVP traffic. Blaze plan is required to enable Cloud Functions but bills nothing while under the free quotas.

## Rate-limit tuning

If OpenRouter's free tier is exhausted before end of day:

- Drop scan frequency in `functions/src/index.ts` (`schedule: "every 60 minutes"`).
- Reduce `MAX_CANDIDATES_PER_SCAN` in `functions/src/classify.ts`.
- Increase `BATCH_SIZE` (more items per LLM call → fewer calls, but longer prompts).
