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
    const lockedTimes: string[] = [];
    const locksToDelete: string[] = [];

    lockedSlotsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      let isExpired = false;
      
      if (data?.expiresAt && typeof data.expiresAt.toDate === 'function' && data.expiresAt.toDate() < new Date()) {
        isExpired = true;
      } else if (data?.expiresAt && typeof data.expiresAt.toMillis === 'function' && data.expiresAt.toMillis() < Date.now()) {
        isExpired = true;
      } else if (data?.expiresAt && typeof data.expiresAt === 'number' && data.expiresAt < Date.now()) {
        isExpired = true;
      }
      
      if (isExpired) {
        locksToDelete.push(doc.id);
      } else {
        lockedTimes.push(data.time);
      }
    });

    // Cleanup stale locks in the background
    if (locksToDelete.length > 0) {
      Promise.all(locksToDelete.map(id => adminDb.collection('locked_slots').doc(id).delete())).catch(err => {
         console.error("Failed background cleanup of locked_slots", err);
      });
    }

    return NextResponse.json({ bookedTimes, lockedTimes });
  } catch (error: any) {
    console.error('Error fetching availability:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
