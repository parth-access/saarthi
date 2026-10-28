import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Note: Ensure your .env file has these variables if you are not using firebase-applet-config.json
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const checkEnv = () => {
    return !!firebaseConfig.apiKey && !!firebaseConfig.authDomain && !!firebaseConfig.projectId;
}
  
const firebaseEnabled = checkEnv();
let app: ReturnType<typeof initializeApp> | null = null;
let authInstance: ReturnType<typeof getAuth> | null = null;

if (firebaseEnabled) {
  try {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
  }
}

/*
 * Firestore lives in `./firestore`, not here. This module is imported by the
 * auth provider on every page, and the Firestore SDK is the largest piece of
 * Firebase; pages that never read Firestore from the browser (the admin
 * console, the public site) should not download it.
 */
export const firebaseApp = app;
export const auth = authInstance as ReturnType<typeof getAuth>;
export const isFirebaseEnabled = firebaseEnabled && !!app && !!authInstance;
