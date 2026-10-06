import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  isSettableStatus,
  type ContactPageScan,
  type ContactRow,
} from '@/domains/admin/contactTriage';
import { isoOrNull } from '@/domains/booking/queries/adminBookingQuery';
import { logger } from '../../_lib/logger';

/**
 * Reading and writing `contacts` through the server, for the Contacts screen.
 *
 * This is the migration's quiet security win: the legacy panel read and wrote
 * this collection from the browser with the client SDK, so its authorization
 * lived entirely in the Firestore rules and its status values were whatever a
 * signed-in admin's browser sent. Everything here goes through `requireAdmin`
 * routes, and the one write validates the status against the schema's own
 * vocabulary before touching the document.
 */
export const CONTACT_PAGE_SIZE = 25;

const UNREADABLE = 'Could not be read just now. Reload to try again.';

function requireDb() {
  if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
  return adminDb;
}

function toContactRow(doc: { id: string; data: () => Record<string, unknown> }): ContactRow {
  const data = doc.data();
  return {
    id: doc.id,
    name: typeof data.name === 'string' ? data.name : '',
    email: typeof data.email === 'string' ? data.email : '',
    message: typeof data.message === 'string' ? data.message : '',
    status: typeof data.status === 'string' ? data.status : 'unknown',
    priority: typeof data.priority === 'string' ? data.priority : 'normal',
    source: typeof data.source === 'string' ? data.source : 'unknown',
    createdAtIso: isoOrNull(data.createdAt),
    lastUpdatedAtIso: isoOrNull(data.lastUpdatedAt),
  };
}

/**
 * One page of the inquiries list, newest first. The cursor is the last row's
 * `createdAt` plus its document id — the id is the tie-breaker, without which
 * two inquiries submitted in the same millisecond could skip or repeat a row.
 */
export async function listContactsPage(
  cursor: { createdAtMs: number; id: string } | null,
  pageSize: number = CONTACT_PAGE_SIZE
): Promise<ContactPageScan> {
  try {
    let query = requireDb()
      .collection('contacts')
      .orderBy('createdAt', 'desc')
      .orderBy('__name__', 'desc')
      .limit(pageSize + 1);
    if (cursor) {
      query = query.startAfter(Timestamp.fromMillis(cursor.createdAtMs), cursor.id);
    }
    const snapshot = await query.get();
    const rows = snapshot.docs.slice(0, pageSize).map(toContactRow);
    const hasMore = snapshot.size > pageSize;
    const last = rows[rows.length - 1];
    const lastMs = last?.createdAtIso ? Date.parse(last.createdAtIso) : NaN;
    return {
      ok: true,
      page: {
        rows,
        nextCursor: hasMore && last && Number.isFinite(lastMs) ? { createdAtMs: lastMs, id: last.id } : null,
      },
      pageSize,
    };
  } catch (error) {
    logger.error('SYSTEM', 'Admin contacts page read failed', error);
    return { ok: false, reason: UNREADABLE };
  }
}

export type ContactMutationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: number; readonly error: string };

/** Sets one inquiry's status. The vocabulary is the schema's, nothing broader. */
export async function updateContactStatus(
  contactId: string,
  status: string
): Promise<ContactMutationResult> {
  if (!isSettableStatus(status)) {
    return { ok: false, status: 400, error: 'That status is not one the console can set.' };
  }
  try {
    await requireDb()
      .collection('contacts')
      .doc(contactId)
      .update({ status, lastUpdatedAt: new Date() });
    return { ok: true };
  } catch (error) {
    logger.error('SYSTEM', `Admin contact status update failed for ${contactId}`, error);
    return { ok: false, status: 500, error: 'The update did not go through just now.' };
  }
}

export async function deleteContact(contactId: string): Promise<ContactMutationResult> {
  try {
    await requireDb().collection('contacts').doc(contactId).delete();
    return { ok: true };
  } catch (error) {
    logger.error('SYSTEM', `Admin contact delete failed for ${contactId}`, error);
    return { ok: false, status: 500, error: 'The delete did not go through just now.' };
  }
}
