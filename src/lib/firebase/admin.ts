import 'server-only';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const base64 = process.env.FIREBASE_ADMIN_KEY_BASE64;

    if (!base64) {
      throw new Error('FIREBASE_ADMIN_KEY_BASE64 is missing');
    }

    const decoded = Buffer.from(base64, 'base64').toString('utf-8');

    const serviceAccount = JSON.parse(decoded);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('Firebase Admin initialized');
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
  }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();