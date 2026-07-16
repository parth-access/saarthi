import 'server-only';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const base64 = process.env.FIREBASE_ADMIN_KEY_BASE64;

    if (!base64) {
      if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PHASE !== 'phase-production-server') {
        console.warn('Skipping Firebase Admin initialization during build');
      } else {
        throw new Error('FIREBASE_ADMIN_KEY_BASE64 is missing');
      }
    } else {
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(decoded);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('Firebase Admin initialized');
    }
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
  }
}

export const adminDb = admin.apps.length ? admin.firestore() : null as unknown as admin.firestore.Firestore;
export const adminAuth = admin.apps.length ? admin.auth() : null as unknown as admin.auth.Auth;