import '../src/env';
import admin from 'firebase-admin';

let db: admin.firestore.Firestore;

if (!admin.apps.length) {
  const key = process.env.FIREBASE_ADMIN_KEY_BASE64;

  if (!key) {
    throw new Error("Missing FIREBASE_ADMIN_KEY_BASE64");
  }

  try {
    const serviceAccount = JSON.parse(
      Buffer.from(key, 'base64').toString('utf-8')
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log("🔥 Firebase Admin initialized successfully");
  } catch (error) {
    console.error("❌ Firebase Admin initialization failed:", error);
    throw error;
  }
}

db = admin.firestore();

export { db };
export default admin;
