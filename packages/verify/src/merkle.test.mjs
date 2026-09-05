// The sealing algorithms and the inclusion proofs.
//
// Usage: node packages/verify/src/merkle.test.mjs

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  computeFlatRoot,
  computeMerkleRoot,
  computeMerkleTreeRoot,
  DEFAULT_ROOT_ALGO,
  hexToBytes,
  inclusionProof,
  rootAlgoOf,
  verifyInclusion,
  verifyRoot,
} from "../dist/index.js";

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const leaf = (h) => sha(Buffer.concat([Buffer.from([0x00]), Buffer.from(h, "hex")]));
const node = (l, r) => sha(Buffer.concat([Buffer.from([0x01]), Buffer.from(l, "hex"), Buffer.from(r, "hex")]));
const H = (n) => Array.from({ length: n }, (_, i) => sha(Buffer.from(`leaf-${i}`)));

// ---- flat-v1 is exactly what it always was ----
{
  const hashes = H(5);
  const expected = sha(Buffer.from([...hashes].sort().join("")));
  assert.equal(await computeFlatRoot(hashes), expected, "flat-v1 is sha256 of the sorted hashes concatenated");
  assert.equal(await computeMerkleRoot(hashes, "flat-v1"), expected, "the dispatcher reproduces a historical root");
  assert.notEqual(await computeMerkleRoot(hashes, "merkle-v2"), expected, "the tree is a different algorithm");
  assert.equal(DEFAULT_ROOT_ALGO, "merkle-v2", "new days seal under the tree");
  assert.equal(rootAlgoOf({}), "flat-v1", "a root with no rootAlgo predates the tree");
  assert.equal(rootAlgoOf({ rootAlgo: "merkle-v2" }), "merkle-v2");
}

// ---- order independence: the leaf set is what is sealed ----
{
  const hashes = H(7);
  const shuffled = [hashes[3], hashes[0], hashes[6], hashes[1], hashes[5], hashes[2], hashes[4]];
  assert.equal(await computeMerkleTreeRoot(hashes), await computeMerkleTreeRoot(shuffled), "the tree sorts its leaves");
  assert.equal(await computeFlatRoot(hashes), await computeFlatRoot(shuffled), "so does the flat root");
}

// ---- RFC 6962 shapes, computed by hand ----
{
  const one = H(1);
  assert.equal(await computeMerkleTreeRoot(one), leaf(one[0]), "a single leaf is its own root, under 0x00");

  const two = [...H(2)].sort();
  assert.equal(await computeMerkleTreeRoot(two), node(leaf(two[0]), leaf(two[1])), "two leaves hash under 0x01");

  const three = [...H(3)].sort();
  const promoted = node(node(leaf(three[0]), leaf(three[1])), leaf(three[2]));
  assert.equal(await computeMerkleTreeRoot(three), promoted, "an odd node is promoted, not duplicated");
}

// ---- CVE-2012-2459: duplicating the last leaf must not collide ----
{
  const three = H(3).sort();
  const fourWithDupe = [...three, three[2]];
  assert.notEqual(
    await computeMerkleTreeRoot(three),
    await computeMerkleTreeRoot(fourWithDupe),
    "a set and that set with its last leaf duplicated must seal differently",
  );
}

// ---- domain separation: a leaf can never be forged as an interior node ----
{
  const two = [...H(2)].sort();
  const root = await computeMerkleTreeRoot(two);
  assert.notEqual(root, sha(Buffer.concat([Buffer.from(two[0], "hex"), Buffer.from(two[1], "hex")])), "interior nodes carry the 0x01 tag");
}

// ---- every leaf of every tree size proves, and only the true leaf does ----
for (const n of [1, 2, 3, 4, 5, 7, 8, 9, 16, 33]) {
  const hashes = H(n);
  const root = await computeMerkleTreeRoot(hashes);
  for (const target of hashes) {
    const proof = await inclusionProof(hashes, target, "2026-09-04");
    assert.ok(proof, `n=${n}: a proof exists for every leaf`);
    assert.equal(proof.root, root, `n=${n}: the proof reconstructs the sealed root`);
    assert.equal(proof.treeSize, n);
    assert.ok(proof.path.length <= Math.ceil(Math.log2(n)) + 1, `n=${n}: the path is logarithmic, not the whole day`);
    const ok = await verifyInclusion(proof, root);
    assert.ok(ok.ok, `n=${n}: the proof verifies against the root`);
    // A tampered leaf must not verify.
    const forged = { ...proof, leaf: sha(Buffer.from("not in the day")) };
    assert.equal((await verifyInclusion(forged, root)).ok, false, `n=${n}: a foreign leaf is refused`);
    // A tampered sibling must not verify.
    if (proof.path.length) {
      const bentPath = proof.path.map((s, i) => (i === 0 ? { ...s, hash: sha(Buffer.from("wrong sibling")) } : s));
      assert.equal((await verifyInclusion({ ...proof, path: bentPath }, root)).ok, false, `n=${n}: a bent path is refused`);
      const flipped = proof.path.map((s, i) => (i === 0 ? { ...s, side: s.side === "left" ? "right" : "left" } : s));
      const flipCheck = await verifyInclusion({ ...proof, path: flipped }, root);
      if (proof.path[0].hash !== undefined && n > 1) {
        assert.equal(flipCheck.ok, false, `n=${n}: a flipped side is refused`);
      }
    }
  }
  assert.equal(await inclusionProof(hashes, sha(Buffer.from("absent"))), null, `n=${n}: an absent entry has no proof`);
}

// ---- verifyRoot dispatches on the sealed algorithm ----
{
  const hashes = H(6);
  const flat = await computeFlatRoot(hashes);
  const tree = await computeMerkleTreeRoot(hashes);

  const old = { id: "2026-09-01", merkleRoot: flat, eventCount: 6, prevRootHash: null };
  const oldResult = await verifyRoot(old, hashes);
  assert.ok(oldResult.ok, "a root sealed before the tree still verifies");
  assert.equal(oldResult.algo, "flat-v1");

  const now = { id: "2026-09-04", merkleRoot: tree, eventCount: 6, prevRootHash: flat, rootAlgo: "merkle-v2" };
  const nowResult = await verifyRoot(now, hashes);
  assert.ok(nowResult.ok, "a root sealed under the tree verifies under the tree");
  assert.equal(nowResult.algo, "merkle-v2");

  // Crossing the algorithms must fail, or versioning would be theatre.
  assert.equal((await verifyRoot({ ...old, merkleRoot: tree }, hashes)).ok, false);
  assert.equal((await verifyRoot({ ...now, merkleRoot: flat }, hashes)).ok, false);
  // A single missing entry breaks the day.
  assert.equal((await verifyRoot(now, hashes.slice(1))).ok, false, "a dropped entry breaks the seal");
}

// ---- hexToBytes refuses what is not a hash ----
{
  assert.deepEqual([...hexToBytes("00ff10")], [0, 255, 16]);
  assert.throws(() => hexToBytes("abc"), /hex/);
  assert.throws(() => hexToBytes("zz"), /hex/);
}

console.log("merkle.test: ALL PASS");
