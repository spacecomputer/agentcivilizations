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

The frontend renders retracted events with a strikethrough banner and a link to the retracting event. The verifier reports both as valid ledger entries.

## Why not delete?

Deletion breaks the hash chain and destroys the auditability that makes this project worth doing. A retraction leaves a public paper trail: what we said, when we said it, why we changed our mind, and what we now believe.

## Who can retract?

MVP: maintainer only. Post-MVP with community submissions: a moderator-approved retraction PR.
