import { adminDb } from '@/lib/firebase/admin';
import { logger } from '@/shared/logger';
import type { AdminTimelineDocument } from '@/domains/booking/queries/adminBookingDetail';

/**
 * Reads what actually happened to one booking.
 *
 * Two collections record it and neither is complete on its own:
 *
 *  - `bookings/{id}/audit_logs` — status changes, reschedules, payment-link
 *    sends. Written by `AuditListener`, `AdminConfirmBookingCommand`,
 *    `RescheduleBookingCommand`, `StartPaymentCommand`,
 *    `GeneratePaymentLinkCommand`.
 *  - top-level `audit_logs` filtered by `bookingId` — slot holds and releases,
 *    payment success and failure, refund decisions, the `REFUND_REQUIRED`
 *    double-booking marker. Written by `ConfirmBookingCommand`,
 *    `FailPaymentCommand`, `CancelBookingCommand`, `CreateBookingCommand`,
 *    `SlotReservationService`, `RefundService`.
 *
 * Both have been written on every booking path since the beginning and **read by
 * nothing until now**. That is the whole reason this reader exists: the history
 * is already there, and an operator has had no way to see it.
 *
 * `AuditService.logEvent` is a third writer in name only — the exported
 * `auditService` singleton is constructed with no repository ("Global instance
 * without repository for Phase 1"), so those calls reach the application log and
 * nothing durable. Nothing is missed by not reading them.
 */

/**
 * Neither query carries an `orderBy`, so neither needs a composite index and the
 * timeline works against the deployed index set as it stands today. Ordering is
 * done in memory by `mergeAdminTimeline`.
 *
 * The cost of that choice is stated rather than hidden: if a booking ever
 * exceeded this many recorded events, the set returned is *some* of them, not
 * necessarily the most recent, and `truncated` says so. In exchange, an entry
 * whose `timestamp` is unreadable is still returned — an `orderBy` would drop it
 * from the trail silently, which is the worse failure for an audit view.
 *
 * Real bookings record well under 30 events across both collections. If that ever
 * stops being true, the upgrade is a `(bookingId ASC, timestamp DESC)` composite
 * index on `audit_logs` plus an `orderBy` here.
 */
export const TIMELINE_READ_LIMIT = 200;

/** Which halves of the trail could not be read. */
export type TimelineGap = 'booking' | 'system';

export interface BookingAuditTrail {
  readonly bookingScoped: readonly AdminTimelineDocument[];
  readonly systemScoped: readonly AdminTimelineDocument[];
  /**
   * Reads that failed. A partial trail is shown with this stated, because an
   * operator seeing four events needs to know whether that is the whole history
   * or the half of it that loaded.
   */
  readonly gaps: readonly TimelineGap[];
  /** A read came back full, so events may exist that are not in this set. */
  readonly truncated: boolean;
}

function toDocuments(
  snapshot: { docs: { id: string; data(): unknown }[] } | null
): AdminTimelineDocument[] {
  if (!snapshot) return [];
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    data: (doc.data() ?? {}) as Record<string, unknown>,
  }));
}

/**
 * Both reads are issued together and each is allowed to fail on its own.
 *
 * A booking's history is supporting context, not the reason the page exists: if
 * the audit read fails, an operator should still get the booking and still be
 * able to act on it. So a failure here degrades to a stated gap and never
 * propagates.
 */
export async function readBookingAuditTrail(bookingId: string): Promise<BookingAuditTrail> {
  if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
  const db = adminDb;

  const [bookingScoped, systemScoped] = await Promise.all([
    db
      .collection('bookings')
      .doc(bookingId)
      .collection('audit_logs')
      .limit(TIMELINE_READ_LIMIT)
      .get()
      .catch((error: unknown) => {
        logger.error(`Booking audit subcollection read failed for ${bookingId}`, { error });
        return null;
      }),
    db
      .collection('audit_logs')
      .where('bookingId', '==', bookingId)
      .limit(TIMELINE_READ_LIMIT)
      .get()
      .catch((error: unknown) => {
        logger.error(`System audit read failed for booking ${bookingId}`, { error });
        return null;
      }),
  ]);

  const gaps: TimelineGap[] = [];
  if (bookingScoped === null) gaps.push('booking');
  if (systemScoped === null) gaps.push('system');

  const bookingDocs = toDocuments(bookingScoped);
  const systemDocs = toDocuments(systemScoped);

  return {
    bookingScoped: bookingDocs,
    systemScoped: systemDocs,
    gaps,
    truncated:
      bookingDocs.length >= TIMELINE_READ_LIMIT || systemDocs.length >= TIMELINE_READ_LIMIT,
  };
}
