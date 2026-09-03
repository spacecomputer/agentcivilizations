// The origins job — places the register's files at the headquarters of
// their party of record.
//
// Nightly: tally every named actor across the ledger, make sure the
// curated seed is present, then for each unregistered organisation with
// enough mentions try, in order of trustworthiness:
//   1. Wikidata — the organisation's headquarters claim (P159) and its
//      coordinates (P625), cited by QID, accepted only when the hit's
//      label matches the name we asked for.
//   2. The free-tier model — a best guess, stored as "inferred", and only
//      for kinds that can place a file.
//   3. Nothing — "unplaced" is a first-class outcome, never a blank.
//
// Guards, each a citable rule:
//   - only organisations place a file (PLACING_KINDS); people, author
//     groups, publications, products and protocols are recorded and refused
//   - a name matching the collective pattern never enters the lookup queue
//   - a product name resolves to its maker (parenthetical stripped, then a
//     longest whole-word-prefix alias) and is recorded as kind "product"
//   - countries are ISO alpha-2 or absent
//   - every placed file records who placed it and at what rank; every
//     unplaced file records why
// Finally recompute each civilization's origin from the first located
// organisation in its ranked actor list.

import { getFirestore } from "firebase-admin/firestore";
import type {
  ActorKind,
  ActorRegistryEntry,
  CivilizationOrigin,
  Event,
  Origin,
  Sponsor,
  SponsorExclusion,
  UnplacedReason,
} from "@agent-civilizations/schema";
import { PLACING_KINDS, actorSlug, normalizeActor } from "@agent-civilizations/schema";
import { ACTOR_SEED, SEED_VERSION, type SeedActor } from "./actorSeed.js";
import { FALLBACK_MODELS } from "./classify.js";

const UA = "agent-civilizations/0.1 (https://agentcivilizations.org; origins job)";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_LOOKUPS_PER_RUN = 25;
const MIN_MENTIONS_FOR_LOOKUP = 2;
const RETRY_UNPLACED_AFTER_DAYS = 30;
const TOP_SPONSORS = 5; // recorded on the file; the placing search covers the whole ranked list

export interface OriginsResult {
  actorsTallied: number;
  seeded: number;
  collectivesGated: number;
  productsResolved: number;
  looked_up: number;
  placedByWikidata: number;
  wikidataRejected: number;
  placedByModel: number;
  modelRefused: number;
  unplaced: number;
  civilizationsUpdated: number;
  filesPlaced: number;
  filesUnplaced: Record<UnplacedReason, number>;
  errors: string[];
}

interface Tally {
  name: string; // most common raw spelling
  spellings: Map<string, number>;
  mentions: number;
  civs: Set<string>;
  sampleTitles: string[];
}

// ------------------------------------------------------------------ rules

// Names that denote a group of people rather than an organisation. They
// are recorded as kind "collective" and never looked up or placed.
const COLLECTIVE_TAIL =
  /\b(authors?|researchers?|users?|developers?|maintainers?|contributors?|attackers?|hackers?|scammers?|operators?|actors?|litigants?|judges?|victims?|customers?|clients?|participants?|workers?|experts?|analysts?|engineers?|students?|reviewers?|moderators?|members?|founders?|agents|bots|models|entrants?|patients?|swarms?|firms|companies|startups|vendors|providers|organi[sz]ations|institutions|banks|governments|regulators|nations|countries|people|citizens|consumers|players|readers|subscribers|households|families|officials|lawmakers|legislators|executives|leaders|investors|shareholders|creditors|buyers|sellers|traders|team|et al\.?|community|staff|employees|volunteers)\b\s*(\([^)]*\))?\s*$/i;
const COLLECTIVE_WHOLE =
  /^(researchers|attackers|users|hackers|unknown|the team|a team|scammers|operators|threat actors?|individual litigant|court(?: \(.*\))?)$/i;
export function isCollectiveName(raw: string): boolean {
  const s = raw.trim();
  return COLLECTIVE_WHOLE.test(s) || COLLECTIVE_TAIL.test(s);
}

// A name shaped like a person's — two or three capitalised words with no
// organisation word among them — is recorded as an individual when it is
// not in the registry. Registered names never pass through this rule; a
// wrong call is visible on the leaf as "(individual)" and is corrected by
// a seed entry.
const ORG_TOKENS =
  /^(ai|labs?|lab|inc|corp|corporation|co|ltd|llc|plc|gmbh|sa|ag|group|partners|ventures|capital|finance|financial|bank|technologies|technology|tech|systems|networks?|security|cloud|software|services|solutions|foundation|institute|university|college|school|agency|council|commission|ministry|department|bureau|exchange|media|news|press|times|journal|health|energy|motors|airlines?|studios?|games|research|analytics|robotics|dynamics|intelligence|computing|digital|global|international|national|federal|state|city|county|society|association|union|alliance|consortium|project|initiative|platform|protocol|network|fund|trust|holdings|industries|electronics|semiconductor|telecom|mobile|wireless|payments?|insurance|logistics|automotive|aerospace|defense|defence|pharma|biotech|medical|hospital|clinic|police|court|army|navy|force|command|center|centre|office|authority|regulator|board|committee|party|government|house|senate|congress|parliament|assembly|federation|league|club|team|works|web|online|app|apps|store|shop|market|markets|exchange|coin|chain|ledger|dao|open|openai|deepmind|meta|google|microsoft|amazon|apple|nvidia|ibm|area|bay|valley|region|district|coast|island|street|avenue|road|park|square|north|south|east|west)$/i;
export function looksLikePerson(raw: string): boolean {
  const s = raw.trim();
  if (/[0-9&@,/()"]/.test(s)) return false; // a period is allowed only as an initial's
  const tokens = s.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 4) return false;
  const particles = new Set(["de", "da", "di", "du", "del", "della", "van", "von", "der", "den", "la", "le", "al", "bin", "ibn", "y", "e"]);
  let capitalised = 0;
  for (const t of tokens) {
    if (ORG_TOKENS.test(t)) return false;
    if (particles.has(t.toLowerCase())) continue;
    // "Anying", "Jean-Luc", "O'Brien", "J."
    if (!/^[A-Z][a-z'’]+(-[A-Za-z][a-z'’]+)*$/.test(t) && !/^[A-Z]\.$/.test(t)) return false; // an initial needs its period
    capitalised++;
  }
  return capitalised >= 2 && capitalised <= 3;
}

function isoCountry(v: unknown): string | undefined {
  return typeof v === "string" && /^[A-Z]{2}$/.test(v) ? v : undefined;
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
  const placed = s.placed !== false && typeof s.lat === "number" && typeof s.lng === "number";
  return {
    id: actorSlug(s.name),
    name: s.name,
    aliases: (s.aliases ?? []).map(actorSlug),
    kind: s.kind,
    ...(s.homepage && { homepage: s.homepage }),
    ...(s.productOf && { productOf: actorSlug(s.productOf) }),
    origin: placed
      ? {
          city: s.city,
          country: s.country,
          lat: s.lat,
          lng: s.lng,
          provenance: "curated",
          provenanceRef: `functions/src/actorSeed.ts@${SEED_VERSION}`,
          determinedAt: now,
        }
      : {
          provenance: "unplaced",
          provenanceRef: `functions/src/actorSeed.ts@${SEED_VERSION}${s.placed === false ? " · do-not-place" : ""}`,
          determinedAt: now,
        },
    eventCount: 0,
    civilizationCount: 0,
    updatedAt: now,
  };
}

// Alias slugs resolve to their canonical entry id. Curated entries are
// applied last so their aliases win over any standalone document a lookup
// created for the same name; products resolve to their maker.
function buildAliasIndex(entries: ActorRegistryEntry[]): Map<string, string> {
  const idx = new Map<string, string>();
  const ordered = [...entries].sort(
    (a, b) => Number(a.origin.provenance === "curated") - Number(b.origin.provenance === "curated"),
  );
  for (const e of ordered) {
    idx.set(e.id, e.productOf ?? e.id);
    for (const a of e.aliases) idx.set(a, e.productOf ?? e.id);
  }
  return idx;
}

// Resolve a raw actor name to a registry id: exact slug, then the slug
// with a trailing parenthetical stripped ("OpenAI (GPT-5-mini)" → openai),
// then the longest registry name or alias that is a whole-word prefix of
// the normalised name ("Google DeepMind Research" → google-deepmind,
// "Claude Opus 5.1" → anthropic). Returns the canonical id and whether
// the match was by prefix (a product-style name worth recording).
export function resolveActor(
  raw: string,
  aliasIndex: Map<string, string>,
): { id: string; via: "exact" | "parenthetical" | "prefix" } | null {
  const direct = aliasIndex.get(actorSlug(raw));
  if (direct) return { id: direct, via: "exact" };
  const stripped = raw.replace(/\s*\([^)]*\)\s*$/, "");
  if (stripped !== raw) {
    const hit = aliasIndex.get(actorSlug(stripped));
    if (hit) return { id: hit, via: "parenthetical" };
  }
  const norm = normalizeActor(raw);
  let best: { id: string; len: number } | null = null;
  for (const [aliasSlug, id] of aliasIndex) {
    const alias = aliasSlug.replace(/-/g, " ");
    if (alias.length < 3) continue;
    if (norm === alias || norm.startsWith(alias + " ")) {
      if (!best || alias.length > best.len) best = { id, len: alias.length };
    }
  }
  return best ? { id: best.id, via: "prefix" } : null;
}

// ------------------------------------------------------------- wikidata

interface WdSearchHit { id: string; label?: string; description?: string; aliases?: string[] }
interface WdClaim {
  mainsnak?: { datavalue?: { value?: unknown } };
  qualifiers?: Record<string, Array<{ datavalue?: { value?: unknown } }>>;
}
interface WdEntity {
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  aliases?: Record<string, Array<{ value: string }>>;
  claims?: Record<string, WdClaim[]>;
}

const ORG_WORDS =
  /(compan|corporat|organi[sz]ation|laborator|universit|institut|research|agenc|government|publisher|journal|startup|enterprise|foundation|non-?profit|software|firm|consortium|conference|association|develop|manufactur|technolog|intelligence|bank|ministry|department|repository|preprint|regulator|authority)/i;

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
function claimCoords(c: WdClaim | undefined): { lat: number; lng: number } | null {
  const v = c?.mainsnak?.datavalue?.value as { latitude?: number; longitude?: number } | undefined;
  if (typeof v?.latitude === "number" && typeof v?.longitude === "number")
    return { lat: v.latitude, lng: v.longitude };
  return null;
}
function qualifierCoords(c: WdClaim | undefined): { lat: number; lng: number } | null {
  const q = c?.qualifiers?.P625?.[0]?.datavalue?.value as { latitude?: number; longitude?: number } | undefined;
  if (typeof q?.latitude === "number" && typeof q?.longitude === "number")
    return { lat: q.latitude, lng: q.longitude };
  return null;
}
function label(e: WdEntity | null | undefined): string | undefined {
  return e?.labels?.en?.value;
}

export function kindFromDescription(d: string | undefined): ActorKind {
  const s = (d ?? "").toLowerCase();
  // Publications first: "news agency" must not fall through to the
  // government rule's "agency".
  if (/news agency|journal|publisher|preprint|repository|magazine|newspaper|conference|news website|media company/.test(s)) return "publication";
  if (/universit|college|school of/.test(s)) return "university";
  if (/central bank|government|agency|ministry|department|regulator|public body|law enforcement|police/.test(s)) return "government";
  if (/laborator|research (institute|organi[sz]ation|center|centre)|institute/.test(s)) return "lab";
  if (/compan|corporat|startup|enterprise|firm|business|manufactur|software|bank/.test(s)) return "company";
  if (/framework|library|software project|open-source/.test(s)) return "agent-framework";
  if (/protocol|standard|specification/.test(s)) return "protocol";
  if (/person|researcher|scientist|engineer|entrepreneur|executive|human/.test(s)) return "individual";
  return "unknown";
}

// A hit is accepted only when its label (or one of its English aliases)
// matches the name we asked for — a description that merely sounds
// organisational is not evidence that it is the same organisation.
function nameMatches(name: string, hit: WdSearchHit, ent: WdEntity | undefined): boolean {
  const want = normalizeActor(name);
  if (hit.label && normalizeActor(hit.label) === want) return true;
  for (const a of hit.aliases ?? []) if (normalizeActor(a) === want) return true;
  for (const a of ent?.aliases?.en ?? []) if (normalizeActor(a.value) === want) return true;
  return false;
}

async function wikidataLookup(name: string): Promise<
  | { ok: true; origin: Origin; kind: ActorKind; homepage?: string; canonicalName: string }
  | { ok: false; rejected: number }
> {
  const now = new Date().toISOString();
  const search = await wd<{ search?: WdSearchHit[] }>(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&type=item&limit=5`,
  );
  const hits = (search?.search ?? []).filter((h) => ORG_WORDS.test(h.description ?? "")).slice(0, 3);
  let rejected = 0;
  for (const hit of hits) {
    const ent = await wd<{ entities?: Record<string, WdEntity> }>(
      `https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`,
    );
    const org = ent?.entities?.[hit.id];
    if (!org?.claims) { rejected++; continue; }
    if (!nameMatches(name, hit, org)) { rejected++; continue; }
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
    if (!coords) { rejected++; continue; }
    let country: string | undefined;
    if (countryId) {
      const cEnt = await wd<{ entities?: Record<string, WdEntity> }>(
        `https://www.wikidata.org/wiki/Special:EntityData/${countryId}.json`,
      );
      const c = cEnt?.entities?.[countryId];
      country = isoCountry(c?.claims?.P297?.[0]?.mainsnak?.datavalue?.value);
    }
    const homepage = org.claims.P856?.[0]?.mainsnak?.datavalue?.value;
    return {
      ok: true,
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
  return { ok: false, rejected };
}

// ---------------------------------------------------------------- model

const MODEL_PROMPT = `You place organisations on a map for a public register. Given an actor name and a few headlines it appeared in, answer ONLY with strict JSON:
{"known": true|false, "kind": "lab"|"company"|"university"|"government"|"collective"|"agent-framework"|"individual"|"publication"|"product"|"protocol"|"unknown", "city": "...", "country": "ISO 3166-1 alpha-2", "lat": number, "lng": number, "confidence": 0.0-1.0}
Rules: "known" is true only if you are confident which real-world organisation this is AND where its principal headquarters is. Individuals, generic groups ("researchers", "attackers"), products and protocols without a clear owner, and anything ambiguous get known:false with the right kind. Never guess coordinates for something you cannot identify.`;

const MODEL_KINDS: ActorKind[] = [
  "lab", "company", "university", "government", "collective",
  "agent-framework", "individual", "publication", "product", "protocol", "unknown",
];

async function modelLookup(
  name: string,
  titles: string[],
  apiKey: string,
  models: string[],
): Promise<{ kind: ActorKind; origin: Origin | null; model: string } | null> {
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
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = json.choices?.[0]?.message?.content ?? "";
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) continue;
      const out = JSON.parse(m[0]) as {
        known?: boolean; kind?: string; city?: string; country?: string;
        lat?: number; lng?: number; confidence?: number;
      };
      const kind = MODEL_KINDS.includes(out.kind as ActorKind) ? (out.kind as ActorKind) : "unknown";
      // Only organisations place; the model's kind is recorded either way.
      if (!PLACING_KINDS.has(kind)) return { kind, origin: null, model };
      if (!out.known || (out.confidence ?? 0) < 0.6) return { kind, origin: null, model };
      if (typeof out.lat !== "number" || typeof out.lng !== "number") return { kind, origin: null, model };
      if (Math.abs(out.lat) > 90 || Math.abs(out.lng) > 180) return { kind, origin: null, model };
      const country = isoCountry(typeof out.country === "string" ? out.country.toUpperCase() : undefined);
      return {
        kind,
        model,
        origin: {
          ...(out.city && { city: String(out.city).slice(0, 80) }),
          ...(country && { country }),
          lat: out.lat,
          lng: out.lng,
          provenance: "inferred",
          provenanceRef: model,
          determinedAt: new Date().toISOString(),
        },
      };
    } catch {
      continue;
    }
  }
  return null;
}

// ------------------------------------------------------------------ run

function exclusionFor(kind: ActorKind): SponsorExclusion | undefined {
  if (PLACING_KINDS.has(kind)) return undefined;
  return kind as SponsorExclusion;
}

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
    collectivesGated: 0,
    productsResolved: 0,
    looked_up: 0,
    placedByWikidata: 0,
    wikidataRejected: 0,
    placedByModel: 0,
    modelRefused: 0,
    unplaced: 0,
    civilizationsUpdated: 0,
    filesPlaced: 0,
    filesUnplaced: { "no-actors": 0, "no-organisation": 0, "not-located": 0 },
    errors: [],
  };

  // 1. Registry as it stands + curated seed (rewritten every run — the
  // seed file is the source of truth for curated entries).
  const regSnap = await db.collection("actorRegistry").get();
  const registry = new Map<string, ActorRegistryEntry>();
  for (const d of regSnap.docs) registry.set(d.id, d.data() as ActorRegistryEntry);
  {
    let batch = db.batch();
    let n = 0;
    for (const s of ACTOR_SEED) {
      const entry = seedEntry(s, now);
      const existing = registry.get(entry.id);
      const merged: ActorRegistryEntry = {
        ...entry,
        eventCount: existing?.eventCount ?? 0,
        civilizationCount: existing?.civilizationCount ?? 0,
        ...(existing?.placedCount !== undefined && { placedCount: existing.placedCount }),
      };
      batch.set(db.collection("actorRegistry").doc(entry.id), merged);
      registry.set(entry.id, merged);
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    // A non-curated document sitting under a curated alias is a stray —
    // a lookup that ran before the alias existed. Remove it.
    for (const s of ACTOR_SEED) {
      for (const alias of (s.aliases ?? []).map(actorSlug)) {
        const stray = registry.get(alias);
        if (stray && stray.origin.provenance !== "curated" && stray.id !== actorSlug(s.name)) {
          batch.delete(db.collection("actorRegistry").doc(alias));
          registry.delete(alias);
          if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
        }
      }
    }
    if (n % 400 !== 0) await batch.commit();
    result.seeded = n;
  }
  let aliasIndex = buildAliasIndex([...registry.values()]);

  // 2. Tally.
  const { byActor, byCiv } = await tallyActors(db);
  result.actorsTallied = byActor.size;

  // 3a. Collective names are recorded and never looked up.
  {
    let batch = db.batch();
    let n = 0;
    for (const [slug, t] of byActor) {
      if (aliasIndex.has(slug)) continue;
      if (!isCollectiveName(t.name)) continue;
      const entry: ActorRegistryEntry = {
        id: slug,
        name: t.name,
        aliases: [],
        kind: "collective",
        origin: { provenance: "unplaced", provenanceRef: "rule:collective", determinedAt: now },
        eventCount: t.mentions,
        civilizationCount: t.civs.size,
        updatedAt: now,
      };
      batch.set(db.collection("actorRegistry").doc(slug), entry);
      registry.set(slug, entry);
      aliasIndex.set(slug, slug);
      result.collectivesGated++;
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (n % 400 !== 0) await batch.commit();
  }

  // 3b. Product-style names resolve to their maker and are recorded.
  {
    let batch = db.batch();
    let n = 0;
    for (const [slug, t] of byActor) {
      if (aliasIndex.has(slug)) continue;
      const r = resolveActor(t.name, aliasIndex);
      if (!r || r.via === "exact") continue;
      const maker = registry.get(r.id);
      if (!maker) continue;
      const entry: ActorRegistryEntry = {
        id: slug,
        name: t.name,
        aliases: [],
        kind: "product",
        productOf: maker.id,
        origin: { provenance: "unplaced", provenanceRef: `rule:product-of:${maker.id}`, determinedAt: now },
        eventCount: t.mentions,
        civilizationCount: t.civs.size,
        updatedAt: now,
      };
      batch.set(db.collection("actorRegistry").doc(slug), entry);
      registry.set(slug, entry);
      aliasIndex.set(slug, maker.id);
      result.productsResolved++;
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (n % 400 !== 0) await batch.commit();
  }

  // 3c. Look up the unregistered, most-mentioned first.
  const candidates = [...byActor.entries()]
    .filter(([slug, t]) => {
      if (t.mentions < MIN_MENTIONS_FOR_LOOKUP) return false;
      const canonical = aliasIndex.get(slug);
      if (!canonical) return true;
      const e = registry.get(canonical);
      if (!e) return true;
      if (e.origin.provenance !== "unplaced") return false;
      if (e.origin.provenanceRef?.startsWith("rule:") || e.origin.provenanceRef?.includes("do-not-place")) return false;
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
      if (w.ok) {
        if (PLACING_KINDS.has(w.kind)) {
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
          // A real Wikidata entity, but not a kind that places a file:
          // record the kind, cite the QID, do not place.
          entry = {
            id: slug,
            name: t.name,
            aliases: [],
            kind: w.kind,
            origin: {
              provenance: "unplaced",
              provenanceRef: `${w.origin.provenanceRef} · rule:kind:${w.kind}`,
              determinedAt: now,
            },
            eventCount: t.mentions,
            civilizationCount: t.civs.size,
            updatedAt: now,
          };
          result.modelRefused++;
        }
      } else {
        result.wikidataRejected += w.rejected;
        const m = await modelLookup(t.name, t.sampleTitles, opts.apiKey, models);
        if (m && m.origin) {
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
        } else if (m) {
          entry = {
            id: slug,
            name: t.name,
            aliases: [],
            kind: m.kind,
            origin: {
              provenance: "unplaced",
              provenanceRef: `${m.model} · rule:kind:${m.kind}`,
              determinedAt: now,
            },
            eventCount: t.mentions,
            civilizationCount: t.civs.size,
            updatedAt: now,
          };
          result.modelRefused++;
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
    aliasIndex.set(slug, entry.productOf ?? slug);
    await new Promise((r) => setTimeout(r, 250)); // be polite to Wikidata
  }
  aliasIndex = buildAliasIndex([...registry.values()]);

  // 4. Civilization origins: the first located organisation in the file's
  // ranked actor list places it; who did, at what rank, is recorded.
  const civSnap = await db.collection("civilizations").get();
  const civIds = new Set(civSnap.docs.map((d) => d.id));
  const placedCount = new Map<string, number>();
  let batch = db.batch();
  let pending = 0;
  for (const [civId, counts] of byCiv) {
    if (!civIds.has(civId)) continue;
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const sponsors: Sponsor[] = [];
    const unlocated: NonNullable<CivilizationOrigin["unlocated"]> = [];
    let placedBy: CivilizationOrigin["placedBy"] | undefined;
    let dominantOrigin: Origin | null = null;
    let anyOrganisation = false;
    let rank = 0;
    for (const [slug, mentions] of ranked) {
      const r = resolveActor(byActor.get(slug)?.name ?? slug, aliasIndex);
      const e = r ? registry.get(r.id) : undefined;
      const name = e?.name ?? byActor.get(slug)?.name ?? slug;
      if (e?.kind === "publication") continue; // sources of record, never parties
      rank++; // rank among parties, not among raw names
      const excluded = e
        ? exclusionFor(e.kind)
        : isCollectiveName(name) ? ("collective" as const)
        : looksLikePerson(name) ? ("individual" as const)
        : undefined;
      if (!excluded) anyOrganisation = true;
      const sponsor: Sponsor = {
        actorId: e?.id ?? slug,
        actorName: name,
        mentions,
        ...(e && { origin: e.origin }),
        ...(excluded && { excluded }),
      };
      if (sponsors.length < TOP_SPONSORS) sponsors.push(sponsor);
      if (!excluded && (!e || e.origin.provenance === "unplaced")) {
        // one entry per registry id — two spellings of one name are one party
        const uid = e?.id ?? slug;
        const prev = unlocated.find((u) => u.actorId === uid);
        if (prev) prev.mentions += mentions;
        else unlocated.push({ actorId: uid, actorName: name, mentions });
      }
      if (!dominantOrigin && !excluded && e && e.origin.provenance !== "unplaced") {
        dominantOrigin = e.origin;
        placedBy = { actorId: e.id, actorName: e.name, rank, mentions };
        placedCount.set(e.id, (placedCount.get(e.id) ?? 0) + 1);
        if (!sponsors.includes(sponsor)) sponsors.push(sponsor); // the placing party is always recorded
      }
    }
    let reason: UnplacedReason | undefined;
    if (!dominantOrigin) {
      reason = counts.size === 0 ? "no-actors" : anyOrganisation ? "not-located" : "no-organisation";
      result.filesUnplaced[reason]++;
    } else {
      result.filesPlaced++;
    }
    const co: CivilizationOrigin = {
      origin: dominantOrigin ?? { provenance: "unplaced", determinedAt: now },
      sponsors,
      ...(placedBy && { placedBy }),
      ...(reason && { reason }),
      ...(reason === "not-located" && unlocated.length > 0 && { unlocated: unlocated.slice(0, 8) }),
      updatedAt: now,
    };
    batch.update(db.collection("civilizations").doc(civId), { origin: co });
    result.civilizationsUpdated++;
    if (++pending % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  // Files with a civilization document but no events tallied at all.
  for (const civId of civIds) {
    if (byCiv.has(civId)) continue;
    const co: CivilizationOrigin = {
      origin: { provenance: "unplaced", determinedAt: now },
      sponsors: [],
      reason: "no-actors",
      updatedAt: now,
    };
    batch.update(db.collection("civilizations").doc(civId), { origin: co });
    result.filesUnplaced["no-actors"]++;
    result.civilizationsUpdated++;
    if (++pending % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (pending % 400 !== 0) await batch.commit();

  // 5. Refresh counts on registered actors (cheap; keeps the tables honest).
  {
    let b = db.batch();
    let n = 0;
    const touched = new Set<string>();
    for (const [slug, t] of byActor) {
      const canonical = aliasIndex.get(slug);
      const id = canonical ?? slug;
      if (!registry.has(id) || touched.has(id)) continue;
      touched.add(id);
      b.update(db.collection("actorRegistry").doc(id), {
        eventCount: t.mentions,
        civilizationCount: t.civs.size,
        placedCount: placedCount.get(id) ?? 0,
      });
      if (++n % 400 === 0) { await b.commit(); b = db.batch(); }
    }
    if (n % 400 !== 0) await b.commit().catch(() => undefined);
  }

  return result;
}

// Exposed for tests.
export const _internal = { kindFromDescription, ORG_WORDS, isCollectiveName, looksLikePerson, resolveActor, nameMatches, exclusionFor };
