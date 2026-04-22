import { db } from './firebase-admin.js';
import { validateAdminAuth } from './_auth.js';
import { sendBookingConfirmationEmail, sendBookingRejectionEmail } from './_email.js';

export default async function handler(req: any, res: any) {
  // Enforce JSON content type
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Protect the route
  if (!validateAdminAuth(req, res)) return;

  const { id, status } = req.body;

  if (!id || !status) {
    return res.status(400).json({ success: false, error: 'ID and Status are required' });
  }

  try {
    const bookingRef = db.collection('bookings').doc(id);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    const booking = bookingDoc.data();
    if (!booking) throw new Error('Data is empty');

    // Get therapist name
    const therapistDoc = await db.collection('therapists').doc(booking.therapistId).get();
    const therapistName = therapistDoc.exists ? therapistDoc.data()?.name : 'your specialist';

    await bookingRef.update({ 
      status,
      updatedAt: new Date()
    });

    // Handle Email Notifications based on status (Async)
    const emailData = {
      userName: booking.name,
      userEmail: booking.email,
      therapistName,
      date: booking.date,
      time: booking.time,
      sessionType: booking.sessionType
    };

    if (status === 'confirmed') {
      sendBookingConfirmationEmail(emailData);
    } else if (status === 'rejected') {
      sendBookingRejectionEmail(emailData);
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Error updating booking:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
