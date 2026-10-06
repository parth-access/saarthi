import { adminDb } from '@/lib/firebase/admin';
import { DocumentData, Query, Timestamp } from 'firebase-admin/firestore';
import {
  isUserRole,
  type AdministratorCountScan,
  type UsersPageScan,
  type UsersRow,
  type UserRole,
} from '@/domains/admin/usersTriage';
import { isoOrNull } from '@/domains/booking/queries/adminBookingQuery';
import { logger } from '../../_lib/logger';

/**
 * Reading and writing `users` for the Users & roles screen.
 *
 * Everything the console shows or changes here is the same document
 * verifySession reads on every request (`role`, `sessionRevokeBefore`) plus
 * the disable flag POST /api/auth/session honours at mint time — so a change
 * made here is enforced by the platform's own authorization path, not by the
 * console believing it.
 *
 * Reads are bounded: paged scans of `USERS_PAGE_SIZE + 1`, an exact-email
 * lookup capped at five rows, and a `count()` aggregation for the
 * administrator total. Nothing scans the whole collection.
 */
export const USERS_PAGE_SIZE = 25;

export const USERS_READ_FAILED = 'Could not be read just now. Reload to try again.';
export const ADMIN_COUNT_READ_FAILED = 'The administrator count could not be read just now.';

function requireDb() {
  if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
  return adminDb;
}

function toUserRow(doc: { id: string; data: () => Record<string, unknown> | undefined }): UsersRow {
  const data = doc.data() ?? {};
  const revokeMark = Number(data.sessionRevokeBefore);
  return {
    id: doc.id,
    name: typeof data.name === 'string' ? data.name : '',
    email: typeof data.email === 'string' ? data.email : '',
    role: typeof data.role === 'string' ? data.role : 'client',
    provider: typeof data.provider === 'string' ? data.provider : null,
    createdAtIso: isoOrNull(data.createdAt),
    accountDisabled: data.accountDisabled === true,
    sessionRevokeBeforeSeconds: Number.isFinite(revokeMark) && revokeMark > 0 ? revokeMark : null,
  };
}

function cursorFor(rows: readonly UsersRow[]): { createdAtMs: number; id: string } | null {
  const last = rows[rows.length - 1];
  if (!last?.createdAtIso) return null;
  const ms = Date.parse(last.createdAtIso);
  return Number.isFinite(ms) ? { createdAtMs: ms, id: last.id } : null;
}

/**
 * One page of accounts, newest first. The `role` filter is an equality clause
 * served by the composite index above; the unfiltered page uses the automatic
 * `createdAt` index. Both use the `__name__` tie-break so two accounts created
 * in the same millisecond cannot skip or repeat across pages.
 *
 * A document without `createdAt` does not appear in any paged page — Firestore
 * drops it from the ordering — which is why exact-email lookup exists and why
 * the screen says so. Every account is reachable that way.
 */
export async function listUsersPage(
  cursor: { createdAtMs: number; id: string } | null,
  roleFilter: UserRole | 'all',
  pageSize: number = USERS_PAGE_SIZE
): Promise<UsersPageScan> {
  try {
    let query: Query<DocumentData> = requireDb().collection('users');
    if (roleFilter !== 'all') {
      query = query.where('role', '==', roleFilter);
    }
    let ordered = query.orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(pageSize + 1);
    if (cursor) {
      ordered = ordered.startAfter(Timestamp.fromMillis(cursor.createdAtMs), cursor.id);
    }
    const snapshot = await ordered.get();
    const rows = snapshot.docs.slice(0, pageSize).map(toUserRow);
    const nextCursor = snapshot.size > pageSize ? cursorFor(rows) : null;
    return { ok: true, page: { rows, nextCursor } };
  } catch (error) {
    logger.error('SYSTEM', 'Admin users page read failed', error);
    return { ok: false, reason: USERS_READ_FAILED };
  }
}

/**
 * Exact-match lookup by email. No ordering server-side (a plain equality query
 * needs no composite); sorted newest-first in memory over at most five rows.
 * This is the path that reaches accounts missing `createdAt`.
 */
export async function findUsersByEmail(email: string): Promise<UsersPageScan> {
  try {
    const snapshot = await requireDb()
      .collection('users')
      .where('email', '==', email)
      .limit(5)
      .get();
    const rows = snapshot.docs
      .map(toUserRow)
      .sort((a, b) => (b.createdAtIso ?? '').localeCompare(a.createdAtIso ?? ''));
    return { ok: true, page: { rows, nextCursor: null } };
  } catch (error) {
    logger.error('SYSTEM', `Admin users email lookup failed for ${email}`, error);
    return { ok: false, reason: USERS_READ_FAILED };
  }
}

/** The administrator total, so the screen can show how many admins exist before one is changed. */
export async function countAdministrators(): Promise<AdministratorCountScan> {
  try {
    const snapshot = await requireDb().collection('users').where('role', '==', 'admin').count().get();
    return { ok: true, count: snapshot.data().count };
  } catch (error) {
    logger.error('SYSTEM', 'Admin administrator count read failed', error);
    return { ok: false, reason: ADMIN_COUNT_READ_FAILED };
  }
}

/**
 * The last-admin guard's input: does any account other than `excludeUid` hold
 * the admin role? Bounded to reading two documents — the answer is the same
 * whether the collection holds two admins or two hundred.
 */
export async function countOtherAdministrators(excludeUid: string): Promise<number> {
  const snapshot = await requireDb()
    .collection('users')
    .where('role', '==', 'admin')
    .limit(2)
    .get();
  return snapshot.docs.filter((doc) => doc.id !== excludeUid).length;
}

export interface UserSnapshot {
  readonly row: UsersRow;
}

export async function readUser(userId: string): Promise<UserSnapshot | null> {
  const doc = await requireDb().collection('users').doc(userId).get();
  if (!doc.exists) return null;
  return { row: toUserRow(doc) };
}

export type UserMutationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: number; readonly error: string };

export async function setUserRole(userId: string, role: UserRole): Promise<UserMutationResult> {
  if (!isUserRole(role)) {
    return { ok: false, status: 400, error: 'That role is not one the console can set.' };
  }
  try {
    await requireDb()
      .collection('users')
      .doc(userId)
      .update({ role, updatedAt: Timestamp.now() });
    return { ok: true };
  } catch (error) {
    logger.error('SYSTEM', `Admin role change failed for ${userId}`, error);
    return { ok: false, status: 500, error: 'The role change did not go through just now.' };
  }
}

/** Kills every session issued before `markSeconds`; the person can sign back in immediately. */
export async function revokeUserSessions(
  userId: string,
  markSeconds: number
): Promise<UserMutationResult> {
  try {
    await requireDb()
      .collection('users')
      .doc(userId)
      .update({ sessionRevokeBefore: markSeconds, updatedAt: Timestamp.now() });
    return { ok: true };
  } catch (error) {
    logger.error('SYSTEM', `Admin session revocation failed for ${userId}`, error);
    return { ok: false, status: 500, error: 'The revocation did not go through just now.' };
  }
}

/**
 * Disabling is two fields in one write: `accountDisabled` blocks the next
 * sign-in at session-mint time, and the revoke mark kills whatever sessions
 * exist right now. Enabling only clears the flag — sessions revoked while the
 * account was disabled stay revoked, which is the safe direction to err in.
 */
export async function setUserAccountDisabled(
  userId: string,
  disabled: boolean,
  markSeconds: number
): Promise<UserMutationResult> {
  try {
    const update: Record<string, unknown> = {
      accountDisabled: disabled,
      updatedAt: Timestamp.now(),
    };
    if (disabled) {
      update.sessionRevokeBefore = markSeconds;
    }
    await requireDb().collection('users').doc(userId).update(update);
    return { ok: true };
  } catch (error) {
    logger.error('SYSTEM', `Admin account ${disabled ? 'disable' : 'enable'} failed for ${userId}`, error);
    return {
      ok: false,
      status: 500,
      error: disabled
        ? 'The disable did not go through just now.'
        : 'The enable did not go through just now.',
    };
  }
}
