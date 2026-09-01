#!/usr/bin/env node
// Seed the Firestore emulator with demo civilizations, hash-chained events
// spread across several days, and sealed daily roots — enough for every
// surface of the register (feed, seals, fonds, certification) to render.
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

// Must mirror hashPreimage() in @agent-civilizations/verify: the preimage
// excludes contentHash and the mutable confidence field.
function eventPreimage(event) {
  const { contentHash, confidence, ...rest } = event;
  return rest;
}

function daysAgo(n, hour = 12) {
  const d = new Date(Date.now() - n * 86400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

const civs = [
  {
    id: "autogpt",
    name: "AutoGPT",
    category: "coordination",
    summary:
      "One of the earliest open-source autonomous-agent frameworks, with a large and persistent community around long-horizon LLM planning.",
  },
  {
    id: "chaosgpt",
    name: "ChaosGPT",
    category: "speculative",
    summary:
      "A demonstration project that instructed an autonomous agent with adversarial goals — a canonical example in AI safety discourse.",
    status: "dormant",
  },
  {
    id: "agent-swarm-hacking",
    name: "Agent Swarm Hacking",
    category: "security",
    summary:
      "Cluster of incidents involving coordinated LLM-driven vulnerability discovery and exploitation.",
  },
  {
    id: "settled-exchange",
    name: "Settled Exchange",
    category: "community",
    summary:
      "An early agent-to-agent service marketplace where autonomous agents contract and pay one another without human counterparties.",
  },
];

const events = [
  {
    civ: "autogpt",
    title: "AutoGPT crosses 150k GitHub stars",
    summary:
      "The AutoGPT repository crosses 150,000 stars, marking sustained interest in autonomous LLM-agent frameworks. Contributor counts continue to rise.",
    category: "coordination",
    confidence: "confirmed",
    occurredAt: daysAgo(30),
    sources: [
      { url: "https://example.com/autogpt-milestone", domain: "example.com", title: "AutoGPT milestone", fetchedAt: daysAgo(30, 13), rawExcerpt: "AutoGPT has crossed 150k stars on GitHub." },
      { url: "https://example.org/agent-frameworks-2026", domain: "example.org", title: "State of agent frameworks", fetchedAt: daysAgo(30, 14), rawExcerpt: "AutoGPT leads adoption among open agent frameworks." },
    ],
    actors: ["AutoGPT maintainers"],
  },
  {
    civ: "chaosgpt",
    title: "Researchers publish analysis of goal-adversarial agent runs",
    summary:
      "A peer-reviewed paper analyzes archived transcripts from ChaosGPT-style adversarial-goal agent runs and proposes containment strategies.",
    category: "speculative",
    confidence: "confirmed",
    occurredAt: daysAgo(16),
    sources: [
      { url: "https://example.com/chaosgpt-paper", domain: "example.com", title: "Adversarial-goal agent analysis", fetchedAt: daysAgo(16, 13), rawExcerpt: "New paper analyzes transcripts from adversarial-goal agent runs." },
      { url: "https://example.net/containment-review", domain: "example.net", title: "Containment strategies reviewed", fetchedAt: daysAgo(16, 15), rawExcerpt: "The study proposes three containment strategies for goal-adversarial agents." },
    ],
    actors: ["Example University AI Safety Lab"],
  },
  {
    civ: "agent-swarm-hacking",
    title: "Multi-agent swarm completes CTF competition without human intervention",
    summary:
      "A coordinated team of LLM agents autonomously solved a mid-tier capture-the-flag competition. Two independent write-ups corroborate the run.",
    category: "security",
    confidence: "confirmed",
    occurredAt: daysAgo(11),
    sources: [
      { url: "https://example.com/agent-ctf", domain: "example.com", title: "Agent swarm CTF result", fetchedAt: daysAgo(11, 13), rawExcerpt: "Multi-agent team autonomously solves CTF." },
      { url: "https://example.io/ctf-writeup", domain: "example.io", title: "Independent CTF write-up", fetchedAt: daysAgo(11, 16), rawExcerpt: "We confirm the swarm operated without human input during solve time." },
    ],
    actors: ["Red-team research collective"],
  },
  {
    civ: "agent-swarm-hacking",
    title: "Agent swarm identifies novel prompt-injection variant",
    summary:
      "During a public red-team exercise, a coordinated agent swarm identified a previously undocumented prompt-injection variant against a hosted agent product.",
    category: "security",
    confidence: "confirmed",
    occurredAt: daysAgo(2, 9),
    sources: [
      { url: "https://example.com/agent-swarm-injection", domain: "example.com", title: "Novel prompt-injection variant", fetchedAt: daysAgo(2, 10), rawExcerpt: "Coordinated agents identify new prompt-injection variant." },
      { url: "https://example.org/vendor-advisory", domain: "example.org", title: "Vendor advisory 2026-041", fetchedAt: daysAgo(2, 11), rawExcerpt: "We have patched the injection path reported by the exercise." },
    ],
    actors: ["Red-team research collective", "Hosted-agent vendor"],
  },
  {
    civ: "settled-exchange",
    title: "Agent marketplace reportedly settles first inter-agent service contract",
    summary:
      "A single trade publication reports two autonomous agents completing a paid service exchange end to end. Awaiting corroboration.",
    category: "community",
    confidence: "candidate",
    occurredAt: daysAgo(1, 15),
    sources: [
      { url: "https://example.com/settled-exchange", domain: "example.com", title: "First inter-agent settlement", fetchedAt: daysAgo(1, 16), rawExcerpt: "Two agents reportedly completed a paid service exchange without human counterparties." },
    ],
    actors: [],
  },
  {
    civ: "autogpt",
    title: "AutoGPT community ships multi-agent orchestration release",
    summary:
      "The framework's new release adds first-class support for persistent multi-agent teams with role specialization. Release notes and independent coverage agree on the feature set.",
    category: "coordination",
    confidence: "confirmed",
    occurredAt: daysAgo(1, 18),
    sources: [
      { url: "https://example.com/autogpt-release", domain: "example.com", title: "AutoGPT release notes", fetchedAt: daysAgo(1, 19), rawExcerpt: "This release introduces persistent multi-agent teams." },
      { url: "https://example.net/coverage", domain: "example.net", title: "Framework coverage", fetchedAt: daysAgo(1, 20), rawExcerpt: "The orchestration release is a notable step for open agent frameworks." },
    ],
    actors: ["AutoGPT maintainers"],
  },
];

async function main() {
  // Civilizations.
  for (const c of civs) {
    await db.collection("civilizations").doc(c.id).set({
      id: c.id,
      name: c.name,
      aliases: [],
      summary: c.summary,
      category: c.category,
      firstSeenAt: daysAgo(30),
      lastEventAt: daysAgo(30),
      eventCount: 0,
      status: c.status ?? "active",
      headHash: null,
    });
  }

  // Events, hash-chained per civilization. recordedAt mirrors occurredAt so
  // the feed's day grouping and the roots line up.
  const seqByCiv = {};
  const prevByCiv = {};
  const written = [];
  for (const [i, e] of events.entries()) {
    const seq = seqByCiv[e.civ] ?? 0;
    const prevHash = prevByCiv[e.civ] ?? null;
    const base = {
      id: `evt${String(i).padStart(4, "0")}`,
      civilizationId: e.civ,
      title: e.title,
      summary: e.summary,
      occurredAt: e.occurredAt,
      recordedAt: e.occurredAt,
      category: e.category,
      confidence: e.confidence,
      sources: e.sources,
      actors: e.actors,
      tags: [],
      retracts: [],
      prevHash,
      seq,
    };
    const contentHash = sha256(canonicalize(eventPreimage(base)));
    const full = { ...base, contentHash };
    await db.collection("events").doc(full.id).set(full);
    await db.collection("civilizations").doc(e.civ).update({
      lastEventAt: e.occurredAt,
      eventCount: FieldValue.increment(1),
      headHash: contentHash,
    });
    seqByCiv[e.civ] = seq + 1;
    prevByCiv[e.civ] = contentHash;
    written.push(full);
  }

  // Seal every day except the most recent one (it stays open).
  const byDay = new Map();
  for (const e of written) {
    const day = e.recordedAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  const days = [...byDay.keys()].sort();
  const openDay = days[days.length - 1];
  let prevRootHash = null;
  let sealed = 0;
  for (const day of days) {
    if (day === openDay) continue;
    const hashes = byDay
      .get(day)
      .map((e) => e.contentHash)
      .sort();
    const merkleRoot = sha256(hashes.join(""));
    await db.collection("roots").doc(day).set({
      id: day,
      merkleRoot,
      eventCount: hashes.length,
      civilizationCount: new Set(byDay.get(day).map((e) => e.civilizationId)).size,
      computedAt: `${day}T23:59:59.000Z`,
      prevRootHash,
    });
    prevRootHash = merkleRoot;
    sealed++;
  }

  console.log(
    `Seeded ${civs.length} civilizations, ${written.length} events, ${sealed} sealed roots (day ${openDay} left open).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
