import { NextRequest, NextResponse } from 'next/server';
import { GoogleCalendarService } from '@/services/googleCalendarService';
import { auditService } from '@/domains/audit/AuditService';
import { logger } from '@/app/api/_lib/logger';
import { requireAdmin } from '@/lib/auth/requireRole';
import { checkRateLimit, getClientIp } from '@/app/api/_lib/rateLimit';
import { isReadableBookingId } from '@/app/api/admin/bookings/[bookingId]/bookingIdGuard';

export const dynamic = 'force-dynamic';

/**
 * Retry creating a booking's Google Calendar event and Meet link.
 *
 * Response contract, in the outcome vocabulary the console's screen renders:
 *
 *  - `200 { success: true, outcome: 'created' | 'already_exists', meetingUrl }` —
 *    the event now exists (or already did). The confirmation email and reminder
 *    scheduling live inside the service and are idempotent: an email already
 *    recorded as sent is not sent again.
 *  - `409` — the booking is not in a state that can have a calendar event
 *    (authored service message passed through).
 *  - `404` — no such booking.
 *  - `500` with a fixed sentence — anything else, including every Google API
 *    error. The raw reason is already on the booking as `calendarError`, where
 *    the list screen reads it after a reload; echoing an upstream error string
 *    into a browser response is the leak this route used to have.
 */
const RETRY_FAILED =
  'The calendar retry did not succeed just now. The booking records what happened — reload the list to read it.';

export async function POST(req: NextRequest) {
  // Admin authorization flows through the CANONICAL source of truth: the
  // `users` collection role, re-read live on every request (via
  // verifySession). The previous Firebase custom-claims check here was a
  // second admin authority that could disagree with the users collection —
  // locking out provisioned admins when claims were absent, or keeping
  // stale claims alive after a role change.
  const authResult = await requireAdmin(req as unknown as Request);
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  // After auth, before work: only a verified admin consumes the bucket.
  const limit = checkRateLimit(getClientIp(req), 'admin_calendar_retry', 10, 60_000);
  if (!limit.success) {
    return NextResponse.json(
      { success: false, error: 'Too many calendar retries in a short time. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  let bookingId: unknown;
  try {
    const body = await req.json();
    bookingId = (body as { bookingId?: unknown } | null)?.bookingId;
  } catch {
    return NextResponse.json({ success: false, error: 'A JSON body with bookingId is required.' }, { status: 400 });
  }

  if (typeof bookingId !== 'string' || !bookingId || !isReadableBookingId(bookingId)) {
    return NextResponse.json(
      { success: false, error: 'bookingId is required and must be a readable booking id.' },
      { status: 400 }
    );
  }

  await auditService.logEvent(
    'CALENDAR_CREATION_RETRY',
    { bookingId, triggeredBy: session.uid },
    session.uid,
    bookingId
  );

  logger.info('ADMIN_CALENDAR', `Admin triggered retry calendar event for booking ${bookingId}`);

  const result = await GoogleCalendarService.createOrSyncCalendarEvent(bookingId);

  if (result.success) {
    return NextResponse.json({
      success: true,
      outcome: result.alreadyExists ? 'already_exists' : 'created',
      message:
        result.alreadyExists
          ? 'A Google Calendar event and Meet link already exist for this session.'
          : 'Google Calendar event & Meet conference successfully created.',
      meetingUrl: result.meetingUrl,
      calendarEventId: result.calendarEventId,
    });
  }

  // Authored precondition refusals from the service get their own statuses; the
  // booking-not-found sentence is the service's fixed string.
  if (result.error === 'Booking not found') {
    return NextResponse.json({ success: false, error: 'No booking exists with that id.' }, { status: 404 });
  }
  if (typeof result.error === 'string' && result.error.startsWith('Booking status is')) {
    return NextResponse.json({ success: false, error: result.error }, { status: 409 });
  }

  logger.error('ADMIN_CALENDAR', `Calendar retry failed for booking ${bookingId}`, {
    error: result.error ?? 'unspecified',
  });
  return NextResponse.json({ success: false, error: RETRY_FAILED }, { status: 500 });
}
