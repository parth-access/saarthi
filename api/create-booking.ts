import { db } from './firebase-admin.js';
import { Resend } from 'resend';
import { sanitize, isValidEmail } from './_utils.js';

const resend = new Resend(process.env.RESEND_API_KEY);

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
      // 1. Check for existing bookings
      const existingQuery = db.collection('bookings')
        .where('therapistId', '==', therapistId)
        .where('date', '==', date)
        .where('time', '==', time)
        .where('status', 'in', ['confirmed', 'pending']);
      
      const existingDocs = await transaction.get(existingQuery);

      if (!existingDocs.empty) {
        throw new Error('SLOT_OCCUPIED');
      }

      // 2. Optional: Verify lock if provided
      if (lockId) {
        const lockRef = db.collection('locks').doc(lockId);
        const lockDoc = await transaction.get(lockRef);
        if (lockDoc.exists) {
          // Verify it matches is a good idea but optional for speed
          // transaction.delete(lockRef); // Clean up lock
        }
      }

      // 3. Get therapist name
      const therapistRef = db.collection('therapists').doc(therapistId);
      const therapistDoc = await transaction.get(therapistRef);
      if (therapistDoc.exists) {
        therapistName = therapistDoc.data()?.name || therapistName;
      }

      // 4. Create the booking
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
        age,
        sessionType,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });

    // 📧 Async Emails (don't block the response)
    resend.emails.send({
      from: 'Saarthi <contact@saarthilife.com>',
      to: email,
      bcc: 'healwithsaarthi@gmail.com',
      subject: 'Your session request is received',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #f0f0f0; border-radius: 20px; color: #1a1a1a;">
          <h2 style="color: #5A5A40; font-family: serif; font-size: 24px;">Hi ${sName},</h2>
          <p style="font-size: 16px; line-height: 1.6;">Thank you for taking this meaningful step with Saarthi. We have received your request for a <strong>${sessionType}</strong> session with <strong>${therapistName}</strong>.</p>
          
          <div style="background: #fdf6e7; padding: 20px; border-radius: 15px; margin: 25px 0; border: 1px solid #f5f2ed;">
            <p style="margin: 5px 0;"><strong>Date:</strong> ${date}</p>
            <p style="margin: 5px 0;"><strong>Time:</strong> ${time}</p>
            <p style="margin: 5px 0;"><strong>Therapist:</strong> ${therapistName}</p>
          </div>
          
          <p style="font-size: 16px; line-height: 1.6;">We’ll confirm your session shortly.</p>
          <p style="font-size: 14px; color: #666; margin-top: 30px;">Warmly,<br/><strong>Team Saarthi</strong></p>
        </div>
      `
    }).catch(e => console.error('Email error:', e));

    return res.status(200).json({ success: true, id: bookingId });

  } catch (error: any) {
    if (error.message === 'SLOT_OCCUPIED') {
      return res.status(409).json({ success: false, error: 'This time slot was just booked by someone else.' });
    }
    console.error('❌ Error creating booking:', error);
    return res.status(500).json({ success: false, error: 'Failed to process booking. Please try again.' });
  }
}
