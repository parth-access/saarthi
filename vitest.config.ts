import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // `tsconfig.json` sets `jsx: preserve`, which esbuild cannot honour; left
  // alone that means the classic runtime and a build-time error for every
  // component without `import * as React`. The automatic runtime is what
  // Next.js actually compiles to, so the test transform matches production.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/__mocks__/empty.ts', import.meta.url)),
    },
  },
});
