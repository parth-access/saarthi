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
    // Check if literally already booked
    const bookingCheck = await db.collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('time', '==', time)
      .where('status', 'in', ['confirmed', 'pending'])
      .get();

    if (!bookingCheck.empty) {
      return res.status(409).json({ success: false, error: 'Slot already booked' });
    }

    // Check if already locked by someone else
    const now = new Date();
    const lockCheck = await db.collection('locks')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('time', '==', time)
      .where('expiresAt', '>', now)
      .get();

    if (!lockCheck.empty) {
      return res.status(409).json({ success: false, error: 'Slot is temporarily locked by another user' });
    }

    // Create new lock
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes
    const lockRef = await db.collection('locks').add({
      therapistId,
      date,
      time,
      expiresAt
    });

    return res.status(200).json({ success: true, lockId: lockRef.id });
  } catch (error: any) {
    console.error('❌ Error locking slot:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
