import { NextRequest, NextResponse } from 'next/server';
import { BookingService } from '@/server/services/BookingService';
import { verifySession } from '@/lib/auth/verifySession';

export async function GET(req: NextRequest) {
  try {
    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Check if therapist or admin
    if (session.role === 'admin') {
      const bookings = await BookingService.getBookings();
      return NextResponse.json(bookings);
    } else if (session.role === 'therapist') {
      const bookings = await BookingService.getBookingsByTherapist(session.uid);
      return NextResponse.json(bookings);
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
