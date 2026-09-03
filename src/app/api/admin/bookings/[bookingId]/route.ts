import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { readBookingAuditTrail } from '@/domains/audit/BookingAuditTrail';
import {
  mergeAdminTimeline,
  permittedAdminActions,
  toAdminBookingDetail,
} from '@/domains/booking/queries/adminBookingDetail';
import { logger } from '../../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * A Firestore document id, and nothing that could be read as a path.
 *
 * `collection('bookings').doc(value)` treats `/` as a path separator, so an
 * id of `a/b/c` would read `bookings/a/b/c` — a document in a subcollection of a
 * different booking. The caller is already an authenticated admin, so this is not
 * a privilege boundary, but a projection built for booking documents should not
 * be handed an arbitrary one.
 *
 * Deliberately not `bk_*`: ids come from `IdGenerator.booking()` today, and older
 * bookings carry other shapes. This constrains the character set, not the format.
 */
const BOOKING_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Firestore reserves ids of the form `__…__` and throws on them rather than
 * returning an empty document, which would surface as a generic 500 instead of
 * the 400 this actually is.
 */
const RESERVED_ID = /^__.*__$/;

function isReadableBookingId(value: string): boolean {
  return BOOKING_ID.test(value) && !RESERVED_ID.test(value);
}

/** What the browser is told when the real reason must stay in the server log. */
const GENERIC_DETAIL_ERROR = 'We could not load this booking right now. Please try again.';

/**
 * One booking, everything recorded about it, and what may be done to it.
 *
 * This is the screen the rest of the console links to, so it answers three
 * questions in one round trip rather than making the browser assemble them:
 *
 *  - **what this booking is** — `toAdminBookingDetail`, which withholds the
 *    manage-booking token and the client's note by design (see that module).
 *  - **how it got that way** — both audit collections merged, newest first.
 *    Nothing here is inferred: an event appears because it was recorded.
 *  - **what can be done now** — `permittedAdminActions`, which is a *display*
 *    decision. Every rule it applies is enforced again by the command handlers
 *    when an action is actually submitted. Nothing is authorized by being listed
 *    here and nothing is forbidden by being absent.
 *
 * The audit read degrades on its own: if it fails, the booking still renders and
 * `timeline.gaps` says which half is missing. A history that cannot load is not a
 * reason to deny an operator the booking they came to act on.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ bookingId: string }> }
) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  const { bookingId } = await context.params;

  if (!isReadableBookingId(bookingId)) {
    // Not 404: this is a malformed request, and saying so stops an operator
    // concluding a booking they can see in a list has been deleted.
    return NextResponse.json({ success: false, error: 'That is not a valid booking id.' }, { status: 400 });
  }

  try {
    const booking = await firestoreBookingRepository.findById(bookingId);
    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'No booking exists with that id.' },
        { status: 404 }
      );
    }

    const trail = await readBookingAuditTrail(bookingId);

    return NextResponse.json(
      {
        success: true,
        booking: toAdminBookingDetail(booking),
        timeline: {
          entries: mergeAdminTimeline(trail.bookingScoped, trail.systemScoped),
          gaps: trail.gaps,
          truncated: trail.truncated,
        },
        actions: permittedAdminActions(booking.status, booking.paymentStatus ?? null),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    // Firestore errors name the project and, for a missing index, carry a console
    // URL. They belong in the server log and nowhere near the browser.
    logger.error('BOOKING', 'Admin booking detail read failed', error, { bookingId });
    return NextResponse.json({ success: false, error: GENERIC_DETAIL_ERROR }, { status: 500 });
  }
}
