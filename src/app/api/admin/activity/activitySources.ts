import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  planActivityQuery,
  type ActivityFilter,
} from '@/domains/admin/activityQuery';
import { isoOrNull } from '@/domains/booking/queries/adminBookingQuery';
import { logger } from '../../_lib/logger';

/**
 * Reading the activity log (`timelines`) out of Firestore.
 *
 * The plan's guarantee becomes a query here: at most one equality filter, always
 * ordered by `createdAt` descending, always bounded at `pageSize + 1` with a
 * cursor of the last row's timestamp and id. No full scan exists on this
 * collection from this route, and the cursor's id component is the tie-breaker
 * that keeps two rows written in the same millisecond from skipping or
 * repeating across page boundaries.
 */
export const UNREADABLE = 'Could not be read just now. Reload to try again.';

export interface ActivityEntry {
  readonly id: string;
  readonly event: string;
  readonly severity: string;
  readonly message: string;
  readonly actorType: string | null;
  readonly actorId: string | null;
  readonly correlationId: string | null;
  readonly bookingId: string | null;
  readonly paymentId: string | null;
  readonly emailId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAtIso: string | null;
}

export interface ActivityPageResult {
  readonly entries: readonly ActivityEntry[];
  readonly hasMore: boolean;
  readonly nextCursor: { readonly createdAtMs: number; readonly id: string } | null;
}

export type ActivityReadResult =
  | { readonly ok: true; readonly page: ActivityPageResult }
  | { readonly ok: false; readonly reason: string };

function requireDb() {
  if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
  return adminDb;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function toEntry(doc: { id: string; data: () => Record<string, unknown> }): ActivityEntry {
  const data = doc.data();
  const actor = (typeof data.actor === 'object' && data.actor !== null ? data.actor : {}) as Record<string, unknown>;
  const metadata =
    typeof data.metadata === 'object' && data.metadata !== null
      ? (data.metadata as Record<string, unknown>)
      : null;
  return {
    id: doc.id,
    event: str(data.event) ?? 'unknown',
    severity: str(data.severity) ?? 'info',
    message: str(data.message) ?? '',
    actorType: str(actor.type),
    actorId: str(actor.id),
    correlationId: str(data.correlationId),
    bookingId: str(data.bookingId),
    paymentId: str(data.paymentId),
    emailId: str(data.emailId),
    // The payload of a timeline row is operational context, not the booking
    // record — small, and it is what makes a row explicable.
    metadata,
    createdAtIso: isoOrNull(data.createdAt),
  };
}

function applyFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filter: ActivityFilter | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (!filter) return query;
  switch (filter.kind) {
    case 'correlationId':
      return query.where('correlationId', '==', filter.value);
    case 'bookingId':
      return query.where('bookingId', '==', filter.value);
    case 'severity':
      return query.where('severity', '==', filter.value);
    case 'event':
      return query.where('event', '==', filter.value);
    case 'actorType':
      return query.where('actor.type', '==', filter.value);
  }
}

export async function readActivityPage(params: {
  filter: ActivityFilter | null;
  pageSize: number;
  cursor: { createdAtMs: number; id: string } | null;
}): Promise<ActivityReadResult> {
  const { filter, pageSize, cursor } = params;
  try {
    let query = applyFilter(requireDb().collection('timelines'), filter)
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1);
    if (cursor) {
      query = query.startAfter(Timestamp.fromMillis(cursor.createdAtMs), cursor.id);
    }
    const snapshot = await query.get();
    const entries = snapshot.docs.slice(0, pageSize).map(toEntry);
    const hasMore = snapshot.size > pageSize;
    const last = entries[entries.length - 1];
    const lastMs = last?.createdAtIso ? Date.parse(last.createdAtIso) : NaN;
    return {
      ok: true,
      page: {
        entries,
        hasMore,
        nextCursor:
          hasMore && last && Number.isFinite(lastMs) ? { createdAtMs: lastMs, id: last.id } : null,
      },
    };
  } catch (error) {
    logger.error('SYSTEM', 'Admin activity page read failed', error, { filter: filter?.kind ?? null });
    return { ok: false, reason: UNREADABLE };
  }
}

export { planActivityQuery };
