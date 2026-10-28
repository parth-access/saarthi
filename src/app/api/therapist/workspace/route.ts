import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifySession } from '@/lib/auth/verifySession';
import { BookingService } from '@/server/services/BookingService';
import { mapTherapist } from '@/utils/mappers';
import { logger } from '@/app/api/_lib/logger';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' };

function withoutManageToken<T extends object>(booking: T): Omit<T, 'bookingToken' | 'invalidToken'> {
  const rest = { ...booking } as Record<string, unknown>;
  delete rest.bookingToken;
  delete rest.invalidToken;
  return rest as Omit<T, 'bookingToken' | 'invalidToken'>;
}

/**
 * Everything the therapist workspace opens with, in one request: the signed-in
 * therapist's own profile and their bookings.
 *
 * The workspace used to read the profile from Firestore in the browser (which
 * shipped the Firestore SDK to every therapist page) and only then ask
 * /api/bookings for the bookings, one round trip after the other. The profile
 * is found by the session's uid, never by a parameter, so a therapist can only
 * ever read their own.
 *
 * The manage token is the client's bearer credential for /api/manage-booking;
 * a therapist holding it could reschedule the client's session, so it never
 * leaves the server.
 */
export async function GET(req: Request) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'therapist') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: PRIVATE_NO_STORE });
  }

  try {
    const found = await adminDb.collection('therapists').where('authId', '==', session.uid).limit(1).get();
    if (found.empty) {
      return NextResponse.json({ therapist: null, bookings: [] }, { headers: PRIVATE_NO_STORE });
    }
    const doc = found.docs[0];
    const bookings = await BookingService.getBookingsByTherapist(doc.id);
    return NextResponse.json(
      {
        therapist: mapTherapist(doc.id, doc.data()),
        bookings: bookings.map(withoutManageToken),
      },
      { headers: PRIVATE_NO_STORE }
    );
  } catch (error: unknown) {
    logger.error('BOOKING', 'Could not read the therapist workspace', error);
    return NextResponse.json(
      { error: 'Your workspace could not be loaded just now. Please try again.' },
      { status: 500, headers: PRIVATE_NO_STORE }
    );
  }
}
