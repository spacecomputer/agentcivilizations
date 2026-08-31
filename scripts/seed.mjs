#!/usr/bin/env node
// Seed the Firestore emulator with a small set of demo events so the frontend
// has something to render before the first real scan.
//
// Usage: FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed.mjs

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

initializeApp({ projectId: "agent-civilizations" });
const db = getFirestore();

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys
    .filter((k) => value[k] !== undefined)
    .map((k) => JSON.stringify(k) + ":" + canonicalize(value[k]))
    .join(",") + "}";
}

function sha256(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

const civs = [
  {
    id: "autogpt",
    name: "AutoGPT",
    category: "coordination",
    summary: "One of the earliest open-source autonomous-agent frameworks, with a large and persistent community around long-horizon LLM planning.",
  },
  {
    id: "chaosgpt",
    name: "ChaosGPT",
    category: "speculative",
    summary: "A demonstration project that instructed an autonomous agent with adversarial goals — a canonical example in AI safety discourse.",
  },
  {
    id: "agent-swarm-hacking",
    name: "Agent Swarm Hacking",
    category: "security",
    summary: "Cluster of incidents involving coordinated LLM-driven vulnerability discovery and exploitation.",
  },
];

const events = [
  {
    civ: "autogpt",
    title: "AutoGPT crosses 150k GitHub stars",
    summary: "The AutoGPT repository crosses 150,000 stars, marking sustained interest in autonomous LLM-agent frameworks.",
    category: "coordination",
    occurredAt: "2026-08-01T00:00:00.000Z",
    sources: [
      { url: "https://example.com/autogpt-milestone", domain: "example.com", title: "AutoGPT milestone", fetchedAt: "2026-08-01T01:00:00.000Z", rawExcerpt: "AutoGPT has crossed 150k stars on GitHub." },
    ],
  },
  {
    civ: "chaosgpt",
    title: "Researchers publish paper analyzing goal-adversarial agent runs",
    summary: "A peer-reviewed paper analyzes archived transcripts from ChaosGPT-style adversarial-goal agent runs and proposes containment strategies.",
    category: "speculative",
    occurredAt: "2026-08-15T00:00:00.000Z",
    sources: [
      { url: "https://example.com/chaosgpt-paper", domain: "example.com", title: "Adversarial-goal agent analysis", fetchedAt: "2026-08-15T01:00:00.000Z", rawExcerpt: "New paper analyzes transcripts from adversarial-goal agent runs." },
    ],
  },
  {
    civ: "agent-swarm-hacking",
    title: "First documented multi-agent autonomous CTF win",
    summary: "A team demonstrates a swarm of LLM agents autonomously solving a mid-tier CTF competition without human intervention during solve time.",
    category: "security",
    occurredAt: "2026-08-20T00:00:00.000Z",
    sources: [
      { url: "https://example.com/agent-ctf", domain: "example.com", title: "Agent swarm CTF result", fetchedAt: "2026-08-20T01:00:00.000Z", rawExcerpt: "Multi-agent team autonomously solves CTF." },
    ],
  },
  {
    civ: "agent-swarm-hacking",
    title: "Follow-up: agent swarm identifies novel prompt-injection variant",
    summary: "During a public red-team exercise, a coordinated agent swarm identifies a novel prompt-injection variant against a hosted agent product.",
    category: "security",
    occurredAt: "2026-08-25T00:00:00.000Z",
    sources: [
      { url: "https://example.com/agent-swarm-injection", domain: "example.com", title: "Novel prompt-injection variant", fetchedAt: "2026-08-25T01:00:00.000Z", rawExcerpt: "Coordinated agents identify new prompt-injection variant." },
    ],
  },
];

async function main() {
  // Seed civilizations.
  for (const c of civs) {
    await db.collection("civilizations").doc(c.id).set({
      id: c.id,
      name: c.name,
      aliases: [],
      summary: c.summary,
      category: c.category,
      firstSeenAt: "2026-08-01T00:00:00.000Z",
      lastEventAt: "2026-08-01T00:00:00.000Z",
      eventCount: 0,
      status: "active",
      headHash: null,
    });
  }

  // Seed events with a real hash chain per civilization.
  const seqByCiv = {};
  const prevByCiv = {};
  for (const [i, e] of events.entries()) {
    const seq = seqByCiv[e.civ] ?? 0;
    const prevHash = prevByCiv[e.civ] ?? null;
    const base = {
      id: `evt${String(i).padStart(4, "0")}`,
      civilizationId: e.civ,
      title: e.title,
      summary: e.summary,
      occurredAt: e.occurredAt,
      recordedAt: new Date().toISOString(),
      category: e.category,
      confidence: "confirmed",
      sources: e.sources,
      actors: [],
      tags: [],
      retracts: [],
      prevHash,
      seq,
    };
    const contentHash = sha256(canonicalize(base));
    const full = { ...base, contentHash };
    await db.collection("events").doc(full.id).set(full);
    await db.collection("civilizations").doc(e.civ).update({
      lastEventAt: e.occurredAt,
      eventCount: FieldValue.increment(1),
      headHash: contentHash,
    });
    seqByCiv[e.civ] = seq + 1;
    prevByCiv[e.civ] = contentHash;
  }

  console.log(`Seeded ${civs.length} civilizations and ${events.length} events.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
