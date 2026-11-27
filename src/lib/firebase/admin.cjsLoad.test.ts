import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Next.js keeps firebase-admin external, so on Vercel it is loaded with a plain
 * CommonJS require() at runtime. Vercel's function runtime does not support
 * require() of an ES module, so a dependency that pulls in an ESM-only package
 * (firebase-admin 14 -> jwks-rsa 4 -> jose 6) crashes every route that touches
 * Firestore with ERR_REQUIRE_ESM, even though it loads fine under local Node.
 *
 * `--no-experimental-require-module` gives the same behaviour locally.
 */
describe('firebase-admin loads under CommonJS without require(esm)', () => {
  it.each(['firebase-admin/app', 'firebase-admin/auth', 'firebase-admin/firestore'])(
    '%s',
    (entry) => {
      expect(() =>
        execFileSync(
          process.execPath,
          ['--no-experimental-require-module', '-e', `require(${JSON.stringify(entry)})`],
          { stdio: 'pipe', timeout: 30_000 },
        ),
      ).not.toThrow();
    },
    30_000,
  );
});
