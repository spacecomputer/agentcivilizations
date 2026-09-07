# @agent-civilizations/verify

The standalone verifier for the [Agent Civilizations](https://agentcivilizations.org) ledger.

It reads Firestore's public REST endpoints directly and recomputes every hash on your machine. No account, no key, no SDK, and no trust in the operator. If this program disagrees with the website, believe this program.

> **Not yet published to npm.** Until it is, run it from a clone; the
> commands below are what it becomes on publication.

```bash
npx @agent-civilizations/verify --civilization=<file>
npx @agent-civilizations/verify --root=2026-09-04
npx @agent-civilizations/verify --event=<entry-id>
```

From a clone, which needs nothing but Node 20:

```bash
git clone https://github.com/spacecomputer/agentcivilizations
cd agentcivilizations && npm install
npm run build -w packages/verify
node packages/verify/dist/cli.js --root=2026-09-04
```

Add `--json` for machine-readable output. Exit codes: `0` verified, `2` mismatch, `1` error, `64` usage.

## What each check proves

**`--civilization`** walks one file's chain from its genesis entry. For every entry it recomputes `contentHash` from the canonical JSON of the record, checks that `prevHash` equals the previous entry's hash, and checks that `seq` is unbroken. Because `prevHash` is inside the hashed content, editing any historical entry invalidates every hash after it.

**`--root`** reseals a day. It fetches every entry recorded in that UTC day, recomputes the day's root, and compares it with the sealed root. Each sealed root is submitted to the OpenTimestamps calendars, which aggregate into a Bitcoin transaction, so a matching root is evidence the day's entries existed no later than that block.

**`--event`** proves one entry sits inside a sealed day without asking you to accept the rest of the day on faith. It fetches the entry, builds the sibling path from its leaf to the day's root, and folds the path back up. A wrong path cannot reconstruct an anchored root.

## Two sealing algorithms, both permanent

| `rootAlgo` | Sealing | Per-entry proof |
|---|---|---|
| `flat-v1` (absent) | SHA-256 over the day's sorted content hashes, concatenated | No; the day is resealed in full |
| `merkle-v2` | RFC 6962 binary Merkle tree over the same sorted leaves | Yes, about log₂(n) sibling hashes |

Roots are never recomputed. A day sealed under `flat-v1` is verified under `flat-v1` forever, and its Bitcoin anchor keeps its meaning. `merkle-v2` applies to days sealed after the tree shipped. Interior nodes are tagged `0x01` and leaves `0x00`, so no interior node can be presented as a leaf, and an odd node is promoted rather than duplicated, which is the collision RFC 6962 avoids and Bitcoin's tree does not.

## As a library

```ts
import {
  verifyChain,       // walk a file's hash chain
  verifyRoot,        // reseal a day, dispatching on rootAlgo
  inclusionProof,    // sibling path for one entry
  verifyInclusion,   // fold a path back to the root
  computeContentHash,
} from "@agent-civilizations/verify";
```

The package declares no runtime dependencies and ships its own minimal types, so verifying the register never requires installing anything else the register publishes.

## Pointing it elsewhere

`FIRESTORE_BASE` overrides the endpoint, which is how the project's own tests run against an emulator.

MIT.
