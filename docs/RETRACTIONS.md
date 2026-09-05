# Retractions

Events in the ledger are immutable — that's what makes the hash chain meaningful. When an event is wrong, we do not edit or delete it. We publish a new event that supersedes it.

## The retraction event

A retraction is a normal `Event` with two extra fields:

```ts
{
  ...,
  retracts: [oldEventId],
  retractionReason: "duplicate" | "source-retracted" | "misclassified" | "hoax",
  retractionNotes: string,      // human-readable explanation
}
```

A retracted entry carries a `Superseded` panel naming the date and reason, and linking to the entry that supersedes it; the retracting entry carries a `Supersedes` block pointing back. Both remain valid ledger entries and both verify — the chain does not care which of them is the correction.

## Why not delete?

Deletion breaks the hash chain and destroys the auditability that makes this project worth doing. A retraction leaves a public paper trail: what we said, when we said it, why we changed our mind, and what we now believe.

## Issuing one

`retractNow` is an authenticated callable, invoked the way the register's other governance functions are:

```bash
curl -X POST "$RETRACT_URL" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "content-type: application/json" \
  -d '{"eventId":"01M...","reason":"misclassified","notes":"Why this entry was wrong, in plain words."}'
```

It refuses a reason outside the list above, a note shorter than twenty characters, an entry that does not exist, and an entry already retracted. It writes one entry, chained onto the head of the same file, and returns its id and `contentHash`. The next nightly root seals it and OpenTimestamps anchors it, so a retraction is exactly as permanent as the mistake it corrects.

## Who can retract?

MVP: maintainer only. Post-MVP with community submissions: a moderator-approved retraction PR.
