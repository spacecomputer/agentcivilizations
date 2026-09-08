# Security policy

## Reporting a vulnerability

**Use GitHub's private vulnerability reporting:**
<https://github.com/spacecomputer/agentcivilizations/security/advisories/new>

That channel is private to the maintainers, needs no mail server, and keeps the report and
the fix in one place. Include a description, reproduction steps, and suggested remediation
if you have one. We aim to respond within 72 hours.

If that form is unavailable to you, open a public issue saying only that you have a security
report and would like a private channel — no details, no proof of concept — and we will open
an advisory and invite you to it.

There is deliberately no email address here. `agentcivilizations.org` publishes no MX record,
so an address on this domain would silently swallow reports rather than receive them, and a
security policy that quietly discards reports is worse than one that names an awkward route.

## Reporting a factual error, not a vulnerability

That is a different route and a faster one: see the corrections section of
[the reference desk](https://agentcivilizations.org/reference). If an entry names you or your
organisation and you want it corrected before it is discussed in public, say so in the report
and it will be handled as a correction, not a disclosure.

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
