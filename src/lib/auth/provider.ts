/**
 * Which identity system is live. Firebase stays the default until the
 * Better Auth migration cuts over (docs/plans/2026-10-26-better-auth-migration.md),
 * so this branch can merge without changing production.
 */
export type AuthProvider = 'firebase' | 'better-auth';

export function authProvider(): AuthProvider {
  return process.env.AUTH_PROVIDER === 'better-auth' ? 'better-auth' : 'firebase';
}

export function isBetterAuth(): boolean {
  return authProvider() === 'better-auth';
}
