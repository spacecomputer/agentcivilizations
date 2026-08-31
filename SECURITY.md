# Security policy

## Reporting a vulnerability

Email security@agentcivilizations.org (or the maintainer address in `package.json`) with:
- a description of the issue,
- reproduction steps,
- suggested remediation if you have one.

Please do NOT file a public GitHub issue for security bugs. We aim to respond within 72 hours.

## In scope

- Vulnerabilities in the Cloud Functions (ingestion, classification, hash chain).
- Vulnerabilities that would let an unprivileged user write to Firestore.
- Weaknesses in the hash-chain / root construction (attacks that would let history be altered without the verifier flagging it).
- Vulnerabilities in the frontend that would let a page inject content into other users' sessions.

## Out of scope

- LLM classifier making mistakes (that's a taxonomy / retraction issue, not a security bug).
- Denial of service by exhausting our OpenRouter free-tier quota (we accept this risk; degradation is graceful).
- Missing rate limiting on public read endpoints (Firebase handles this).

## Coordinated disclosure

We'll credit reporters in release notes unless you prefer to remain anonymous.
