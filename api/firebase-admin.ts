import admin from 'firebase-admin';

let dbInstance: admin.firestore.Firestore | null = null;

export function getDb(): admin.firestore.Firestore {
  if (!dbInstance) {
    const base64Key = process.env.FIREBASE_ADMIN_KEY_BASE64;
    
    if (!base64Key) {
      console.error('❌ CRITICAL: FIREBASE_ADMIN_KEY_BASE64 environment variable is missing.');
      // We throw a clear error that API handlers can catch and return to the UI
      throw new Error('Database connection is not configured. (Missing FIREBASE_ADMIN_KEY_BASE64)');
    }

    if (!admin.apps.length) {
      try {
        const serviceAccount = JSON.parse(
          Buffer.from(base64Key, 'base64').toString('utf-8')
        );

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });

        console.log('✅ [Admin] Firebase SDK initialized successfully');
      } catch (error: any) {
        console.error('❌ [Admin] Firebase SDK initialization failed:', error.message);
        throw new Error(`Database initialization failed: ${error.message}`);
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
