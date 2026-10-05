import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/verifySession';
import { adminDb } from '@/lib/firebase/admin';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { isReadableBookingId } from '@/app/api/admin/bookings/[bookingId]/bookingIdGuard';
import { logger } from '../../_lib/logger';
import type { Booking } from '@/domains/booking/entities/Booking';

export const dynamic = 'force-dynamic';

/**
 * One booking for its assigned therapist (or an admin).
 *
 * Same canonical `findById` as every other booking read — one booking system.
 * The authorization model is the platform's standard one: `bookings.therapistId`
 * must be the therapist document whose `authId` equals the caller's uid. A
 * non-assigned therapist and a missing booking are the same 404, so the endpoint
 * cannot be used to probe whether someone else's booking id exists.
 *
 * The projection withholds operator-only fields (manage-token state, internal
 * error strings, decline attribution) that the admin console deliberately shows
 * but a therapist's session view does not need. Private session notes are NOT
 * here by design — they are fetched only through the therapist-only notes
 * endpoint; this payload carries only the boolean `hasSessionNotes` pointer.
 */
const GENERIC_ERROR = 'We could not load this booking right now. Please try again.';

/** Fields that belong to operator tooling, not to a therapist's session view. */
const ADMIN_ONLY_FIELDS: readonly string[] = [
  'bookingToken',
  'invalidToken',
  'declinedBy',
  'lastEmailError',
  'calendarError',
  'reminderError',
  'reminderSlotKey',
];

function toTherapistBookingDetail(booking: Booking): Record<string, unknown> {
  const source = booking as unknown as Record<string, unknown>;
  const detail: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (!ADMIN_ONLY_FIELDS.includes(key)) {
      detail[key] = source[key];
    }
  }
  return detail;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ bookingId: string }> }
) {
  const session = await verifySession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
  }
  if (session.role !== 'therapist' && session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Not authorized.' }, { status: 403 });
  }

  const { bookingId } = await context.params;

  if (!isReadableBookingId(bookingId)) {
    return NextResponse.json({ success: false, error: 'That is not a valid booking id.' }, { status: 400 });
  }

  try {
    const booking = await firestoreBookingRepository.findById(bookingId);

    if (!booking) {
      return NextResponse.json({ success: false, error: 'No booking exists with that id.' }, { status: 404 });
    }

    if (session.role !== 'admin') {
      const therapistSnap = await adminDb
        .collection('therapists')
        .where('authId', '==', session.uid)
        .limit(1)
        .get();
      if (therapistSnap.empty || therapistSnap.docs[0].id !== booking.therapistId) {
        // Same 404 as "does not exist" — no existence oracle for other therapists' bookings.
        return NextResponse.json({ success: false, error: 'No booking exists with that id.' }, { status: 404 });
      }
    }

    return NextResponse.json(
      { success: true, booking: toTherapistBookingDetail(booking) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    logger.error('THERAPIST_AUTH', 'Therapist booking detail read failed', error, { bookingId });
    return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 500 });
  }
}
