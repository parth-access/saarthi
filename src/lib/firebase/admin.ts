import 'server-only';
// Modular entry points only: firebase-admin 14 removed the legacy `admin.*`
// namespace (admin.apps, admin.firestore(), admin.credential, ...).
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  try {
    const base64 = process.env.FIREBASE_ADMIN_KEY_BASE64;
    const emulatorProjectId = process.env.FIREBASE_EMULATOR_PROJECT_ID;

    if (process.env.FIRESTORE_EMULATOR_HOST && emulatorProjectId) {
      // Local emulator only (end-to-end tests). A `demo-` project id is
      // Firebase's emulator-only namespace: it has no real backend, so this
      // branch can never read or write production data.
      if (!emulatorProjectId.startsWith('demo-')) {
        throw new Error('FIREBASE_EMULATOR_PROJECT_ID must start with "demo-"');
      }
      initializeApp({ projectId: emulatorProjectId });
      console.log('Firebase Admin initialized against the Firestore emulator');
    } else if (!base64) {
      if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PHASE !== 'phase-production-server') {
        console.warn('Skipping Firebase Admin initialization during build');
      } else {
        throw new Error('FIREBASE_ADMIN_KEY_BASE64 is missing');
      }
    } else {
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(decoded);
      const app = initializeApp({
        credential: cert(serviceAccount),
      });
      // Talk to Firestore over plain HTTPS instead of gRPC. On serverless every
      // cold start otherwise loads the gRPC stack and opens a channel before the
      // first query, which made the first slot lookup take ~12s. Must be set
      // once, before the first getFirestore() call, hence here.
      initializeFirestore(app, { preferRest: true });
      console.log('Firebase Admin initialized');
    }
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
  }
}

export const adminDb = getApps().length ? getFirestore() : null as unknown as Firestore;
export const adminAuth = getApps().length ? getAuth() : null as unknown as Auth;