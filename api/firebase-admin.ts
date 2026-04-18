import admin from 'firebase-admin';

let db: admin.firestore.Firestore;

if (!admin.apps.length) {
  const base64Key = process.env.FIREBASE_ADMIN_KEY_BASE64;
  
  if (!base64Key) {
    throw new Error('Missing FIREBASE_ADMIN_KEY_BASE64 environment variable');
  }

  try {
    const serviceAccount = JSON.parse(
      Buffer.from(base64Key, 'base64').toString('utf-8')
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log('✅ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error);
    throw error;
  }
}

db = admin.firestore();

export { db };
export default admin;
