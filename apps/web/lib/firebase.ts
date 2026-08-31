"use client";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

// Public web config. Firebase project config values are NOT secrets — they
// only identify the project; write access is gated by firestore.rules.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "agent-civilizations.firebaseapp.com",
  projectId: "agent-civilizations",
  storageBucket: "agent-civilizations.appspot.com",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let db: Firestore;

export function getDb(): Firestore {
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
  return db;
}
