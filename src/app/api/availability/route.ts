import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const therapistId = searchParams.get('therapistId');
    const date = searchParams.get('date');

    if (!therapistId || !date) {
      return NextResponse.json(
        { error: 'therapistId and date are required' },
        { status: 400 }
      );
    }

    // Fetch bookings for the therapist and date
    const bookingsPromise = adminDb
      .collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('status', 'in', ['pending', 'pending_approval', 'awaiting_payment', 'confirmed'])
      .get();

    // Fetch locked slots for the therapist and date
    const lockedSlotsPromise = adminDb
      .collection('locked_slots')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .get();

    const [bookingsSnapshot, lockedSlotsSnapshot] = await Promise.all([
      bookingsPromise,
      lockedSlotsPromise
    ]);

    const bookedTimes = bookingsSnapshot.docs.map((doc) => doc.data().time);

    const now = Date.now();
    const lockedTimes = lockedSlotsSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        const expiresAt = data.expiresAt;
        const isExpired = (expiresAt && typeof expiresAt.toMillis === 'function' && now >= expiresAt.toMillis()) || (expiresAt && typeof expiresAt === 'number' && now >= expiresAt);
        return { time: data.time, isExpired };
      })
      .filter((slot) => !slot.isExpired)
      .map((slot) => slot.time);

    return NextResponse.json({ bookedTimes, lockedTimes });
  } catch (error: any) {
    console.error('Error fetching availability:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
