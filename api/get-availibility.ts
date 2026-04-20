import { db } from './firebase-admin.js';

/**
 * Helper: Generates time slots between startTime and endTime
 * @param startTime string "HH:mm"
 * @param endTime string "HH:mm"
 * @param duration number in minutes
 * @returns string[] array of "hh:mm a" slots
 */
function generateDynamicSlots(startTime: string, endTime: string, duration: number): string[] {
  const slots: string[] = [];
  
  // Parse HH:mm to total minutes
  const parseToMinutes = (time: string | undefined) => {
    if (!time || typeof time !== 'string' || !time.includes(':')) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return 0;
    return hours * 60 + minutes;
  };

  // Format total minutes back to "HH:mm" (e.g. 10:00)
  const formatFromMinutes = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  let start = parseToMinutes(startTime);
  const end = parseToMinutes(endTime);

  while (start + duration <= end) {
    slots.push(formatFromMinutes(start));
    start += duration;
  }

  return slots;
}

export default async function handler(req: any, res: any) {
  // 1. Method check
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { therapistId, date } = req.query;

  // 2. Validation
  if (!therapistId || !date) {
    console.error('❌ Missing params:', { therapistId, date });
    return res.status(400).json({ success: false, error: 'Therapist ID and date are required' });
  }

  console.log(`🔍 Fetching availability for Therapist: ${therapistId}, Date: ${date}`);

  try {
    // 3. Compute dayOfWeek (0-6)
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date format provided' });
    }
    const dayOfWeek = dateObj.getDay();
    console.log(`📅 Computed dayOfWeek: ${dayOfWeek}`);

    // 4. Query therapist availability range
    const snapshot = await db.collection('availability')
      .where('therapistId', '==', therapistId)
      .where('dayOfWeek', '==', dayOfWeek)
      .get();

    if (snapshot.empty) {
      console.log('ℹ️ No availability range found for this day.');
      return res.status(200).json({ success: true, slots: [] });
    }

    const config = snapshot.docs[0].data();
    const { startTime, endTime, slotDuration = 60 } = config;
    
    console.log(`⏱️ Range found: ${startTime} - ${endTime} (Duration: ${slotDuration}m)`);

    // 5. Generate potential slots
    const allSlots = generateDynamicSlots(startTime, endTime, slotDuration);

    // 6. Check existing bookings
    const bookingsSnapshot = await db.collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('status', 'in', ['confirmed', 'pending'])
      .get();

    const bookedTimes = new Set(bookingsSnapshot.docs.map(doc => doc.data().time));

    // 7. Check active locks (5-min temporary holds)
    const now = new Date();
    const locksSnapshot = await db.collection('locks')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('expiresAt', '>', now)
      .get();

    const lockedTimes = new Set(locksSnapshot.docs.map(doc => doc.data().time));

    // 8. Transform to format expected by frontend (with metadata)
    // Note: We return objects to allow the UI to disable booked/locked slots
    const finalSlots = allSlots.map(time => ({
      time,
      isAvailable: !bookedTimes.has(time) && !lockedTimes.has(time),
      reason: bookedTimes.has(time) ? 'booked' : lockedTimes.has(time) ? 'locked' : null
    }));

    console.log(`✅ Returned ${finalSlots.length} potential slots.`);

    return res.status(200).json({ 
      success: true, 
      slots: finalSlots 
    });
  } catch (error: any) {
    console.error('❌ Availability Pipeline Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error while computing availability',
      details: error.message 
    });
  }
}
