// The shapes this verifier needs, declared here rather than imported.
//
// A standalone verifier must not require the register's own packages to
// run: a reader who has to install our schema to check our arithmetic is
// still trusting us for something. These are structural, minimal, and
// compatible with @agent-civilizations/schema — the register's own code
// passes its full Event objects to these functions and typechecks.

export interface VerifiableSource {
  url: string;
  domain: string;
  title: string;
  fetchedAt: string;
  rawExcerpt: string;
  [k: string]: unknown;
}

export interface VerifiableEvent {
  id: string;
  civilizationId: string;
  title: string;
  contentHash: string;
  prevHash: string | null;
  seq: number;
  recordedAt: string;
  [k: string]: unknown;
}

// "flat-v1"   sha256 of the day's sorted contentHashes concatenated.
//             The register's first sealing algorithm; roots sealed under
//             it stay verifiable forever and are never recomputed.
// "merkle-v2" RFC 6962 binary Merkle tree over the same sorted leaves,
//             which additionally supports inclusion proofs for one entry.
export type RootAlgo = "flat-v1" | "merkle-v2";

export interface VerifiableRoot {
  id: string;
  merkleRoot: string;
  eventCount: number;
  prevRootHash: string | null;
  /** Absent means "flat-v1" — every root sealed before the tree existed. */
  rootAlgo?: RootAlgo;
  [k: string]: unknown;
}
