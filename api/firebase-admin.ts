import admin from 'firebase-admin';

let dbInstance: admin.firestore.Firestore | null = null;

export function getDb(): admin.firestore.Firestore {
  if (!dbInstance) {
    if (!admin.apps.length) {
      const base64Key = process.env.FIREBASE_ADMIN_KEY_BASE64;
      
      if (!base64Key) {
        throw new Error('FIREBASE_ADMIN_KEY_BASE64 environment variable is required for database operations. Please add it to your project settings.');
      }

      try {
        const serviceAccount = JSON.parse(
          Buffer.from(base64Key, 'base64').toString('utf-8')
        );

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });

        console.log('✅ Firebase Admin initialized');
      } catch (error: any) {
        console.error('❌ Firebase Admin initialization error:', error);
        throw new Error(`Failed to initialize Firebase Admin: ${error.message}`);
      }
    }
    dbInstance = admin.firestore();
  }
  return dbInstance;
}

// For backward compatibility while migrating callers
export const db = new Proxy({} as admin.firestore.Firestore, {
  get: (target, prop) => {
    return (getDb() as any)[prop];
  }
});

export default admin;
