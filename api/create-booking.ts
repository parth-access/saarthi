import { db } from './firebase-admin.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { name, email, message, preferredDate, preferredTime } = req.body;

  if (!name || !email || !message || !preferredDate || !preferredTime) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const bookingData = {
      name,
      email,
      message,
      preferredDate,
      preferredTime,
      status: 'pending',
      createdAt: new Date()
    };

    const docRef = await db.collection('bookings').add(bookingData);
    
    // Send confirmation email to user
    try {
      await resend.emails.send({
        from: 'Saarthi <contact@saarthilife.com>',
        to: email,
        subject: 'We received your booking',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #E6A520;">Hi ${name},</h2>
            <p>Thank you for reaching out to Saarthi. We have received your booking request.</p>
            <div style="background: #fdf6e7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Preferred Date:</strong> ${preferredDate}</p>
              <p><strong>Preferred Time:</strong> ${preferredTime}</p>
            </div>
            <p>Our team will review your request and get back to you shortly to confirm the session.</p>
            <p>Warm regards,<br/><strong>Team Saarthi</strong></p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('⚠️ Confirmation email failed:', emailError);
    }

    return res.status(200).json({ success: true, id: docRef.id });
  } catch (error: any) {
    console.error('❌ Error creating booking:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
