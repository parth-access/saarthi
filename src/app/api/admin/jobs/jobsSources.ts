import { adminDb } from '@/lib/firebase/admin';
import {
  type JobEmailRow,
  type JobEventRow,
  type JobScan,
} from '@/domains/admin/jobsTriage';
import { isoOrNull } from '@/domains/booking/queries/adminBookingQuery';
import { logger } from '../../_lib/logger';

/**
 * Reading the Background jobs screen's slices out of Firestore.
 *
 * The overview's rules apply, tightened for this screen: every slice is a
 * bounded equality scan (`limit + 1`, `atLeast` when the bound was hit) served
 * by Firestore's automatic single-field indexes — no composite index, no deploy
 * step — and each slice fails alone, as `{ ok: false }`, never as an empty list.
 *
 * Two projections are deliberate about what does NOT travel:
 *  - Outbox `payload` never leaves the server. It carries client names, emails
 *    and booking details; the row's error text is what an operator needs.
 *  - Email `html` and `text` bodies never leave the server. The full rendered
 *    email belongs to the Email operations screen, where one email has been
 *    asked for — not to a queue table.
 */
export const JOBS_SCAN_LIMIT = 60;

const UNREADABLE = 'Could not be read just now. Reload to try again.';

function requireDb() {
  if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
  return adminDb;
}

function failed(source: string, error: unknown): { ok: false; reason: string } {
  logger.error('SYSTEM', `Admin jobs source "${source}" failed`, error, { source });
  return { ok: false, reason: UNREADABLE };
}

function toJobEventRow(doc: { id: string; data: () => Record<string, unknown> }): JobEventRow {
  const data = doc.data();
  const lastError =
    typeof data.lastError === 'string' && data.lastError
      ? data.lastError
      : typeof data.error === 'string' && data.error
        ? data.error
        : null;
  return {
    id: doc.id,
    name: typeof data.name === 'string' ? data.name : 'unknown',
    aggregateType: typeof data.aggregateType === 'string' ? data.aggregateType : 'unknown',
    aggregateId: typeof data.aggregateId === 'string' ? data.aggregateId : '',
    status: typeof data.status === 'string' ? data.status : 'unknown',
    attempts: typeof data.attempts === 'number' ? data.attempts : 0,
    maxAttempts: typeof data.maxAttempts === 'number' ? data.maxAttempts : 0,
    createdAtIso: isoOrNull(data.createdAt),
    lastAttemptAtIso: isoOrNull(data.lastAttemptAt),
    nextAttemptAtIso: isoOrNull(data.nextAttemptAt),
    error: lastError,
  };
}

function toJobEmailRow(doc: { id: string; data: () => Record<string, unknown> }): JobEmailRow {
  const data = doc.data();
  const attempts = Array.isArray(data.attempts) ? data.attempts.length : 0;
  const lastAttempt =
    attempts > 0
      ? (data.attempts as Array<{ error?: unknown }>)[attempts - 1]
      : undefined;
  return {
    id: doc.id,
    bookingId: typeof data.bookingId === 'string' ? data.bookingId : null,
    type: typeof data.type === 'string' ? data.type : 'unknown',
    recipient: typeof data.recipient === 'string' ? data.recipient : '',
    subject: typeof data.subject === 'string' ? data.subject : '',
    status: typeof data.status === 'string' ? data.status : 'unknown',
    attemptCount: attempts,
    lastError: typeof lastAttempt?.error === 'string' ? lastAttempt.error : null,
    createdAtIso: isoOrNull(data.createdAt),
    updatedAtIso: isoOrNull(data.updatedAt),
  };
}

/** One bounded, unordered equality scan that reports whether it filled. */
async function scanByStatus<Row>(
  source: string,
  collection: string,
  status: string | string[],
  limit: number,
  project: (doc: { id: string; data: () => Record<string, unknown> }) => Row
): Promise<JobScan<Row>> {
  try {
    let query = requireDb().collection(collection);
    query = Array.isArray(status)
      ? query.where('status', 'in', status)
      : query.where('status', '==', status);
    const snapshot = await query.limit(limit + 1).get();
    return {
      ok: true,
      rows: snapshot.docs.slice(0, limit).map(project),
      atLeast: snapshot.size > limit,
    };
  } catch (error) {
    return failed(source, error);
  }
}

export interface JobsOutboxSlices {
  readonly waiting: JobScan<JobEventRow>;
  readonly failed: JobScan<JobEventRow>;
  readonly dead: JobScan<JobEventRow>;
}

export interface JobsEmailSlices {
  readonly queued: JobScan<JobEmailRow>;
  readonly failed: JobScan<JobEmailRow>;
}

/**
 * `waiting` is `pending` + `processing` — the same selection the outbox
 * processor's own scan uses, so "waiting" here means exactly what the job means
 * by it. `failed` rows are between states (the processor writes pending for
 * another try, or dead when tries run out) and are listed in case one sticks.
 */
export async function readJobsOutbox(limit: number = JOBS_SCAN_LIMIT): Promise<JobsOutboxSlices> {
  const [waiting, failed, dead] = await Promise.all([
    scanByStatus('outbox_waiting', 'outbox_events', ['pending', 'processing'], limit, toJobEventRow),
    scanByStatus('outbox_failed', 'outbox_events', 'failed', limit, toJobEventRow),
    scanByStatus('outbox_dead', 'outbox_events', 'dead', limit, toJobEventRow),
  ]);
  return { waiting, failed, dead };
}

export async function readJobsEmails(limit: number = JOBS_SCAN_LIMIT): Promise<JobsEmailSlices> {
  const [queued, failed] = await Promise.all([
    scanByStatus('emails_queued', 'emails', 'queued', limit, toJobEmailRow),
    scanByStatus('emails_failed', 'emails', 'failed', limit, toJobEmailRow),
  ]);
  return { queued, failed };
}
