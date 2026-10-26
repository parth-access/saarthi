import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { hashPassword } from 'better-auth/crypto';
import { Pool } from 'pg';
import { verifyPassword } from './firebasePassword';
import { ac, roles } from './permissions';

/**
 * Better Auth server instance (migration phase 1: config + schema only).
 *
 * Not mounted yet: there is no /api/auth/[...all] route, and verifySession
 * still reads Firebase sessions. Phase 2 wires this in. See
 * docs/plans/2026-10-26-better-auth-migration.md.
 *
 * Auth tables live in Postgres (Supabase, Mumbai); app data stays in
 * Firestore. Users imported from Firebase keep their Firebase uid as
 * `user.id`, so every Firestore reference to a uid stays valid.
 */

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  appName: 'Saarthi',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  // pg connects lazily, so importing this module needs no database. On
  // Supabase use the transaction pooler URL (port 6543) for serverless.
  database: new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }),

  emailAndPassword: {
    enabled: true,
    // Matches today: sign-in does not wait for verification, but only a
    // verified email counts as proof of booking ownership.
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    password: { hash: hashPassword, verify: verifyPassword },
    // sendResetPassword is added in phase 3 (Resend templates).
  },

  socialProviders:
    googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {},

  account: {
    // A Google sign-in with the same verified email joins the existing account.
    accountLinking: { enabled: true, trustedProviders: ['google'] },
  },

  session: {
    // Same lifetime as the current __session cookie.
    expiresIn: 60 * 60 * 24 * 5,
    // Lets middleware read the session without a database round trip. API
    // routes bypass it (phase 2) so bans and revocations apply immediately.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  // Shared across serverless instances; the in-memory default is per instance.
  rateLimit: { enabled: true, storage: 'database' },

  plugins: [
    admin({ ac, roles, defaultRole: 'client', adminRoles: ['admin'] }),
    // Must stay last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
