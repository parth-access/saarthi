import { db } from './firebase-admin.js';
import { parseISO, getDay, format, addMinutes, isBefore, parse } from 'date-fns';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { therapistId, date } = req.query;

  if (!therapistId || !date) {
    return res.status(400).json({ success: false, error: 'Therapist ID and Date are required' });
  }

  try {
    const selectedDate = parseISO(date);
    const dayOfWeek = getDay(selectedDate);

    // 1. Get weekly availability rules for this therapist and day
    const availabilitySnapshot = await db.collection('availability')
      .where('therapistId', '==', therapistId)
      .where('dayOfWeek', '==', dayOfWeek)
      .get();

    if (availabilitySnapshot.empty) {
      return res.status(200).json({ success: true, slots: [] });
    }

    const config = availabilitySnapshot.docs[0].data();
    const { startTime, endTime, slotDuration = 60 } = config;

    // 2. Generate all possible slots
    const slots: string[] = [];
    let current = parse(startTime, 'HH:mm', selectedDate);
    const end = parse(endTime, 'HH:mm', selectedDate);

    while (isBefore(current, end)) {
      slots.push(format(current, 'hh:mm a'));
      current = addMinutes(current, slotDuration);
    }

    // 3. Get existing bookings for this therapist and date
    const bookingsSnapshot = await db.collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('status', 'in', ['confirmed', 'pending'])
      .get();

    const bookedTimes = new Set(bookingsSnapshot.docs.map(doc => doc.data().time));

    // 4. Get active locks
    const now = new Date();
    const locksSnapshot = await db.collection('locks')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('expiresAt', '>', now)
      .get();

    const lockedTimes = new Set(locksSnapshot.docs.map(doc => doc.data().time));

    // 5. Filter availability
    const availableSlots = slots.map(time => ({
      time,
      isAvailable: !bookedTimes.has(time) && !lockedTimes.has(time),
      reason: bookedTimes.has(time) ? 'booked' : lockedTimes.has(time) ? 'locked' : null
    }));

    return res.status(200).json({ 
      success: true, 
      slots: availableSlots
    });
  } catch (error: any) {
    console.error('❌ Error fetching availability:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
