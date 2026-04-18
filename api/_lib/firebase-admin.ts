import admin from 'firebase-admin';

let db: admin.firestore.Firestore;

const key = process.env.FIREBASE_ADMIN_KEY_BASE64;

// 🔍 Debug (safe logs)
console.log("🔑 Firebase Key Exists:", !!key);
console.log("🔑 Firebase Key Length:", key?.length);

if (!admin.apps.length) {
  if (!key) {
    console.error("❌ Missing FIREBASE_ADMIN_KEY_BASE64");
    throw new Error("Server configuration error");
  }

  let serviceAccount;

  try {
    const decoded = Buffer.from(key, 'base64').toString('utf-8');
    serviceAccount = JSON.parse(decoded);
  } catch (err) {
    console.error("💀 Failed to decode/parse Firebase key:", err);
    throw new Error("Invalid Firebase credentials");
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("🔥 Firebase Admin initialized");
  } catch (err) {
    console.error("💀 Firebase initialization error:", err);
    throw new Error("Firebase initialization failed");
  }
}

db = admin.firestore();

export { db };
export default admin;