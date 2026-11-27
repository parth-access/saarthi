import { defineConfig } from 'vitest/config';

// Firestore security-rules suite. Needs the Firestore emulator, so it is kept
// out of `npm test` and run by `npm run test:rules`, which wraps it in
// `firebase emulators:exec`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    // One emulator, one shared database: files must not clear each other's data.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
