import { db } from './firebase-admin.js';

/**
 * Helper: Generates time slots between startTime and endTime
 */
function generateDynamicSlots(startTime: string, endTime: string, duration: number): string[] {
  const slots: string[] = [];
  
  const parseToMinutes = (time: string | undefined) => {
    if (!time || typeof time !== 'string' || !time.includes(':')) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return 0;
    return hours * 60 + minutes;
  };

  const formatFromMinutes = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  let start = parseToMinutes(startTime);
  const end = parseToMinutes(endTime);

  if (start >= end || duration <= 0) return [];

  while (start + duration <= end) {
    slots.push(formatFromMinutes(start));
    start += duration;
  }

  return slots;
}

export default async function handler(req: any, res: any) {
  // Always set content-type to JSON to prevent HTML hijacking
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
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date format' });
    }
    
    // getDay() returns 0 (Sun) to 6 (Sat)
    const dayOfWeek = dateObj.getDay();
    console.log(`📅 [API] Computed dayOfWeek: ${dayOfWeek}`);

    // Query availability
    const snapshot = await db.collection('availability')
      .where('therapistId', '==', therapistId)
      .where('dayOfWeek', '==', dayOfWeek)
      .get();

    if (snapshot.empty) {
      console.log(`ℹ️ [API] No availability rules found for day ${dayOfWeek}.`);
      return res.status(200).json({ success: true, slots: [] });
    }

    const config = snapshot.docs[0].data();
    const { startTime, endTime, slotDuration = 60 } = config;
    
    // Generate all base slots
    const allSlots = generateDynamicSlots(startTime, endTime, slotDuration);

    // Fetch existing bookings to filter
    const bookingsSnapshot = await db.collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('status', 'in', ['confirmed', 'pending'])
      .get();

    const bookedTimes = new Set(bookingsSnapshot.docs.map(doc => doc.data().time));

    // Fetch active locks
    const now = new Date();
    const locksSnapshot = await db.collection('locks')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('expiresAt', '>', now)
      .get();

    const lockedTimes = new Set(locksSnapshot.docs.map(doc => doc.data().time));

    // Build final slots array
    const availableSlots = allSlots.map(time => ({
      time,
      isAvailable: !bookedTimes.has(time) && !lockedTimes.has(time),
      reason: bookedTimes.has(time) ? 'booked' : lockedTimes.has(time) ? 'locked' : null
    }));

    console.log(`✅ [API] Success: Returned ${availableSlots.length} potential slots.`);

    return res.status(200).json({ 
      success: true, 
      slots: availableSlots 
    });
  } catch (error: any) {
    console.error('❌ [API] Availability error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to process availability.',
      details: error.message 
    });
  }
}
