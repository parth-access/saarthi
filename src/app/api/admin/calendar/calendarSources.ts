import { adminDb } from '@/lib/firebase/admin';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { toAdminBookingRow } from '@/domains/booking/queries/adminBookingQuery';
import {
  isConfigurationError,
  type CalendarProblemRow,
  type CalendarProblemScan,
} from '@/domains/admin/calendarTriage';
import { logger } from '../../_lib/logger';

/**
 * Reading the Calendar & Meet screen's list out of Firestore.
 *
 * One rule from the overview applies unchanged: the screen's one scan fails alone
 * and reports the failure as data — never as an empty list, which would read as
 * "every session has its Meet link" on the one screen whose job is to find the
 * sessions that do not.
 *
 * The rows come from the repository's own scan rather than a fresh query, so the
 * set an operator sees is exactly the set `/api/cron/retry-calendar` will act on —
 * the same guarantee the overview's missing-meet-link count makes.
 */
export const CALENDAR_SCAN_LIMIT = 60;

const UNREADABLE = 'Could not be read just now. Reload to try again.';

export async function readCalendarProblems(
  limit: number = CALENDAR_SCAN_LIMIT
): Promise<CalendarProblemScan> {
  try {
    const { bookings, scanFilled } =
      await firestoreBookingRepository.scanBookingsNeedingCalendarRetry(limit + 1);

    const rows: CalendarProblemRow[] = bookings.slice(0, limit).map((booking) => {
      const base = toAdminBookingRow(booking);
      const error =
        typeof (booking as { calendarError?: unknown }).calendarError === 'string'
          ? ((booking as { calendarError: string }).calendarError || null)
          : null;
      return {
        ...base,
        // Every row here is missing its Meet link by the scan's own predicate;
        // the flag would always be false, so the error text is what carries
        // information.
        calendarError: error,
        hasCalendarEventId: Boolean((booking as { googleCalendarEventId?: unknown }).googleCalendarEventId),
      };
    });

    return { ok: true, rows, atLeast: scanFilled || bookings.length > limit };
  } catch (error) {
    // A Firestore failure here can carry the project id and an index-creation
    // URL; that goes to the server log only.
    logger.error('SYSTEM', 'Admin calendar problems scan failed', error);
    return { ok: false, reason: UNREADABLE };
  }
}

/** Re-exported so the screen's copy can distinguish the one unretryable error. */
export { isConfigurationError };
