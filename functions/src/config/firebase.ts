import * as admin from 'firebase-admin';

// Initialize the Firebase Admin SDK
// When running in Firebase Functions, it automatically uses default credentials
if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();
export default admin;
