import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';

// Replace with your Firebase project config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

/**
 * Run the app against the local emulators instead of the live project:
 *
 *   firebase emulators:start --only database,firestore,auth   # keeps the project id
 *   VITE_USE_EMULATORS=true npm run dev
 *
 * Worth doing for anything that touches `database.rules.json`, because a rules
 * change cannot be tried against production without deploying it first — and
 * for multiplayer generally, since a test table is then a throwaway rather than
 * a real room in the live database.
 *
 * Start the emulators with the project's own id (the default from `.firebaserc`,
 * not a demo one). The Realtime Database emulator serves *any* namespace and one
 * it has no rules for is wide open, so a mismatched id would quietly test
 * nothing — the same trap `scripts/test-rules.mjs` documents.
 *
 * `DEV` gates it so a production build cannot be talked into this by an env var.
 */
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
  console.info('[parlour] using the local Firebase emulators');
}

export default app;
