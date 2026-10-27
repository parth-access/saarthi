/**
 * Which identity system is live. Firebase stays the default until the
 * Better Auth migration cuts over (docs/plans/2026-10-26-better-auth-migration.md),
 * so this branch can merge without changing production.
 *
 * NEXT_PUBLIC_ so the browser and the server read the same switch. Next.js
 * inlines it into the client bundle at build time, so flipping it needs a
 * redeploy (as any Vercel env change does).
 */
export type AuthProvider = 'firebase' | 'better-auth';

export function authProvider(): AuthProvider {
  return process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'better-auth' ? 'better-auth' : 'firebase';
}

export function isBetterAuth(): boolean {
  return authProvider() === 'better-auth';
}
