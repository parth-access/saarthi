import { db } from './firebase-admin.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id, status } = req.body;

  if (!id || !status) {
    return res.status(400).json({ success: false, error: 'Missing booking ID or status' });
  }

  try {
    const bookingRef = db.collection('bookings').doc(id);
    const doc = await bookingRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    const booking = doc.data()!;

    // Update status
    await bookingRef.update({ 
      status,
      updatedAt: new Date()
    });

    // Send email to USER
    try {
      const subject = status === 'accepted' ? 'Your session is confirmed' : 'Your booking was not approved';
      const body = status === 'accepted'
        ? `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
            <h2 style="color: #2e7d32;">Session Confirmed</h2>
            <p>Hi ${booking.name},</p>
            <p>We are happy to confirm your session request at Saarthi.</p>
            <p><strong>Scheduled for:</strong> ${booking.preferredDate} at ${booking.preferredTime}</p>
            <p>We look forward to seeing you.</p>
          </div>
        `
        : `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
            <h2 style="color: #d32f2f;">Booking Update</h2>
            <p>Hi ${booking.name},</p>
            <p>Thank you for your interest in Saarthi. Unfortunately, we were unable to approve your booking request for the requested time.</p>
            <p>Please feel free to reach out to us if you have any questions.</p>
          </div>
        `;

      await resend.emails.send({
        from: 'Saarthi <contact@saarthilife.com>',
        to: booking.email,
        subject: subject,
        html: body
      });
    } catch (userEmailErr) {
      console.error('⚠️ User email notification failed:', userEmailErr);
    }

    // Send email to ADMIN
    try {
      await resend.emails.send({
        from: 'Saarthi System <system@saarthilife.com>',
        to: 'admin@saarthilife.com', // Replace with actual admin email if known
        subject: `Booking ${status.toUpperCase()}: ${booking.name}`,
        html: `
          <p>Booking for <strong>${booking.name}</strong> has been <strong>${status}</strong>.</p>
          <p>Details: ${booking.preferredDate} at ${booking.preferredTime}</p>
        `
      });
    } catch (adminEmailErr) {
      console.error('⚠️ Admin email notification failed:', adminEmailErr);
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Error updating booking:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
