import { adminDb } from '@/lib/firebase/admin';

export class BookingRepository {
  static async lockSlot(therapistId: string, date: string, time: string, lockId: string, expiresAt: Date) {
    const slotId = `${therapistId}_${date}_${time}`.replace(/\//g, '-');
    const slotRef = adminDb.collection('locked_slots').doc(slotId);
    
    await adminDb.runTransaction(async (t) => {
      const doc = await t.get(slotRef);
      if (doc.exists) {
        const data = doc.data();
        if (data?.expiresAt && data.expiresAt.toDate() < new Date()) {
           // Expired, we can overwrite
        } else if (data?.bookingId) {
          throw new Error('This slot is already booked.');
        } else if (data?.lockId && data.lockId !== lockId) {
          throw new Error('This slot is currently locked by another user.');
        }
      }
      t.set(slotRef, { therapistId, date, time, lockId, expiresAt });
    });
  }

  static async findBookingById(bookingId: string) {
    const doc = await adminDb.collection('bookings').doc(bookingId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }
}
