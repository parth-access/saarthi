import { getFirestore } from 'firebase/firestore';
import { firebaseApp } from './client';

/**
 * The browser Firestore client. Import it statically only where a page reads
 * or writes Firestore from the browser; the auth flow, which runs on every
 * page, imports this module dynamically so the SDK stays out of the initial
 * bundle.
 */
export const db = (firebaseApp ? getFirestore(firebaseApp) : null) as ReturnType<typeof getFirestore>;

/** Re-exported so a dynamic `import()` of this module brings what auth needs. */
export { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
