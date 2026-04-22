import { db } from './firebase-admin.js';

export default async function handler(req: any, res: any) {
  // Enforce JSON content type
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { therapistId, date, time } = req.body;

  if (!therapistId || !date || !time) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  console.log(`🔒 [API] Locking slot: ${therapistId} / ${date} / ${time}`);

  try {
    let newLockId = '';

    // ⚡ TRANSACTIONAL LOCKING
    await db.runTransaction(async (transaction) => {
      // 1. Check for existing bookings
      const bookingQuery = db.collection('bookings')
        .where('therapistId', '==', therapistId)
        .where('date', '==', date)
        .where('time', '==', time)
        .where('status', 'in', ['confirmed', 'pending']);
      
      const bookingDocs = await transaction.get(bookingQuery);
      if (!bookingDocs.empty) {
        throw new Error('ALREADY_BOOKED');
      }

      // 2. Check for active locks
      const now = new Date();
      const lockQuery = db.collection('locks')
        .where('therapistId', '==', therapistId)
        .where('date', '==', date)
        .where('time', '==', time)
        .where('expiresAt', '>', now);
      
      const lockDocs = await transaction.get(lockQuery);
      if (!lockDocs.empty) {
        throw new Error('ALREADY_LOCKED');
      }

      // 3. Create the lock
      const lockRef = db.collection('locks').doc();
      newLockId = lockRef.id;
      
      transaction.set(lockRef, {
        therapistId,
        date,
        time,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000) // 5 minutes
      });
    });

    return res.status(200).json({ success: true, lockId: newLockId });

  } catch (error: any) {
    if (error.message === 'ALREADY_BOOKED') {
      return res.status(409).json({ success: false, error: 'This slot was just booked.' });
    }
    if (error.message === 'ALREADY_LOCKED') {
      return res.status(409).json({ success: false, error: 'Someone else is currently filling out details for this slot.' });
    }
    console.error('❌ Error locking slot:', error);
    return res.status(500).json({ success: false, error: 'Failed to reserve slot. Please try again.' });
  }
}
