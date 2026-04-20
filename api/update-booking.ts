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

    // Update booking status
    await bookingRef.update({
      status,
      updatedAt: new Date()
    });

    // Prepare email templates based on status
    let subject = '';
    let html = '';

    if (status === 'confirmed') {
      subject = 'Your session is confirmed';
      html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #f0f0f0; border-radius: 20px; color: #1a1a1a;">
          <h2 style="color: #5A5A40; font-family: serif; font-size: 24px;">Session Confirmed 🎉</h2>
          <p style="font-size: 16px; line-height: 1.6;">Hi ${booking.name},</p>
          <p style="font-size: 16px; line-height: 1.6;">Your session request with Saarthi has been officially confirmed. We look forward to meeting you.</p>
          
          <div style="background: #fdf6e7; padding: 20px; border-radius: 15px; margin: 25px 0; border: 1px solid #f5f2ed;">
            <p style="margin: 5px 0;"><strong>Date:</strong> ${booking.date}</p>
            <p style="margin: 5px 0;"><strong>Time:</strong> ${booking.time}</p>
            <p style="margin: 5px 0;"><strong>Session Type:</strong> ${booking.sessionType}</p>
          </div>
          
          <p style="font-size: 16px; line-height: 1.6;">If you have any questions before our session, feel free to reply to this email.</p>
          <p style="font-size: 14px; color: #666; margin-top: 30px;">Warmly,<br/><strong>Team Saarthi</strong></p>
        </div>
      `;
    } else if (status === 'rejected') {
      subject = 'We couldn’t schedule your requested slot';
      html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #f0f0f0; border-radius: 20px; color: #1a1a1a;">
          <h2 style="color: #8c2a2a; font-family: serif; font-size: 24px;">Booking Update</h2>
          <p style="font-size: 16px; line-height: 1.6;">Hi ${booking.name},</p>
          <p style="font-size: 16px; line-height: 1.6;">Thank you for your patience while we reviewed your request. Unfortunately, we couldn’t schedule your requested slot at this time.</p>
          
          <p style="font-size: 16px; line-height: 1.6;">We value your step towards well-being. Please feel free to visit our booking page to select another available time that works for you.</p>
          
          <p style="font-size: 14px; color: #666; margin-top: 30px;">With care,<br/><strong>Team Saarthi</strong></p>
        </div>
      `;
    }

    if (subject && html) {
      try {
        await resend.emails.send({
          from: 'Saarthi <contact@saarthilife.com>',
          to: booking.email,
          bcc: 'healwithsaarthi@gmail.com',
          subject: subject,
          html: html
        });
      } catch (emailErr) {
        console.error('⚠️ Status Update Email failed:', emailErr);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Error updating booking:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
