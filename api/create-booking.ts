import { db } from './firebase-admin.js';
import { sanitize, isValidEmail } from './_utils.js';
import { sendBookingRequestEmail } from './_email.js';

export default async function handler(req: any, res: any) {
  // Enforce JSON content type
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { name, email, message, date, time, gender, age, sessionType, therapistId, lockId } = req.body;

  if (!name || !email || !date || !time || !gender || !age || !sessionType || !therapistId) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email address' });
  }

  // Sanitize inputs
  const sName = sanitize(name);
  const sMessage = sanitize(message);

  console.log(`📝 [API] Creating booking for ${sName} (${email})`);

  try {
    let bookingId = '';
    let therapistName = 'one of our specialists';

    // ⚡ TRANSACTIONAL BOOKING
    await db.runTransaction(async (transaction) => {
      // 1. Check for existing concurrent bookings (another layer of safety)
      const existingQuery = db.collection('bookings')
        .where('therapistId', '==', therapistId)
        .where('date', '==', date)
        .where('time', '==', time)
        .where('status', 'in', ['confirmed', 'pending']);
      
      const existingDocs = await transaction.get(existingQuery);
      if (!existingDocs.empty) {
        throw new Error('SLOT_OCCUPIED');
      }

      // 2. Validate and Consume Lock (MANDATORY in production)
      if (!lockId) {
        throw new Error('MISSING_LOCK'); // Prevent bookings without a pre-secured lock
      }
      
      const lockRef = db.collection('locks').doc(lockId);
      const lockDoc = await transaction.get(lockRef);
      
      if (!lockDoc.exists) {
        throw new Error('INVALID_LOCK');
      }
      
      const lockData = lockDoc.data();
      const now = new Date();
      
      if (!lockData || lockData.expiresAt.toDate() < now) {
        throw new Error('EXPIRED_LOCK');
      }
      
      // Ensure lock is for the correct data
      if (lockData.therapistId !== therapistId || lockData.date !== date || lockData.time !== time) {
        throw new Error('LOCK_MISMATCH');
      }

      // 3. Get therapist name for confirmation email
      const therapistRef = db.collection('therapists').doc(therapistId);
      const therapistDoc = await transaction.get(therapistRef);
      if (therapistDoc.exists) {
        therapistName = therapistDoc.data()?.name || therapistName;
      }

      // 4. Create the booking document
      const newBookingRef = db.collection('bookings').doc();
      bookingId = newBookingRef.id;

      transaction.set(newBookingRef, {
        therapistId,
        name: sName,
        email,
        message: sMessage,
        date,
        time,
        gender,
        age: parseInt(age), // Ensure number
        sessionType,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        lockId // track which lock was used
      });

      // 5. Atomic Delete: Release the lock so the slot doesn't stay "locked" unnecessarily
      transaction.delete(lockRef);
    });

    // 📧 Async Emails (don't block the response)
    sendBookingRequestEmail({
      userName: sName,
      userEmail: email,
      therapistName,
      date,
      time,
      sessionType,
      message: sMessage
    });

    return res.status(200).json({ success: true, id: bookingId });

  } catch (error: any) {
    console.error('❌ Error creating booking:', error);
    
    const errorMap: Record<string, string> = {
      'SLOT_OCCUPIED': 'This time slot was just booked by someone else.',
      'MISSING_LOCK': 'Your session data has expired. Please refresh the page and try again.',
      'INVALID_LOCK': 'Your reservation is no longer valid. Please choose a different time.',
      'EXPIRED_LOCK': 'Your time slot reservation has expired. Please select the slot again.',
      'LOCK_MISMATCH': 'Session data mismatch. Please clear your cache and try again.'
    };

    return res.status(errorMap[error.message] ? 409 : 500).json({ 
      success: false, 
      error: errorMap[error.message] || 'Failed to process booking. Please try again.' 
    });
  }
}
