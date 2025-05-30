// src/firebase.js

/**
 * NetSpark Sales Dashboard - Firebase Initialization
 * 
 * Loads configuration from environment variables, exports
 * Firestore (db) and Auth (auth) singletons. Defensive
 * against double-initialization and missing environment variables.
 */

import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

/**
 * Get Firebase config from environment.
 * Throws in dev if anything is missing.
 * Logs a warning in prod and uses undefined values,
 * so SSR and build never hard-fail.
 */
function getFirebaseConfig() {
  const keys = [
    "REACT_APP_FIREBASE_API_KEY",
    "REACT_APP_FIREBASE_AUTH_DOMAIN",
    "REACT_APP_FIREBASE_PROJECT_ID",
    "REACT_APP_FIREBASE_STORAGE_BUCKET",
    "REACT_APP_FIREBASE_MESSAGING_SENDER_ID",
    "REACT_APP_FIREBASE_APP_ID",
  ];
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) {
    const msg = `[firebase.js] ERROR: Missing required Firebase env vars: ${missing.join(", ")}`;
    if (process.env.NODE_ENV === "development") {
      throw new Error(msg);
    } else {
      // Don't break prod build/SSR
      // eslint-disable-next-line no-console
      console.warn(msg);
    }
  }
  return {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
  };
}

const firebaseConfig = getFirebaseConfig();

// Only initialize if we haven't yet (prevents HMR/dev server bugs)
const app = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApps()[0];

// Export Firestore (db) and Auth (auth) singletons
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
