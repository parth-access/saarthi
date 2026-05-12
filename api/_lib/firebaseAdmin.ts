import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const base64 = process.env.FIREBASE_ADMIN_KEY_BASE64;

if (!base64) {
  throw new Error('FIREBASE_ADMIN_KEY_BASE64 is missing');
}

const decoded = Buffer.from(base64, 'base64').toString('utf-8');
const serviceAccount = JSON.parse(decoded);

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });

  console.log('Firebase Admin initialized');
}

export const adminDb = getFirestore();
export const adminAuth = getAuth();