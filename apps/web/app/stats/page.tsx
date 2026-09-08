"use client";
// The state of the record — a small readout, not a dashboard. Every number
// is derived client-side from the public Firestore, so a reader can
// recompute what they see the same way the /verify console recomputes the
// hash chain.
import { useEffect, useState } from "react";
import {
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { utcStamp, recordNo } from "@/lib/format";
import { CategoryLabel } from "@/components/Glyph";
import type { Category, Civilization, Event, Root } from "@agent-civilizations/schema";

const CATS: Category[] = ["coordination", "security", "community", "speculative"];

interface Stats {
  events: number;
  civs: number;
  civsActive: number;
  civsExtinct: number;
  roots: number;
  latestRoot: Root | null;
  perCategory: Record<Category, number>;
  confirmed: number;
  candidates: number;
  earliestRecordedAt: string | null;
  lastScanAt: string | null;
  scans24h: number;
  itemsFetched24h: number;
  itemsPromoted24h: number;
  llmCalls24h: number;
  tokensUsed24h: number;
  topSources24h: Array<{ domain: string; count: number }>;
}

async function loadStats(): Promise<Stats> {
  const db = getDb();
  const [evCount, civCount, rootCount] = await Promise.all([
    getCountFromServer(collection(db, "events")).then((s) => s.data().count),
    getCountFromServer(collection(db, "civilizations")).then(
      (s) => s.data().count,
    ),
    getCountFromServer(collection(db, "roots")).then((s) => s.data().count),
  ]);

  const [rootSnap, oldestSnap, civSnap] = await Promise.all([
    getDocs(
      query(collection(db, "roots"), orderBy("computedAt", "desc"), limit(1)),
    ),
    getDocs(
      query(collection(db, "events"), orderBy("recordedAt", "asc"), limit(1)),
    ),
    getDocs(collection(db, "civilizations")),
  ]);
  const latestRoot = rootSnap.empty ? null : (rootSnap.docs[0].data() as Root);
  const earliest = oldestSnap.empty
    ? null
    : (oldestSnap.docs[0].data() as Event).recordedAt;
  const civs = civSnap.docs.map((d) => d.data() as Civilization);

  // Per-category and confidence counts via aggregation queries.
  const perCategory: Record<Category, number> = {
    coordination: 0,
    security: 0,
    community: 0,
    speculative: 0,
  };
  await Promise.all(
    CATS.map(async (c) => {
      const s = await getCountFromServer(
        query(collection(db, "events"), where("category", "==", c)),
      );
      perCategory[c] = s.data().count;
    }),
  );
  const confirmed = (
    await getCountFromServer(
      query(collection(db, "events"), where("confidence", "==", "confirmed")),
    )
  ).data().count;
  const candidates = evCount - confirmed;

  // Scan activity over the last 24h.
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const scansSnap = await getDocs(
    query(
      collection(db, "scanRuns"),
      where("startedAt", ">=", dayAgo),
      orderBy("startedAt", "desc"),
    ),
  );
  const scans = scansSnap.docs.map((d) => d.data() as any);
  const scans24h = scans.length;
  const itemsFetched24h = scans.reduce(
    (s, r) => s + (r.itemsFetched ?? 0),
    0,
  );
  const itemsPromoted24h = scans.reduce(
    (s, r) => s + (r.itemsPromoted ?? 0),
    0,
  );
  const llmCalls24h = scans.reduce((s, r) => s + (r.llmCalls ?? 0), 0);
  const tokensUsed24h = scans.reduce((s, r) => s + (r.tokensUsed ?? 0), 0);
  const lastScanAt = scans[0]?.startedAt ?? null;

  // Top source domains among events recorded in the last 24h.
  const recentSnap = await getDocs(
    query(
      collection(db, "events"),
      where("recordedAt", ">=", dayAgo),
      orderBy("recordedAt", "desc"),
      limit(200),
    ),
  );
  const bySource = new Map<string, number>();
  for (const d of recentSnap.docs) {
    const e = d.data() as Event;
    for (const s of e.sources) {
      bySource.set(s.domain, (bySource.get(s.domain) ?? 0) + 1);
    }
  }
  const topSources24h = [...bySource.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([domain, count]) => ({ domain, count }));

  return {
    events: evCount,
    civs: civCount,
    civsActive: civs.filter((c) => c.status === "active").length,
    civsExtinct: civs.filter((c) => c.status === "extinct").length,
    roots: rootCount,
    latestRoot,
    perCategory,
    confirmed,
    candidates,
    earliestRecordedAt: earliest,
    lastScanAt,
    scans24h,
    itemsFetched24h,
    itemsPromoted24h,
    llmCalls24h,
    tokensUsed24h,
    topSources24h,
  };
}

function BigNumber({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="stat-value mono">{value}</div>
      <div className="stat-label caps">{label}</div>
    </div>
  );
}

const LANG_NAMES: Record<string, string> = { en: "English", zh: "Chinese", ru: "Russian" };

export default function StatsPage() {
  const [langs, setLangs] = useState<{ bySourceLanguage: Record<string, number>; singleLanguageNonEnglish: number } | null>(null);
  const [health, setHealth] = useState<{
    status: string;
    note: string;
    minutesSinceScanFinished: number | null;
    minutesSinceEntry: number | null;
    lastClassifierModel: string | null;
    thresholds: { scanEveryMinutes: number; scansStalledAfterMinutes: number; classifierDownAfterMinutes: number };
  } | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/health.json")
      .then((r) => r.json())
      .then((h) => !off && setHealth(h))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);
  useEffect(() => {
    let off = false;
    fetch("/api/figures.json")
      .then((r) => r.json())
      .then((f) => !off && setLangs(f))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStats()
      .then((v) => !cancelled && setS(v))
      .catch((e) => !cancelled && setErr(e.message ?? String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) {
    return <p className="mono dim">The state of the record could not be retrieved. The chain is unaffected.</p>;
  }
  if (!s) return <p className="mono dim">retrieving the record…</p>;

  const totalCats = Object.values(s.perCategory).reduce((a, b) => a + b, 0) || 1;

  return (
    <>
      <span className="caps kicker">State of the record</span>
      <h1>Stats</h1>
      <p className="preamble">
        Every figure below is derived client-side from the public database.
        Recompute them the same way you recompute the chain: read Firestore
        directly, count.
      </p>
      <div className="rule-double" />

      <div className="stat-grid">
        <BigNumber label="records" value={s.events.toLocaleString("en-US")} />
        <BigNumber label="files" value={s.civs.toLocaleString("en-US")} />
        <BigNumber label="active" value={s.civsActive.toLocaleString("en-US")} />
        <BigNumber label="extinct" value={s.civsExtinct.toLocaleString("en-US")} />
        <BigNumber label="sealed roots" value={s.roots.toLocaleString("en-US")} />
        <BigNumber label="confirmed" value={s.confirmed.toLocaleString("en-US")} />
      </div>

      <h3>Is the register still recording?</h3>
      {health === null ? (
        <p className="mono dim">retrieving…</p>
      ) : (
        <div className={`panel${health.status === "running" || health.status === "opening" ? "" : " superseded"}`}>
          <span className="caps panel-label">
            {health.status === "running" ? "Recording" : health.status.replace("-", " ")}
          </span>
          <p>{health.note}</p>
          <div className="prov-line">
            <span className="k">last scan finished</span>
            <span className="mono">
              {health.minutesSinceScanFinished === null
                ? "never"
                : `${health.minutesSinceScanFinished} minutes ago`}
            </span>
          </div>
          <div className="prov-line">
            <span className="k">last model to answer</span>
            <span className="mono">{health.lastClassifierModel ?? "none on record"}</span>
          </div>
          <div className="prov-line">
            <span className="k">last entry recorded</span>
            <span className="mono">
              {health.minutesSinceEntry === null ? "never" : `${health.minutesSinceEntry} minutes ago`}
            </span>
          </div>
          <p className="dim">
            Scans run every {health.thresholds.scanEveryMinutes} minutes. The register
            calls itself stalled after {health.thresholds.scansStalledAfterMinutes} minutes
            without a finished scan, and calls the classifier down after{" "}
            {health.thresholds.classifierDownAfterMinutes} minutes in which scans put items
            to the models and no model answered. A window with no new entries is not a
            fault: a quiet hour and a broken pipeline look identical from outside, and only
            the answering model tells them apart. Machine-readable at{" "}
            <a href="/api/health.json">/api/health.json</a>, which returns 503 when the
            register is not recording.
          </p>
        </div>
      )}

      <h3>Coverage by source language</h3>
      <p className="dim">
        Entries by the declared language of the sources they cite, counted
        once per language, so an event carried in two languages appears in
        both. That pairing is the strongest corroboration available here,
        because the English, Chinese and Russian press rarely share a wire.
        Non-English sources were added on 2026-09-08; everything before that
        was found through English coverage alone.
      </p>
      {langs === null ? (
        <p className="mono dim">retrieving…</p>
      ) : (
        <div className="tablewrap">
          <table>
            <caption className="sr-only">Entries by source language</caption>
            <thead>
              <tr><th>Language</th><th className="num">Entries citing it</th></tr>
            </thead>
            <tbody>
              {Object.entries(langs.bySourceLanguage)
                .sort((a, b) => b[1] - a[1])
                .map(([code, n]) => (
                  <tr key={code}>
                    <td className="mono">{LANG_NAMES[code] ?? code}</td>
                    <td className="num mono">{n}</td>
                  </tr>
                ))}
              <tr>
                <td className="mono dim">entries with no English source at all</td>
                <td className="num mono">{langs.singleLanguageNonEnglish}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <h3>Distribution by category</h3>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Records</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {CATS.map((c) => (
              <tr key={c}>
                <td><CategoryLabel category={c} /></td>
                <td className="num mono">{s.perCategory[c].toLocaleString("en-US")}</td>
                <td className="num mono">
                  {((s.perCategory[c] / totalCats) * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Scan activity — last 24 hours</h3>
      <div className="tablewrap">
        <table>
          <tbody>
            <tr><th scope="row">Scans</th><td className="mono">{s.scans24h}</td></tr>
            <tr><th scope="row">Items fetched</th><td className="mono">{s.itemsFetched24h.toLocaleString("en-US")}</td></tr>
            <tr><th scope="row">Records entered</th><td className="mono">{s.itemsPromoted24h.toLocaleString("en-US")}</td></tr>
            <tr><th scope="row">LLM calls</th><td className="mono">{s.llmCalls24h.toLocaleString("en-US")}</td></tr>
            <tr><th scope="row">Tokens used</th><td className="mono">{s.tokensUsed24h.toLocaleString("en-US")}</td></tr>
            <tr>
              <th scope="row">Last scan</th>
              <td className="mono">{s.lastScanAt ? utcStamp(s.lastScanAt) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {s.topSources24h.length > 0 && (
        <>
          <h3>Sources drawn on — last 24 hours</h3>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Domain</th><th className="num">Records</th></tr></thead>
              <tbody>
                {s.topSources24h.map((r) => (
                  <tr key={r.domain}>
                    <td className="mono">{r.domain}</td>
                    <td className="num mono">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {s.latestRoot && (
        <>
          <h3>Latest sealed root</h3>
          <div className="panel">
            <div className="prov-line">
              <span className="k">day</span> {s.latestRoot.id}
            </div>
            <div className="prov-line">
              <span className="k">merkleRoot</span>{" "}
              <span className="mono">{s.latestRoot.merkleRoot}</span>
            </div>
            <div className="prov-line">
              <span className="k">events</span> {s.latestRoot.eventCount} ·{" "}
              <span className="k">civilizations</span>{" "}
              {s.latestRoot.civilizationCount}
            </div>
            {s.latestRoot.otsProof && (
              <>
                <div className="prov-line">
                  <span className="k">ots proof</span>{" "}
                  <a
                    href={`/api/roots/${s.latestRoot.id}/ots`}
                    className="mono"
                  >
                    download {s.latestRoot.id}.ots
                  </a>
                </div>
                <div className="prov-line">
                  <span className="k">bitcoin</span>{" "}
                  {s.latestRoot.otsBitcoinBlockHeight
                    ? `block ${s.latestRoot.otsBitcoinBlockHeight}`
                    : "waiting for confirmation"}
                </div>
              </>
            )}
          </div>
        </>
      )}

      <p className="dim" style={{ marginTop: "32px", maxWidth: "68ch" }}>
        Since {s.earliestRecordedAt?.slice(0, 10) ?? "—"}. The register has
        entered {recordNo(s.events)}.
      </p>
    </>
  );
}
