import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { firebaseApp } from './client';

/**
 * The browser Firestore client. Import it statically only where a page reads
 * or writes Firestore from the browser; the auth flow, which runs on every
 * page, imports this module dynamically so the SDK stays out of the initial
 * bundle.
 */
export const db = (firebaseApp ? getFirestore(firebaseApp) : null) as ReturnType<typeof getFirestore>;

// End-to-end tests point the browser at the local Firestore emulator. Only a
// `demo-` project (Firebase's emulator-only namespace) may do so.
const emulatorHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;
if (db && emulatorHost && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.startsWith('demo-')) {
  const [host, port] = emulatorHost.split(':');
  try {
    connectFirestoreEmulator(db, host, Number(port));
  } catch {
    // Already connected (hot reload re-runs this module).
  }
}

/** Re-exported so a dynamic `import()` of this module brings what auth needs. */
export { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
