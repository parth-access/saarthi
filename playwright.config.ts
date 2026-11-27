import { defineConfig, devices } from '@playwright/test';
import {
  APP_URL,
  E2E_PORT,
  FAKE_RAZORPAY_PORT,
  FAKE_RAZORPAY_URL,
  PROJECT_ID,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  appServerEnv,
} from './e2e/env';

// Prefer a globally installed Firebase CLI; fall back to a pinned npx copy (CI).
const firebase = 'sh -c \'if command -v firebase >/dev/null; then exec firebase "$@"; else exec npx --yes firebase-tools@15.15.0 "$@"; fi\' firebase';

export default defineConfig({
  testDir: './e2e',
  // One emulator and one fake gateway are shared, and each spec resets them.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The booking UI animates between steps; reduced motion keeps it snappy.
    reducedMotion: 'reduce',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `${firebase} emulators:start --only firestore --project ${PROJECT_ID} --config firebase.e2e.json`,
      url: 'http://127.0.0.1:8085/',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
    },
    {
      command: 'node e2e/fake-razorpay/server.mjs',
      url: `${FAKE_RAZORPAY_URL}/__test/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        FAKE_RAZORPAY_PORT: String(FAKE_RAZORPAY_PORT),
        RAZORPAY_KEY_ID,
        RAZORPAY_KEY_SECRET,
      },
    },
    {
      command: `npx next dev -p ${E2E_PORT}`,
      url: `${APP_URL}/book`,
      timeout: 240_000,
      // Never reuse: a server started without the e2e env would talk to real
      // services. Stop any other server on this port before running.
      reuseExistingServer: false,
      env: appServerEnv,
    },
  ],
});
