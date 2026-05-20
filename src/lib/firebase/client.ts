import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
let app = null;
let authInstance: ReturnType<typeof getAuth> | null = null;
let dbInstance: ReturnType<typeof getFirestore> | null = null;

if (firebaseEnabled) {
  try {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    dbInstance = getFirestore(app);
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
  }
}

export const auth = authInstance as ReturnType<typeof getAuth>;
export const db = dbInstance as ReturnType<typeof getFirestore>;
export const isFirebaseEnabled = firebaseEnabled && !!app && !!authInstance;
