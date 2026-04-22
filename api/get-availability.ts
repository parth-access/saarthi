import { db } from './firebase-admin.js';

/**
 * Helper: Generates time slots between startTime and endTime
 */
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

  console.log(`🔍 [API] Incoming availability request: therapistId=${therapistId}, rawDate=${date}`);

  try {
    // 1. Normalize date to YYYY-MM-DD reliably
    const normalizedDate = new Date(date).toISOString().split('T')[0];
    console.log(`📅 [API] Normalized date for query: ${normalizedDate}`);

    // 2. Query Firestore for the specific date
    const availabilitySnapshot = await db.collection('availability')
      .where('therapistId', '==', therapistId)
      .where('date', '==', normalizedDate)
      .get();

    // Debugging: Fallback check if specific query fails
    if (availabilitySnapshot.empty) {
      console.log(`ℹ️ [API] No direct match for therapistId ${therapistId} on date ${normalizedDate}.`);
      
      const debugSnapshot = await db.collection('availability')
        .where('therapistId', '==', therapistId)
        .limit(5)
        .get();
      
      if (debugSnapshot.empty) {
        console.log(`❌ [API] DEBUG: No availability documents found for therapistId ${therapistId} at all.`);
      } else {
        console.log(`📝 [API] DEBUG: Found ${debugSnapshot.size} availability docs for this therapist. Examples:`);
        debugSnapshot.docs.forEach(doc => {
          console.log(`   - ID: ${doc.id}, storedDate: ${doc.data().date}`);
        });
      }
      
      return res.status(200).json({ success: true, slots: [] });
    }

    const availDoc = availabilitySnapshot.docs[0].data();
    let rawSlots = availDoc.slots;

    // 3. Robust Slot Parsing: Handle arrays or comma-separated strings
    let processedSlots: string[] = [];
    if (Array.isArray(rawSlots)) {
      // If index 0 is a comma string like "10:00, 11:00", split it
      if (rawSlots.length === 1 && typeof rawSlots[0] === 'string' && rawSlots[0].includes(',')) {
        processedSlots = rawSlots[0].split(',').map(s => s.trim());
      } else {
        processedSlots = rawSlots;
      }
    } else if (typeof rawSlots === 'string') {
      // If for some reason 'slots' was saved as a single string field
      processedSlots = rawSlots.split(',').map(s => s.trim());
    }

    if (processedSlots.length === 0) {
      console.error(`❌ [API] Data integrity error: 'slots' field is empty or not in a valid format for therapist ${therapistId}`);
      return res.status(500).json({ success: false, error: 'Internal data error: availability slots missing' });
    }

    console.log(`📦 [API] Found ${processedSlots.length} processed slots for this date.`);

    // 4. Fetch existing bookings
    const bookingsSnapshot = await db.collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', normalizedDate)
      .where('status', 'in', ['confirmed', 'pending'])
      .get();

    const bookedTimes = new Set(bookingsSnapshot.docs.map(doc => doc.data().time));

    // 5. Fetch active locks
    const now = new Date();
    const locksSnapshot = await db.collection('locks')
      .where('therapistId', '==', therapistId)
      .where('date', '==', normalizedDate)
      .where('expiresAt', '>', now)
      .get();

    const lockedTimes = new Set(locksSnapshot.docs.map(doc => doc.data().time));

    // 6. Build the final response
    const formattedSlots = processedSlots.map((time: string) => {
      const isBooked = bookedTimes.has(time);
      const isLocked = lockedTimes.has(time);
      
      return {
        time,
        isAvailable: !isBooked && !isLocked,
        reason: isBooked ? 'booked' : isLocked ? 'locked' : null
      };
    });

    console.log(`✅ [API] Returning ${formattedSlots.length} slots for ${therapistId} on ${normalizedDate}`);

    return res.status(200).json({
      success: true,
      slots: formattedSlots
    });

  } catch (error: any) {
    console.error('❌ [API] Critical availability error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process availability.',
      details: error.message
    });
  }
}
const snapshot = await db.collection('availability').get();

console.log('📦 RAW DATA:', snapshot.docs.map(doc => doc.data()));