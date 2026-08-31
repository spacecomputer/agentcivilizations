"use client";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getDb } from "./firebase";
import type { Event, Civilization } from "@agent-civilizations/schema";

export async function recentEvents(n = 50, confidence?: "confirmed" | "candidate"): Promise<Event[]> {
  const db = getDb();
  const constraints = [
    orderBy("occurredAt", "desc"),
    limit(n),
  ];
  const q = confidence
    ? query(collection(db, "events"), where("confidence", "==", confidence), ...constraints)
    : query(collection(db, "events"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Event);
}

export async function activeCivilizations(n = 100): Promise<Civilization[]> {
  const db = getDb();
  const q = query(
    collection(db, "civilizations"),
    where("status", "==", "active"),
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
