import { db } from './firebase-admin.js';
import { format, parse, addMinutes, isBefore, isSameDay } from 'date-fns';

/**
 * API Handler: Generate slots dynamically based on therapist rules
 * Path: /api/get-availability
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { therapistId, date } = req.query;

  if (!therapistId || !date) {
    return res.status(400).json({ success: false, error: 'Therapist ID and date are required' });
  }

  try {
    // 1. Determine day of week (0-6, 0 is Sunday)
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    // 2. Fetch availability rules for this therapist and day
    const rulesSnapshot = await db.collection('availability_rules')
      .where('therapistId', '==', therapistId)
      .where('dayOfWeek', '==', dayOfWeek)
      .get();

    if (rulesSnapshot.empty) {
      return res.status(200).json({ success: true, slots: [] });
    }

    // 3. Generate baseline slots from rules
    let allGeneratedSlots: string[] = [];
    
    rulesSnapshot.docs.forEach(doc => {
      const rule = doc.data();
      const { startTime, endTime, slotDuration } = rule;
      
      const start = parse(startTime, 'HH:mm', targetDate);
      const end = parse(endTime, 'HH:mm', targetDate);
      const duration = slotDuration || 60;

      let current = start;
      while (isBefore(current, end)) {
        allGeneratedSlots.push(format(current, 'HH:mm'));
        current = addMinutes(current, duration);
      }
    });

    // 4. Fetch existing bookings for this date
    const bookingsSnapshot = await db.collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('status', 'in', ['confirmed', 'pending'])
      .get();

    const bookedTimes = new Set(bookingsSnapshot.docs.map(doc => doc.data().time));

    // 5. Fetch active locks
    const now = new Date();
    const locksSnapshot = await db.collection('locks')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('expiresAt', '>', now)
      .get();

    const lockedTimes = new Set(locksSnapshot.docs.map(doc => doc.data().time));

    // 6. Filter and format slots
    const finalSlots = allGeneratedSlots.map(time => {
      const isBooked = bookedTimes.has(time);
      const isLocked = lockedTimes.has(time);
      
      return {
        time,
        isAvailable: !isBooked && !isLocked,
        reason: isBooked ? 'booked' : isLocked ? 'locked' : null
      };
    });

    return res.status(200).json({
      success: true,
      slots: finalSlots
    });

  } catch (error: any) {
    console.error('❌ [API] Availability Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process availability.' });
  }
}
