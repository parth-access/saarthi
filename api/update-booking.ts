import { db } from './firebase-admin.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  // Only allow POST
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

    // Update booking status
    await bookingRef.update({
      status,
      updatedAt: new Date()
    });

    // Prepare email
    const subject =
      status === 'accepted'
        ? 'Your session is confirmed 🎉'
        : 'Update on your booking';

    const body =
      status === 'accepted'
        ? `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
            <h2 style="color: #2e7d32;">Session Confirmed</h2>
            <p>Hi ${booking.name},</p>
            <p>Your session request at Saarthi has been confirmed.</p>
            <p><strong>Date:</strong> ${booking.preferredDate}</p>
            <p><strong>Time:</strong> ${booking.preferredTime}</p>
            <p>We look forward to seeing you.</p>
          </div>
        `
        : `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
            <h2 style="color: #d32f2f;">Booking Update</h2>
            <p>Hi ${booking.name},</p>
            <p>Thank you for your interest in Saarthi.</p>
            <p>Unfortunately, we couldn’t confirm your requested slot.</p>
            <p>Please feel free to try booking another time.</p>
          </div>
        `;

    // Send email (user + YOU in BCC)
    try {
      await resend.emails.send({
        from: 'Saarthi <contact@saarthilife.com>',
        to: booking.email,
        bcc: ['healwithsaarthi@gmail.com'], // ✅ FIXED
        subject: subject,
        html: body
      });

      console.log('✅ Email sent successfully');
    } catch (emailErr) {
      console.error('⚠️ Email sending failed:', emailErr);
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Error updating booking:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}