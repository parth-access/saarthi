import { adminDb } from '@/lib/firebase/admin';
import {
  EMAIL_LIST_LIMIT,
  type EmailAttemptRow,
  type EmailLogDetail,
  type EmailLogRow,
  type EmailLogScan,
} from '@/domains/admin/emailTriage';
import { isoOrNull } from '@/domains/booking/queries/adminBookingQuery';
import { logger } from '../../_lib/logger';

/**
 * Reading the email log for the Email operations screen.
 *
 * The list projects everything EXCEPT `html` and `text` — a table of a hundred
 * rendered emails is the wrong thing to put on the wire. The detail read adds
 * the plaintext backup and the per-attempt dispatch history, still without
 * `html`. Each read fails alone, as `{ ok: false }`, never as an empty list.
 */
export const UNREADABLE = 'Could not be read just now. Reload to try again.';

function requireDb() {
  if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
  return adminDb;
}

function failed(source: string, error: unknown): { ok: false; reason: string } {
  logger.error('SYSTEM', `Admin email log source "${source}" failed`, error, { source });
  return { ok: false, reason: UNREADABLE };
}

function lastAttemptError(attempts: unknown): string | null {
  if (!Array.isArray(attempts) || attempts.length === 0) return null;
  const last = attempts[attempts.length - 1] as { error?: unknown } | undefined;
  return typeof last?.error === 'string' && last.error ? last.error : null;
}

function toEmailLogRow(id: string, data: Record<string, unknown>): EmailLogRow {
  const attempts = Array.isArray(data.attempts) ? data.attempts : [];
  return {
    id,
    bookingId: typeof data.bookingId === 'string' ? data.bookingId : null,
    type: typeof data.type === 'string' ? data.type : 'unknown',
    recipient: typeof data.recipient === 'string' ? data.recipient : '',
    subject: typeof data.subject === 'string' ? data.subject : '',
    status: typeof data.status === 'string' ? data.status : 'unknown',
    attemptCount: attempts.length,
    lastError: lastAttemptError(attempts),
    createdAtIso: isoOrNull(data.createdAt),
    updatedAtIso: isoOrNull(data.updatedAt),
  };
}

/**
 * The most recent slice of the email log, oldest bound admitted. Unpaginated
 * beyond the limit on purpose: the older history is reachable through the
 * booking lookup, which is how an operator actually searches this log.
 */
export async function listRecentEmailLogs(limit: number = EMAIL_LIST_LIMIT): Promise<EmailLogScan> {
  try {
    const snapshot = await requireDb()
      .collection('emails')
      .orderBy('createdAt', 'desc')
      .limit(limit + 1)
      .get();
    return {
      ok: true,
      rows: snapshot.docs.slice(0, limit).map((doc) => toEmailLogRow(doc.id, doc.data())),
      atLeast: snapshot.size > limit,
    };
  } catch (error) {
    return failed('recent_emails', error);
  }
}

/**
 * Every email logged for one booking, newest first. An equality query needs no
 * composite index, and a single booking's email set is small enough that the
 * limit is a formality rather than a gamble.
 */
export async function findEmailLogsForBooking(
  bookingId: string,
  limit: number = EMAIL_LIST_LIMIT
): Promise<EmailLogScan> {
  try {
    const snapshot = await requireDb()
      .collection('emails')
      .where('bookingId', '==', bookingId)
      .limit(limit + 1)
      .get();
    const rows = snapshot.docs
      .slice(0, limit)
      .map((doc) => toEmailLogRow(doc.id, doc.data()))
      .sort((a, b) => (b.createdAtIso ?? '').localeCompare(a.createdAtIso ?? ''));
    return { ok: true, rows, atLeast: snapshot.size > limit };
  } catch (error) {
    return failed('booking_emails', error);
  }
}

function toAttemptRow(attempt: unknown, index: number): EmailAttemptRow {
  const record = (typeof attempt === 'object' && attempt !== null ? attempt : {}) as Record<string, unknown>;
  const response = (typeof record.response === 'object' && record.response !== null ? record.response : {}) as Record<string, unknown>;
  return {
    attemptNumber: typeof record.attemptNumber === 'number' ? record.attemptNumber : index + 1,
    attemptedAtIso: isoOrNull(record.attemptedAt),
    status: typeof record.status === 'string' ? record.status : 'unknown',
    error: typeof record.error === 'string' && record.error ? record.error : null,
    responseId: typeof response.id === 'string' && response.id ? response.id : null,
  };
}

export type EmailLogDetailResult =
  | { readonly ok: true; readonly detail: EmailLogDetail }
  | { readonly ok: false; readonly reason: string };

/** One email in full — minus `html`, which no operator action needs. */
export async function readEmailLogDetail(emailId: string): Promise<EmailLogDetailResult> {
  try {
    const snapshot = await requireDb().collection('emails').doc(emailId).get();
    if (!snapshot.exists) return { ok: false, reason: UNREADABLE };
    const data = snapshot.data() as Record<string, unknown>;
    const attempts = Array.isArray(data.attempts) ? data.attempts : [];
    return {
      ok: true,
      detail: {
        ...toEmailLogRow(emailId, data),
        text: typeof data.text === 'string' && data.text ? data.text : null,
        attempts: attempts.map(toAttemptRow),
      },
    };
  } catch (error) {
    logger.error('SYSTEM', `Admin email detail read failed for ${emailId}`, error);
    return { ok: false, reason: UNREADABLE };
  }
}
