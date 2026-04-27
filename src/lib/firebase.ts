import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const REQUIRED_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
];

const checkEnv = () => {
  const missing = REQUIRED_VARS.filter(key => {
    const val = import.meta.env[key];
    return !val || val === '' || val.includes('YOUR_'); // Check for placeholders or empty values too
  });
  if (missing.length > 0) {
    console.warn(`⚠️ Firebase environment variables missing or incomplete: ${missing.join(', ')}. Firebase Auth/Firestore will be disabled.`);
    return false;
  }
  return true;
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseEnabled = checkEnv();
let app = null;
let authInstance = null;
let dbInstance = null;
let googleProvider = null;

if (firebaseEnabled) {
  try {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    // Explicitly initializing Google Provider here 
    googleProvider = new GoogleAuthProvider();
    dbInstance = getFirestore(app);
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
  }
}

export const auth = authInstance;
export const db = dbInstance;
export const isFirebaseEnabled = firebaseEnabled && !!app && !!authInstance;
export { googleProvider };
