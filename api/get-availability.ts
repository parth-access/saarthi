import { db } from './firebase-admin.js';

export default async function handler(req: any, res: any) {
  // Always return JSON
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { therapistId, date } = req.query;

  if (!therapistId || !date) {
    return res.status(400).json({ success: false, error: 'Therapist ID and date are required' });
  }

  console.log(`🔍 [API] Availability request: ID=${therapistId}, Date=${date}`);

  try {
    // Validate date
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date format' });
    }

    // 🔥 MATCH DB STRUCTURE (date-based)
    const snapshot = await db.collection('availability')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .get();

    if (snapshot.empty) {
      console.log(`ℹ️ [API] No availability found for this date.`);
      return res.status(200).json({ success: true, slots: [] });
    }

    const config = snapshot.docs[0].data();

    // ✅ USE STORED SLOTS DIRECTLY
    if (!Array.isArray(config.slots)) {
      console.log('⚠️ Invalid slots format in DB');
      return res.status(200).json({ success: true, slots: [] });
    }

    const allSlots: string[] = config.slots;

    // 🔒 Fetch existing bookings
    const bookingsSnapshot = await db.collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('status', 'in', ['confirmed', 'pending'])
      .get();

    const bookedTimes = new Set(
      bookingsSnapshot.docs.map(doc => doc.data().time)
    );

    // 🔐 Fetch active locks
    const now = new Date();
    const locksSnapshot = await db.collection('locks')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('expiresAt', '>', now)
      .get();

    const lockedTimes = new Set(
      locksSnapshot.docs.map(doc => doc.data().time)
    );

    // 🧠 Build final slots
    const availableSlots = allSlots.map((time: string) => ({
      time,
      isAvailable: !bookedTimes.has(time) && !lockedTimes.has(time),
      reason: bookedTimes.has(time)
        ? 'booked'
        : lockedTimes.has(time)
        ? 'locked'
        : null
    }));

    console.log(`✅ [API] Returned ${availableSlots.length} slots`);

    return res.status(200).json({
      success: true,
      slots: availableSlots
    });

  } catch (error: any) {
    console.error('❌ [API] Availability error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to process availability',
      details: error.message
    });
  }
}