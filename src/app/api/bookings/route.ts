import { NextResponse } from 'next/server';
import { BookingService } from '@/server/services/BookingService';
import { verifySession } from '@/lib/auth/verifySession';
import { adminDb } from '@/lib/firebase/admin';
import { logger } from '@/app/api/_lib/logger';

const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(req: Request) {
  try {
    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Check if therapist or admin
    if (session.role === 'admin') {
      const bookings = await BookingService.getBookings();
      return NextResponse.json(bookings, { headers: PRIVATE_NO_STORE });
    } else if (session.role === 'therapist') {
      // Bookings reference the therapist *document* id, not the Firebase Auth uid.
      // Looking them up by `session.uid` silently returns an empty dashboard for
      // every therapist whose profile id differs from their auth id.
      const therapistSnapshot = await adminDb
        .collection('therapists')
        .where('authId', '==', session.uid)
        .limit(1)
        .get();

      if (therapistSnapshot.empty) {
        return NextResponse.json(
          { error: 'Therapist profile not found.' },
          { status: 403, headers: PRIVATE_NO_STORE }
        );
      }

      const bookings = await BookingService.getBookingsByTherapist(therapistSnapshot.docs[0].id);
      return NextResponse.json(bookings, { headers: PRIVATE_NO_STORE });
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch (error: unknown) {
    logger.error('BOOKING', 'Could not read bookings for authenticated workspace', error);
    return NextResponse.json(
      { error: 'Bookings could not be loaded just now. Please try again.' },
      { status: 500, headers: PRIVATE_NO_STORE }
    );
  }
}
