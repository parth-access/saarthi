# Plan: migrate from Firebase Auth to Better Auth

Status: proposal, not started. Written 2026-10-26.

## Goal and scope

Replace Firebase Auth with [Better Auth](https://www.better-auth.com) so sign-in runs on
`saarthilife.com` (Google's consent screen names our domain, not `firebaseapp.com`) and
auth state lives in a database we control.

**In scope:** sign-up/sign-in (email + password, Google), email verification, password
reset, sessions, roles (`client` / `therapist` / `admin`), account disable, session
revocation, the admin "Users & roles" console.

**Out of scope:** moving app data off Firestore. Bookings, payments, therapists, outbox,
etc. stay in Firestore and keep being written by the Admin SDK.

## Key decisions

### 1. Database: Postgres in Mumbai, for auth tables only

Better Auth has no official Firestore adapter (official: Kysely for Postgres/MySQL/SQLite,
Prisma, Drizzle, MongoDB). A community Firestore adapter would put the most
security-sensitive code on an unmaintained dependency, so auth gets its own Postgres.

| Option | Region near users | Notes |
|---|---|---|
| **Supabase Postgres (recommended)** | Mumbai (`ap-south-1`) | Same region as Vercel `bom1`; keeps Indian users' data in India (relevant under the DPDP Act for a health platform). Available via Vercel Marketplace. Use a paid plan: free projects pause when idle. |
| Neon | Singapore at nearest (no Mumbai region listed) | Fine technically, but ~30–40 ms extra per auth query and data leaves India. |
| AWS RDS / Aiven in `ap-south-1` | Mumbai | Works; more ops than Supabase for this size. |

Use the **Kysely adapter with `pg`** (no ORM to adopt; Better Auth's CLI generates the
schema). Optionally add Upstash Redis (Mumbai) as Better Auth *secondary storage* for
sessions and rate limits if session lookups ever show up in latency.

### 2. Keep every existing user ID

Insert each Firebase user into Better Auth with **`user.id` = their Firebase `uid`**.
Every Firestore reference stays valid with zero data rewrites:
`users/{uid}`, `bookings.userId`, `therapists.authId`, audit logs, reviews `studentId`.
New users get Better Auth's generated IDs (strings, same shape in Firestore).

### 3. Better Auth owns identity; Firestore keeps profile data

| Field | Today | After |
|---|---|---|
| email, emailVerified, name, image | Firebase Auth | Better Auth `user` |
| password hash, Google link | Firebase Auth | Better Auth `account` |
| role | Firestore `users.role` | Better Auth `user.role` (admin plugin, custom roles) |
| accountDisabled | Firestore `users.accountDisabled` | Better Auth `user.banned` (admin plugin) |
| sessionRevokeBefore, `revoked_sessions` | Firestore | Removed: sessions live in Postgres; revoke = delete rows |
| phone, bio, notifications | Firestore `users` | Firestore `users` (unchanged) |

### 4. No more client-side Firestore with user identity

Without Firebase Auth, the browser has no `request.auth`, so Firestore rules can no longer
authorize per-user reads. The few client reads that need identity move behind API routes,
and the rules become: public reads for `therapists` / availability only, everything else
server-only.

### 5. Passwords carry over (no forced reset)

Firebase uses a modified scrypt with project-specific parameters. Export users with
`firebase auth:export` and the hash parameters from *Firebase console → Authentication →
Users → ⋮ → Password hash parameters*. Better Auth allows custom
`emailAndPassword.password.verify`, so:

- imported hashes are stored with a `firebase$` prefix;
- `verify` checks Firebase-scrypt for prefixed hashes, Better Auth's default scrypt otherwise;
- after a successful legacy verify, re-hash with the default scheme (sign-in hook), so the
  legacy path drains over time.

Validate the Firebase-scrypt implementation against a known test account during the dry
run before trusting it.

## What changes in the app

The design keeps `verifySession()` and `requireAdmin/Therapist/Client()` as a **façade**
with the same return shape (`{ uid, email?, role }`, email only when verified). The 29 API
routes that call them don't change.

### Server

| Area | Today | Change |
|---|---|---|
| `src/lib/auth.ts` (new) | — | `betterAuth({ database: Pool, emailAndPassword, emailVerification, socialProviders.google, plugins: [admin({ ac, roles: client/therapist/admin }), nextCookies()] })`, `advanced.database.generateId` default, account linking with Google trusted |
| `src/app/api/auth/[...all]/route.ts` (new) | — | `toNextJsHandler(auth)` |
| `src/app/api/auth/session/route.ts` | Mints HS256 JWT from Firebase ID token; logout denylist | Delete. Better Auth sets/clears its own cookie |
| `src/lib/auth/verifySession.ts` | Verifies JWT or Firebase ID token, reads `users/{uid}` | `auth.api.getSession({ headers })`; map `user.id → uid`, `user.role`, verified email. Banned users never get a session |
| `src/middleware.ts` | Verifies JWT with `JWT_SECRET`, gates `/admin`, `/therapist`, `/dashboard` | Node-runtime middleware calling `getSession` (enable `session.cookieCache` so it is a cookie read, not a DB hit) |
| `src/app/api/admin/users/*` + `usersSources.ts` | Writes `role`, `accountDisabled`, `sessionRevokeBefore` to Firestore; Firebase Auth sync | `auth.api.setRole`, `banUser` / `unbanUser`, `revokeUserSessions`; keep the last-admin guard and the `audit_logs` row |
| `src/app/api/admin/therapists/profileWrite.ts` | `adminAuth.getUserByEmail` to link a therapist login | Query Better Auth `user` by email |
| `join-session`, `reviews` | Accept Bearer ID tokens | Already go through `verifySession`; nothing else |
| Email | Firebase sends verification/reset | `sendVerificationEmail` / `sendResetPassword` via the existing Resend client, with templates in `emailTemplates.ts` (don't await; use `waitUntil`) |
| Env | `JWT_SECRET`, `NEXT_PUBLIC_FIREBASE_*` (auth), `FIREBASE_ADMIN_KEY_BASE64` | Add `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DATABASE_URL`, `GOOGLE_AUTH_CLIENT_ID/SECRET` (the sign-in client; `GOOGLE_CLIENT_ID/SECRET` stay with Calendar/Meet). Remove `JWT_SECRET` and the auth-only Firebase client vars; keep the Admin key (Firestore) |

### Client

| File | Change |
|---|---|
| `src/contexts/AuthContext.tsx` | Replace `onAuthStateChanged` with Better Auth's `useSession()`; remove client-side `users` doc creation (done server-side in a `databaseHooks.user.create.after` hook) |
| `src/app/(auth)/login/page.tsx`, `src/services/authService.ts` | `signIn.email`, `signUp.email`, `signIn.social({ provider: 'google' })` (full-page redirect, no popup), `requestPasswordReset`, `sendVerificationEmail` |
| `src/app/auth-popup/page.tsx` | Delete (popup/iframe workaround is unnecessary with server-side OAuth) |
| `src/lib/fetchWithAuth.ts` + 9 files calling `getIdToken()` (13 calls) | Drop the `Authorization: Bearer` header; same-origin cookies are sent automatically |
| `src/hooks/useDashboardData.ts` | Read bookings from a new `GET /api/me/bookings` instead of Firestore |
| `src/app/dashboard/profile/page.tsx` | Profile read/write and booking list via `GET/PATCH /api/me/profile` and `/api/me/bookings` |
| `src/services/therapistService.ts`, `src/app/dashboard/page.tsx` | Therapist reads are public; keep or move to API (no identity needed) |
| `src/lib/firebase/client.ts` | Keep only if public Firestore reads remain; drop `getAuth` |

### Firestore rules

Remove all `request.auth`-based clauses (`users`, `bookings`, `audit_logs`,
`reschedule_requests`, availability). Keep `therapists` and availability public reads,
default-deny everything else. Server access via the Admin SDK is unaffected.

### Google Cloud

Reuse the existing OAuth web client. Add redirect URI
`https://www.saarthilife.com/api/auth/callback/google` (and a preview/localhost one for
testing). Remove the `/__/auth` proxy rewrites from `next.config.ts` after cutover.

## Data migration

1. **Export:** `firebase auth:export users.json --format=json` plus the password hash
   parameters. Treat the file as a secret (hashes + emails); never commit it.
2. **Transform (script in `scripts/migrations/`):** per Firebase user
   - `user`: `id = localId`, `email`, `emailVerified`, `name = displayName`, `image = photoUrl`,
     `role` and `banned` read from Firestore `users/{uid}`, `createdAt` from `createdAt`.
   - `account` (password): `providerId = 'credential'`, `accountId = localId`,
     `password = 'firebase$' + passwordHash + '$' + salt`.
   - `account` (Google): `providerId = 'google'`, `accountId = providerUserInfo[google].rawId`
     (the Google `sub`, which is what Better Auth matches on).
   - Users with both get both account rows.
3. **Load** with plain SQL inserts in one transaction, idempotent (`ON CONFLICT (id) DO
   NOTHING`) so it can re-run for the delta at cutover.
4. **Verify:** counts match; spot-check 5 accounts (password, Google, both, unverified,
   admin); sign in with a known test password through the legacy verifier.

## Cutover

1. Build everything behind the new code path on a branch; preview deploy points at a
   **staging** Postgres loaded from a real export.
2. Dry run end-to-end on preview: sign up, verify email, reset password, Google, roles,
   disable/revoke from the console, therapist workspace, booking + payment.
3. Production cutover (low-traffic hour, ~15 min):
   - temporarily block new sign-ups (Firebase console: disable new account creation);
   - final export → delta import;
   - deploy; deploy the new Firestore rules;
   - everyone signs in once (old JWT cookies are simply ignored).
4. Monitor sign-in errors in Sentry for 48 h.

**Rollback:** keep Firebase Auth users untouched for 30 days. Rolling back = redeploy the
previous build and the previous rules. Accounts created on Better Auth during the window
would need a reverse import, so decide early (first 24 h) if rolling back.

## Estimate

| Phase | Days |
|---|---|
| Provision Postgres, secrets, Better Auth server config, schema | 1 |
| Façade: `verifySession`, `requireRole`, middleware, delete JWT route | 1 |
| Client: AuthContext, login/sign-up/reset/verify, remove Bearer tokens and auth-popup | 1.5 |
| Move client Firestore reads behind `/api/me/*`, rewrite rules | 1 |
| Admin users console on the admin plugin, therapist linking | 1 |
| Migration script, Firebase-scrypt verifier, dry runs | 1.5 |
| Update tests (session/rules/role-matrix suites mock Firebase today) | 1 |
| Cutover + monitoring | 0.5 |
| **Total** | **~8.5 working days** |

## Risks

- **Legacy password verification is wrong** → users locked out. Mitigation: dry run with a
  real export and a known password; fall back to a forced reset email for anyone who fails.
- **A missed client Firestore read** breaks a page with `permission-denied`. Mitigation:
  the list above came from a full grep (`firebase/firestore` imports in 7 files); re-grep
  before cutover.
- **Google accounts not re-linking** if `accountId` isn't the Google `sub`. Mitigation:
  spot-check in the dry run.
- **More infrastructure:** a Postgres bill (~$25/month on Supabase Pro) and one more
  system to back up. Better Auth is self-hosted, so security patches are ours to apply.
- **Security fixes from the 2026-10 audit** that lean on Firebase (Auth sync on disable,
  rules `isSignedIn` check, logout denylist) are replaced, not ported: re-run the audit
  checklist after cutover.

## Open questions

- Does anything else use this Firebase project's Auth (another app, the `classes`
  account)? If so, keep Firebase Auth alive for it.
- Should therapists sign in with their own Google accounts only, or also passwords?
- Is a one-time "please sign in again" acceptable, or do we need to bridge old sessions?
