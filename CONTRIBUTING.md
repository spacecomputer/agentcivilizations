# Contributing

Thank you for wanting to help build a public record of the agent era.

## Where to start

- **Improve the taxonomy.** [`docs/TAXONOMY.md`](docs/TAXONOMY.md) defines what counts. If you see the classifier including or excluding things it shouldn't, sharpen the definitions here first.
- **Add a source.** New RSS/Atom feed? Add it to [`functions/src/sources.ts`](functions/src/sources.ts) with a weight and open a PR.
- **Tune the classifier prompt.** [`functions/src/classify.ts`](functions/src/classify.ts) contains the prompt and few-shot examples. This has the highest leverage on ledger quality.
- **File issues** for events the classifier missed or misclassified — link the source URL and expected civilization.

## Local dev

```bash
npm install
cp functions/.env.example functions/.env  # add OPENROUTER_API_KEY
npm run emulate
```

The Firebase emulator suite runs Firestore, Functions, and Hosting locally. Fake events can be seeded via `npm run seed`.

## Code style

- TypeScript strict mode.
- ESLint + Prettier via `npm run lint` / `npm run fmt`.
- Small, focused PRs. Bug fix ≠ refactor.

## Immutability rule

**No PR is allowed to modify or delete an already-published `Event` document.** If an event is wrong, the fix is a new event that supersedes it and links to the retracted one via `retracts: [eventId]`. This preserves the hash chain and makes corrections auditable. See [`docs/RETRACTIONS.md`](docs/RETRACTIONS.md).

## Governance

The project has no formal governance yet. For now: PRs merged by the maintainer after CI green + one review. As contributors accumulate, we'll move to a small stewards group.

## Code of conduct

Contributor Covenant v2.1 applies. Report issues to the email in `SECURITY.md`.
