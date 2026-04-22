import { db } from './firebase-admin.js';
import { Resend } from 'resend';
import { validateAdminAuth } from './_auth.js';

const resend = new Resend(process.env.RESEND_API_KEY);

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

    // Handle Email Notifications based on status
    if (status === 'confirmed') {
      await resend.emails.send({
        from: 'Saarthi <contact@saarthilife.com>',
        to: booking.email,
        bcc: 'healwithsaarthi@gmail.com',
        subject: 'Session Confirmed: Your path with Saarthi',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 30px; color: #1a1a1a;">
            <h2 style="color: #5A5A40; font-family: serif; font-size: 28px;">Session Confirmed</h2>
            <p style="font-size: 16px; line-height: 1.6;">Hi ${booking.name}, your request for a session on <strong>${booking.date} at ${booking.time}</strong> has been confirmed.</p>
            
            <div style="background: #fdf6e7; padding: 30px; border-radius: 20px; margin: 30px 0; border: 1px solid #f5f2ed;">
              <p style="margin: 5px 0;"><strong>Specialist:</strong> ${therapistName}</p>
              <p style="margin: 5px 0;"><strong>Date:</strong> ${booking.date}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> ${booking.time}</p>
              <p style="margin: 5px 0;"><strong>Platform:</strong> Online (Link will be shared separately)</p>
            </div>
            
            <p style="font-size: 16px; line-height: 1.6;">We look forward to seeing you. Please find a quiet, comfortable space for our session.</p>
            <p style="font-size: 14px; color: #666; margin-top: 40px;">Warmly,<br/><strong>Saarthi Support</strong></p>
          </div>
        `
      });
    } else if (status === 'rejected') {
      await resend.emails.send({
        from: 'Saarthi <contact@saarthilife.com>',
        to: booking.email,
        subject: 'Update regarding your session request',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 30px; color: #1a1a1a;">
            <h2 style="color: #5A5A40; font-family: serif; font-size: 24px;">Regarding your request</h2>
            <p style="font-size: 16px; line-height: 1.6;">Hi ${booking.name},</p>
            <p style="font-size: 16px; line-height: 1.6;">Unfortunately, the slot you requested on <strong>${booking.date} at ${booking.time}</strong> is no longer available or couldn't be scheduled at this time.</p>
            <p style="font-size: 16px; line-height: 1.6;">We encourage you to try another slot or reach out to us directly for tailored guidance.</p>
            <p style="font-size: 14px; color: #666; margin-top: 40px;">Best regards,<br/><strong>Team Saarthi</strong></p>
          </div>
        `
      });
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Error updating booking:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
