/**
 * Environment for the end-to-end stack. Every value here is a made-up TEST
 * value, safe to commit: the Firebase project is a `demo-` project (emulator
 * only, no real backend) and the Razorpay keys only work against the local
 * fake Razorpay server. No real or live key is ever needed.
 */
export const E2E_PORT = Number(process.env.E2E_PORT || 3005);
export const APP_URL = `http://localhost:${E2E_PORT}`;
export const FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
export const FAKE_RAZORPAY_PORT = 4010;
export const FAKE_RAZORPAY_URL = `http://127.0.0.1:${FAKE_RAZORPAY_PORT}`;
export const PROJECT_ID = 'demo-saarthi-e2e';

export const RAZORPAY_KEY_ID = 'rzp_test_e2efake00000000';
export const RAZORPAY_KEY_SECRET = 'e2e-fake-key-secret-not-real';
export const RAZORPAY_WEBHOOK_SECRET = 'e2e-fake-webhook-secret-not-real';

/** Env passed to `next dev`. Process env wins over .env.local in Next.js. */
export const appServerEnv: Record<string, string> = {
  APP_URL,
  NEXT_PUBLIC_APP_URL: APP_URL,
  NEXT_PUBLIC_FIREBASE_API_KEY: 'e2e-fake-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: 'e2e-fake-app-id',
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_HOST,
  FIREBASE_EMULATOR_PROJECT_ID: PROJECT_ID,
  FIREBASE_ADMIN_KEY_BASE64: '',
  JWT_SECRET: 'e2e-fake-jwt-secret-that-is-long-enough-0123456789',
  RAZORPAY_KEY_ID,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET,
  RAZORPAY_API_HOST: FAKE_RAZORPAY_URL,
  // Keep every outside service switched off.
  RESEND_API_KEY: '',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  GOOGLE_REFRESH_TOKEN: '',
  NEXT_PUBLIC_SENTRY_DSN: '',
  SENTRY_DSN: '',
  NEXT_PUBLIC_GA_MEASUREMENT_ID: '',
  DATABASE_URL: '',
  NEXT_TELEMETRY_DISABLED: '1',
};
