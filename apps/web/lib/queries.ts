"use client";
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
import { getDb } from "./firebase";
import type { Event, Civilization, Root } from "@agent-civilizations/schema";

export async function recentEvents(
  n = 60,
  opts: { before?: string } = {},
): Promise<Event[]> {
  const db = getDb();
  const parts = [];
  if (opts.before) parts.push(where("recordedAt", "<", opts.before));
  const q = query(
    collection(db, "events"),
    ...parts,
    orderBy("recordedAt", "desc"),
    limit(n),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Event);
}

export async function eventByCivSeq(
  civilizationId: string,
  seq: number,
): Promise<Event | null> {
  const db = getDb();
  const q = query(
    collection(db, "events"),
    where("civilizationId", "==", civilizationId),
    where("seq", "==", seq),
    limit(1),
  );
  const snap = await getDocs(q);
  return snap.empty ? null : (snap.docs[0].data() as Event);
}

export async function eventCount(): Promise<number> {
  const db = getDb();
  const snap = await getCountFromServer(collection(db, "events"));
  return snap.data().count;
}

export async function latestRoot(): Promise<Root | null> {
  const db = getDb();
  // Ordered by computedAt, not documentId — the emulator does not support
  // descending key scans, and local dev must work.
  const q = query(
    collection(db, "roots"),
    orderBy("computedAt", "desc"),
    limit(1),
  );
  const snap = await getDocs(q);
  return snap.empty ? null : (snap.docs[0].data() as Root);
}

export async function rootForDay(day: string): Promise<Root | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "roots", day));
  return snap.exists() ? (snap.data() as Root) : null;
}

export async function rootsForDays(days: string[]): Promise<Map<string, Root>> {
  const out = new Map<string, Root>();
  await Promise.all(
    days.map(async (day) => {
      const root = await rootForDay(day);
      if (root) out.set(day, root);
    }),
  );
  return out;
}

export async function allRoots(): Promise<Root[]> {
  const db = getDb();
  const q = query(collection(db, "roots"), orderBy(documentId(), "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Root);
}

export async function activeCivilizations(n = 200): Promise<Civilization[]> {
  const db = getDb();
  const q = query(
    collection(db, "civilizations"),
    orderBy("lastEventAt", "desc"),
    limit(n),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Civilization);
}

export async function civilization(id: string): Promise<Civilization | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "civilizations", id));
  return snap.exists() ? (snap.data() as Civilization) : null;
}

export async function eventsForCivilization(id: string): Promise<Event[]> {
  const db = getDb();
  const q = query(
    collection(db, "events"),
    where("civilizationId", "==", id),
    orderBy("seq", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Event);
}

export async function event(id: string): Promise<Event | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "events", id));
  return snap.exists() ? (snap.data() as Event) : null;
}

export async function eventsRecordedBetween(
  startIso: string,
  endIso: string,
): Promise<Event[]> {
  const db = getDb();
  const q = query(
    collection(db, "events"),
    where("recordedAt", ">=", startIso),
    where("recordedAt", "<=", endIso),
    orderBy("recordedAt", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Event);
}

export async function allEvents(): Promise<Event[]> {
  const db = getDb();
  const q = query(collection(db, "events"), orderBy("recordedAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Event);
}
