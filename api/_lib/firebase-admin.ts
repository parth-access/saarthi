import '../../src/env.ts';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const adminKeyBase64 = process.env.FIREBASE_ADMIN_KEY_BASE64;

    if (!adminKeyBase64) {
      throw new Error("Missing FIREBASE_ADMIN_KEY_BASE64Environment variable");
    }

    const serviceAccount = JSON.parse(
      Buffer.from(adminKeyBase64, 'base64').toString('utf-8')
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

export const db = admin.apps.length ? admin.firestore() : null;
export default admin;
