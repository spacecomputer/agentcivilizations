"use client";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";

// Public web config. Firebase project config values are NOT secrets — they
// only identify the project; write access is gated by firestore.rules.
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "agent-civilizations.firebaseapp.com",
  projectId: "agent-civilizations",
  storageBucket: "agent-civilizations.firebasestorage.app",
  messagingSenderId: "321745450878",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// One app instance for every SDK on the page — Firestore and Analytics
// must not each call initializeApp.
export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

let app: FirebaseApp | undefined;
let db: Firestore | undefined;

export function getDb(): Firestore {
  if (!db) {
    app = getFirebaseApp();
    db = getFirestore(app);
    // Local development against the emulator suite: when the site is served
    // from localhost and no production API key was baked in, read from the
    // Firestore emulator so `npm run emulate` + `npm run seed` just works.
    if (
      typeof window !== "undefined" &&
      window.location.hostname === "localhost" &&
      !process.env.NEXT_PUBLIC_FIREBASE_API_KEY
    ) {
      try {
        connectFirestoreEmulator(db, "localhost", 8080);
      } catch {
        // already connected — hot reload
      }
    }
  }
  return db;
}
