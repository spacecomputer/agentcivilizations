// The origins job — places the register's sponsors on the map.
//
// Nightly: tally every named actor across the ledger, make sure the
// curated seed is present, then for each unregistered actor with enough
// mentions try, in order of trustworthiness:
//   1. Wikidata — the organisation's headquarters claim (P159) and its
//      coordinates (P625), cited by QID. Verifiable by anyone.
//   2. The free-tier model — a best guess, stored as "inferred" and
//      shown as such.
//   3. Nothing — "unplaced" is a first-class outcome, never a blank.
// Finally recompute each civilization's origin from its dominant
// sponsor (publications are sources of record, not sponsors, and never
// place a file).

import { getFirestore } from "firebase-admin/firestore";
import type {
  ActorKind,
  ActorRegistryEntry,
  Civilization,
  CivilizationOrigin,
  Event,
  Origin,
  Sponsor,
} from "@agent-civilizations/schema";
import { actorSlug, normalizeActor } from "@agent-civilizations/schema";
import { ACTOR_SEED, type SeedActor } from "./actorSeed.js";
import { FALLBACK_MODELS } from "./classify.js";

const UA = "agent-civilizations/0.1 (https://agentcivilizations.org; origins job)";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_LOOKUPS_PER_RUN = 25;
const MIN_MENTIONS_FOR_LOOKUP = 2;
const RETRY_UNPLACED_AFTER_DAYS = 30;
const TOP_SPONSORS = 3;

export interface OriginsResult {
  actorsTallied: number;
  seeded: number;
  looked_up: number;
  placedByWikidata: number;
  placedByModel: number;
  unplaced: number;
  civilizationsUpdated: number;
  errors: string[];
}

interface Tally {
  name: string; // most common raw spelling
  spellings: Map<string, number>;
  mentions: number;
  civs: Set<string>;
  sampleTitles: string[];
}

// ---------------------------------------------------------------- tally

async function tallyActors(db: FirebaseFirestore.Firestore): Promise<{
  byActor: Map<string, Tally>;
  byCiv: Map<string, Map<string, number>>;
}> {
  const snap = await db.collection("events").get();
  const byActor = new Map<string, Tally>();
  const byCiv = new Map<string, Map<string, number>>();
  for (const doc of snap.docs) {
    const e = doc.data() as Event;
    const civMap = byCiv.get(e.civilizationId) ?? new Map<string, number>();
    byCiv.set(e.civilizationId, civMap);
    const seen = new Set<string>();
    for (const raw of e.actors) {
      const norm = normalizeActor(raw);
      if (norm.length < 3) continue;
      const slug = actorSlug(raw);
      if (seen.has(slug)) continue;
      seen.add(slug);
      const t: Tally = byActor.get(slug) ?? {
        name: raw,
        spellings: new Map<string, number>(),
        mentions: 0,
        civs: new Set<string>(),
        sampleTitles: [],
      };
      t.spellings.set(raw, (t.spellings.get(raw) ?? 0) + 1);
      t.mentions++;
      t.civs.add(e.civilizationId);
      if (t.sampleTitles.length < 3) t.sampleTitles.push(e.title);
      byActor.set(slug, t);
      civMap.set(slug, (civMap.get(slug) ?? 0) + 1);
    }
  }
  for (const t of byActor.values()) {
    let best = t.name;
    let n = 0;
    for (const [s, c] of t.spellings) if (c > n) { best = s; n = c; }
    t.name = best;
  }
  return { byActor, byCiv };
}

// ----------------------------------------------------------------- seed

function seedEntry(s: SeedActor, now: string): ActorRegistryEntry {
  return {
    id: actorSlug(s.name),
    name: s.name,
    aliases: (s.aliases ?? []).map(actorSlug),
    kind: s.kind,
    ...(s.homepage && { homepage: s.homepage }),
    origin: {
      city: s.city,
      country: s.country,
      lat: s.lat,
      lng: s.lng,
      provenance: "curated",
      provenanceRef: "functions/src/actorSeed.ts",
      determinedAt: now,
    },
    eventCount: 0,
    civilizationCount: 0,
    updatedAt: now,
  };
}

// Alias slugs resolve to their canonical entry id. Curated entries are
// applied last so their aliases win over any standalone document that a
// lookup created for the same name ("Astra" resolving to a UK company
// yields to OpenAI's curated alias).
function buildAliasIndex(entries: ActorRegistryEntry[]): Map<string, string> {
  const idx = new Map<string, string>();
  const ordered = [...entries].sort((a, b) =>
    Number(a.origin.provenance === "curated") - Number(b.origin.provenance === "curated"),
  );
  for (const e of ordered) {
    idx.set(e.id, e.id);
    for (const a of e.aliases) idx.set(a, e.id);
  }
  return idx;
}

// ------------------------------------------------------------- wikidata

interface WdSearchHit { id: string; label?: string; description?: string }
interface WdClaim {
  mainsnak?: { datavalue?: { value?: unknown } };
  qualifiers?: Record<string, Array<{ datavalue?: { value?: unknown } }>>;
}
interface WdEntity {
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, WdClaim[]>;
}

const ORG_WORDS =
  /(compan|corporat|organi[sz]ation|laborator|universit|institut|research|agenc|government|publisher|journal|startup|enterprise|foundation|non-?profit|software|firm|consortium|conference|association|develop|manufactur|technolog|intelligence|bank|ministry|department|repository|preprint)/i;

async function wd<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function claimItemId(c: WdClaim | undefined): string | null {
  const v = c?.mainsnak?.datavalue?.value as { id?: string } | undefined;
  return v?.id ?? null;
}
function claimCoords(
  c: WdClaim | undefined,
): { lat: number; lng: number } | null {
  const v = c?.mainsnak?.datavalue?.value as
    | { latitude?: number; longitude?: number }
    | undefined;
  if (typeof v?.latitude === "number" && typeof v?.longitude === "number")
    return { lat: v.latitude, lng: v.longitude };
  return null;
}
function qualifierCoords(
  c: WdClaim | undefined,
): { lat: number; lng: number } | null {
  const q = c?.qualifiers?.P625?.[0]?.datavalue?.value as
    | { latitude?: number; longitude?: number }
    | undefined;
  if (typeof q?.latitude === "number" && typeof q?.longitude === "number")
    return { lat: q.latitude, lng: q.longitude };
  return null;
}
function label(e: WdEntity | null | undefined): string | undefined {
  return e?.labels?.en?.value;
}

function kindFromDescription(d: string | undefined): ActorKind {
  const s = (d ?? "").toLowerCase();
  // Publications first: "news agency" must not fall through to the
  // government rule's "agency".
  if (/news agency|journal|publisher|preprint|repository|magazine|newspaper|conference|news website|media company/.test(s)) return "publication";
  if (/universit|college|school of/.test(s)) return "university";
  if (/central bank|government|agency|ministry|department|regulator|public body/.test(s)) return "government";
  if (/laborator|research (institute|organi[sz]ation|center|centre)|institute/.test(s)) return "lab";
  if (/compan|corporat|startup|enterprise|firm|business|manufactur|software/.test(s)) return "company";
  if (/framework|library|software project|open-source/.test(s)) return "agent-framework";
  if (/person|researcher|scientist|engineer|entrepreneur|executive/.test(s)) return "individual";
  return "unknown";
}

async function wikidataLookup(name: string): Promise<{
  origin: Origin;
  kind: ActorKind;
  homepage?: string;
  canonicalName: string;
} | null> {
  const now = new Date().toISOString();
  const search = await wd<{ search?: WdSearchHit[] }>(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&type=item&limit=5`,
  );
  const hits = search?.search ?? [];
  const hit = hits.find((h) => ORG_WORDS.test(h.description ?? "")) ?? null;
  if (!hit) return null;

  const ent = await wd<{ entities?: Record<string, WdEntity> }>(
    `https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`,
  );
  const org = ent?.entities?.[hit.id];
  if (!org?.claims) return null;
  const hq = org.claims.P159?.[0];
  const hqId = claimItemId(hq);
  let coords = qualifierCoords(hq) ?? claimCoords(org.claims.P625?.[0]);
  let city: string | undefined;
  let countryId: string | null = claimItemId(org.claims.P17?.[0]);
  if (hqId) {
    const cityEnt = await wd<{ entities?: Record<string, WdEntity> }>(
      `https://www.wikidata.org/wiki/Special:EntityData/${hqId}.json`,
    );
    const c = cityEnt?.entities?.[hqId];
    city = label(c);
    coords = coords ?? claimCoords(c?.claims?.P625?.[0]);
    countryId = countryId ?? claimItemId(c?.claims?.P17?.[0]);
  }
  if (!coords) return null; // an organisation with no locatable HQ
  let country: string | undefined;
  if (countryId) {
    const cEnt = await wd<{ entities?: Record<string, WdEntity> }>(
      `https://www.wikidata.org/wiki/Special:EntityData/${countryId}.json`,
    );
    const c = cEnt?.entities?.[countryId];
    const iso = c?.claims?.P297?.[0]?.mainsnak?.datavalue?.value;
    country = typeof iso === "string" ? iso : label(c);
  }
  const homepage = org.claims.P856?.[0]?.mainsnak?.datavalue?.value;
  return {
    origin: {
      ...(city && { city }),
      ...(country && { country }),
      lat: coords.lat,
      lng: coords.lng,
      provenance: "wikidata",
      provenanceRef: `wikidata:${hit.id}`,
      determinedAt: now,
    },
    kind: kindFromDescription(hit.description ?? org.descriptions?.en?.value),
    ...(typeof homepage === "string" && /^https?:/.test(homepage) && { homepage }),
    canonicalName: hit.label ?? name,
  };
}

// ---------------------------------------------------------------- model

const MODEL_PROMPT = `You place organisations on a map for a public register. Given an actor name and a few headlines it appeared in, answer ONLY with strict JSON:
{"known": true|false, "kind": "lab"|"company"|"university"|"government"|"collective"|"agent-framework"|"individual"|"publication"|"unknown", "city": "...", "country": "ISO 3166-1 alpha-2", "lat": number, "lng": number, "confidence": 0.0-1.0}
Rules: "known" is true only if you are confident which real-world organisation this is AND where its principal headquarters is. Individuals, generic groups ("researchers", "attackers"), products without a clear owner, and anything ambiguous get known:false. Never guess coordinates for something you cannot identify.`;

async function modelLookup(
  name: string,
  titles: string[],
  apiKey: string,
  models: string[],
): Promise<{ origin: Origin; kind: ActorKind } | null> {
  const user = `Actor: ${name}\nHeadlines:\n${titles.map((t) => `- ${t}`).join("\n")}`;
  for (const model of models) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "http-referer": "https://agentcivilizations.org",
          "x-title": "Agent Civilizations",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: "system", content: MODEL_PROMPT },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = json.choices?.[0]?.message?.content ?? "";
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) continue;
      const out = JSON.parse(m[0]) as {
        known?: boolean;
        kind?: string;
        city?: string;
        country?: string;
        lat?: number;
        lng?: number;
        confidence?: number;
      };
      if (!out.known || (out.confidence ?? 0) < 0.6) return null;
      if (typeof out.lat !== "number" || typeof out.lng !== "number") return null;
      if (Math.abs(out.lat) > 90 || Math.abs(out.lng) > 180) return null;
      const kind = (
        [
          "lab", "company", "university", "government", "collective",
          "agent-framework", "individual", "publication", "unknown",
        ] as ActorKind[]
      ).includes(out.kind as ActorKind)
        ? (out.kind as ActorKind)
        : "unknown";
      return {
        origin: {
          ...(out.city && { city: String(out.city).slice(0, 80) }),
          ...(out.country && { country: String(out.country).slice(0, 40) }),
          lat: out.lat,
          lng: out.lng,
          provenance: "inferred",
          provenanceRef: model,
          determinedAt: new Date().toISOString(),
        },
        kind,
      };
    } catch {
      continue;
    }
  }
  return null;
}

// ------------------------------------------------------------------ run

export async function runOrigins(opts: {
  apiKey: string;
  models?: string[];
}): Promise<OriginsResult> {
  const db = getFirestore();
  const models = opts.models ?? FALLBACK_MODELS;
  const now = new Date().toISOString();
  const result: OriginsResult = {
    actorsTallied: 0,
    seeded: 0,
    looked_up: 0,
    placedByWikidata: 0,
    placedByModel: 0,
    unplaced: 0,
    civilizationsUpdated: 0,
    errors: [],
  };

  // 1. Registry as it stands + curated seed (curated always wins).
  const regSnap = await db.collection("actorRegistry").get();
  const registry = new Map<string, ActorRegistryEntry>();
  for (const d of regSnap.docs) registry.set(d.id, d.data() as ActorRegistryEntry);
  {
    const batch = db.batch();
    let n = 0;
    // The seed file is the source of truth for curated entries: rewrite
    // them every run (66 writes — trivial) so alias edits reach Firestore.
    // Skipping already-curated entries left OpenAI's "Astra" alias unwritten,
    // the alias index never saw it, and the lookup phase re-created the
    // misidentified stray every night.
    for (const s of ACTOR_SEED) {
      const entry = seedEntry(s, now);
      const existing = registry.get(entry.id);
      const merged: ActorRegistryEntry = {
        ...entry,
        eventCount: existing?.eventCount ?? 0,
        civilizationCount: existing?.civilizationCount ?? 0,
      };
      batch.set(db.collection("actorRegistry").doc(entry.id), merged);
      registry.set(entry.id, merged);
      n++;
    }
    // A non-curated document sitting under a curated alias is a stray —
    // a lookup that ran before the alias existed. Remove it so the alias
    // is the only route to that name.
    for (const s of ACTOR_SEED) {
      for (const alias of (s.aliases ?? []).map(actorSlug)) {
        const stray = registry.get(alias);
        if (stray && stray.origin.provenance !== "curated" && stray.id !== actorSlug(s.name)) {
          batch.delete(db.collection("actorRegistry").doc(alias));
          registry.delete(alias);
          n++;
        }
      }
    }
    if (n > 0) await batch.commit();
    result.seeded = n;
  }
  const aliasIndex = buildAliasIndex([...registry.values()]);

  // 2. Tally.
  const { byActor, byCiv } = await tallyActors(db);
  result.actorsTallied = byActor.size;

  // 3. Look up the unregistered, most-mentioned first.
  const candidates = [...byActor.entries()]
    .filter(([slug, t]) => {
      if (t.mentions < MIN_MENTIONS_FOR_LOOKUP) return false;
      const canonical = aliasIndex.get(slug);
      if (!canonical) return true;
      const e = registry.get(canonical);
      if (!e) return true;
      if (e.origin.provenance !== "unplaced") return false;
      const age = (Date.now() - Date.parse(e.updatedAt)) / 86400_000;
      return age > RETRY_UNPLACED_AFTER_DAYS;
    })
    .sort((a, b) => b[1].mentions - a[1].mentions)
    .slice(0, MAX_LOOKUPS_PER_RUN);

  for (const [slug, t] of candidates) {
    result.looked_up++;
    let entry: ActorRegistryEntry | null = null;
    try {
      const w = await wikidataLookup(t.name);
      if (w) {
        entry = {
          id: slug,
          name: t.name,
          aliases: [],
          kind: w.kind,
          ...(w.homepage && { homepage: w.homepage }),
          origin: w.origin,
          eventCount: t.mentions,
          civilizationCount: t.civs.size,
          updatedAt: now,
        };
        result.placedByWikidata++;
      } else {
        const m = await modelLookup(t.name, t.sampleTitles, opts.apiKey, models);
        if (m) {
          entry = {
            id: slug,
            name: t.name,
            aliases: [],
            kind: m.kind,
            origin: m.origin,
            eventCount: t.mentions,
            civilizationCount: t.civs.size,
            updatedAt: now,
          };
          result.placedByModel++;
        }
      }
    } catch (err) {
      result.errors.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!entry) {
      entry = {
        id: slug,
        name: t.name,
        aliases: [],
        kind: "unknown",
        origin: { provenance: "unplaced", determinedAt: now },
        eventCount: t.mentions,
        civilizationCount: t.civs.size,
        updatedAt: now,
      };
      result.unplaced++;
    }
    await db.collection("actorRegistry").doc(slug).set(entry);
    registry.set(slug, entry);
    aliasIndex.set(slug, slug);
    await new Promise((r) => setTimeout(r, 250)); // be polite to Wikidata
  }

  // 4. Refresh counts on registered actors (cheap, keeps the table honest).
  {
    const batch = db.batch();
    let n = 0;
    for (const [slug, t] of byActor) {
      const canonical = aliasIndex.get(slug);
      if (!canonical) continue;
      batch.update(db.collection("actorRegistry").doc(canonical), {
        eventCount: t.mentions,
        civilizationCount: t.civs.size,
      });
      if (++n % 400 === 0) { await batch.commit(); }
    }
    if (n % 400 !== 0) await batch.commit().catch(() => undefined);
  }

  // 5. Civilization origins from dominant placed sponsor.
  const civSnap = await db.collection("civilizations").get();
  const civIds = new Set(civSnap.docs.map((d) => d.id));
  let batch = db.batch();
  let pending = 0;
  for (const [civId, counts] of byCiv) {
    if (!civIds.has(civId)) continue;
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const sponsors: Sponsor[] = [];
    for (const [slug, mentions] of ranked) {
      const canonical = aliasIndex.get(slug);
      const e = canonical ? registry.get(canonical) : undefined;
      const name = e?.name ?? byActor.get(slug)?.name ?? slug;
      if (e?.kind === "publication") continue; // sources of record, not sponsors
      sponsors.push({
        actorId: canonical ?? slug,
        actorName: name,
        mentions,
        ...(e && { origin: e.origin }),
      });
      if (sponsors.length >= TOP_SPONSORS) break;
    }
    const dominant = sponsors.find(
      (s) => s.origin && s.origin.provenance !== "unplaced",
    );
    const origin: Origin = dominant?.origin ?? {
      provenance: "unplaced",
      determinedAt: now,
    };
    const co: CivilizationOrigin = { origin, sponsors, updatedAt: now };
    batch.update(db.collection("civilizations").doc(civId), { origin: co });
    result.civilizationsUpdated++;
    if (++pending % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (pending % 400 !== 0) await batch.commit();

  return result;
}

// Exposed for tests.
export const _internal = { kindFromDescription, ORG_WORDS };
export type { Civilization };
