import { encodeFirebaseHash } from './firebasePassword';

/**
 * Firebase Auth → Better Auth user import: the pure transform. The runner
 * (scripts/migrations/import-firebase-users.mts) feeds it Firebase Admin
 * `listUsers()` records plus each uid's Firestore `users/{uid}` doc, and loads
 * the rows it returns. See docs/plans/2026-10-26-better-auth-migration.md.
 *
 * Imported users keep their Firebase uid as `user.id`, so every Firestore
 * reference to a uid stays valid.
 */

/** The subset of a Firebase Admin `UserRecord` the import reads. */
export interface FirebaseUserLike {
  uid: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  photoURL?: string;
  disabled: boolean;
  passwordHash?: string;
  passwordSalt?: string;
  metadata: { creationTime?: string };
  providerData: Array<{ providerId: string; uid: string }>;
}

/** The subset of Firestore `users/{uid}` the import reads. */
export interface FirestoreUserDocLike {
  role?: unknown;
  accountDisabled?: unknown;
  name?: unknown;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  role: 'client' | 'therapist' | 'admin';
  banned: boolean;
  banReason: string | null;
}

export interface AccountRow {
  id: string;
  accountId: string;
  providerId: 'credential' | 'google';
  userId: string;
  password: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkippedUser {
  uid: string;
  reason: 'no_email' | 'duplicate_email';
}

export interface ImportPlan {
  users: UserRow[];
  accounts: AccountRow[];
  skipped: SkippedUser[];
}

const ROLES = new Set(['client', 'therapist', 'admin']);

/** Admin SDK hashes are web-safe base64; store the standard form the CLI export uses. */
function toStandardBase64(value: string): string {
  return value.replace(/-/g, '+').replace(/_/g, '/');
}

function displayName(user: FirebaseUserLike, doc: FirestoreUserDocLike | undefined, email: string): string {
  const fromDoc = typeof doc?.name === 'string' ? doc.name.trim() : '';
  return user.displayName?.trim() || fromDoc || email.split('@')[0];
}

export function planFirebaseImport(
  firebaseUsers: readonly FirebaseUserLike[],
  docs: ReadonlyMap<string, FirestoreUserDocLike>,
  now: Date = new Date()
): ImportPlan {
  const users: UserRow[] = [];
  const accounts: AccountRow[] = [];
  const skipped: SkippedUser[] = [];
  const seenEmails = new Set<string>();

  for (const fb of firebaseUsers) {
    // Better Auth keys sign-in on email; a phone-only Firebase user has no way in.
    const email = fb.email?.trim().toLowerCase();
    if (!email) {
      skipped.push({ uid: fb.uid, reason: 'no_email' });
      continue;
    }
    if (seenEmails.has(email)) {
      skipped.push({ uid: fb.uid, reason: 'duplicate_email' });
      continue;
    }
    seenEmails.add(email);

    const doc = docs.get(fb.uid);
    const role = typeof doc?.role === 'string' && ROLES.has(doc.role) ? (doc.role as UserRow['role']) : 'client';
    const banned = fb.disabled || doc?.accountDisabled === true;
    const createdAt = fb.metadata.creationTime ? new Date(fb.metadata.creationTime) : now;

    users.push({
      id: fb.uid,
      name: displayName(fb, doc, email),
      email,
      emailVerified: fb.emailVerified,
      image: fb.photoURL ?? null,
      createdAt,
      updatedAt: now,
      role,
      banned,
      banReason: banned ? 'Disabled in Firebase before migration' : null,
    });

    if (fb.passwordHash && fb.passwordSalt) {
      accounts.push({
        id: `credential_${fb.uid}`,
        accountId: fb.uid,
        providerId: 'credential',
        userId: fb.uid,
        password: encodeFirebaseHash(toStandardBase64(fb.passwordHash), toStandardBase64(fb.passwordSalt)),
        createdAt,
        updatedAt: now,
      });
    }

    const google = fb.providerData.find((p) => p.providerId === 'google.com');
    if (google) {
      accounts.push({
        id: `google_${fb.uid}`,
        // The Google `sub`, which is what Better Auth matches a Google sign-in on.
        accountId: google.uid,
        providerId: 'google',
        userId: fb.uid,
        password: null,
        createdAt,
        updatedAt: now,
      });
    }
  }

  return { users, accounts, skipped };
}
