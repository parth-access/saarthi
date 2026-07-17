import { NextRequest, NextResponse } from 'next/server';
import { BookingService } from '@/server/services/BookingService';
import { adminAuth } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    
    // Check if therapist or admin
    if (decodedToken.role === 'admin') {
      const bookings = await BookingService.getBookings();
      return NextResponse.json(bookings);
    } else if (decodedToken.role === 'therapist') {
      const bookings = await BookingService.getBookingsByTherapist(decodedToken.uid);
      return NextResponse.json(bookings);
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
