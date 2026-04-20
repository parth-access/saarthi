import { db } from './firebase-admin.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { name, email, message, date, time, gender, age, sessionType } = req.body;

  if (!name || !email || !date || !time || !gender || !age || !sessionType) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    // 🚫 PREVENT DOUBLE BOOKING
    const existing = await db.collection('bookings')
      .where('date', '==', date)
      .where('time', '==', time)
      .where('status', '==', 'confirmed')
      .get();

    if (!existing.empty) {
      return res.status(409).json({ success: false, error: 'This time slot is no longer available' });
    }

    const bookingData = {
      name,
      email,
      message: message || '',
      date,
      time,
      gender,
      age,
      sessionType,
      status: 'pending',
      createdAt: new Date()
    };

    const docRef = await db.collection('bookings').add(bookingData);
    
    // Send confirmation email to user
    try {
      await resend.emails.send({
        from: 'Saarthi <contact@saarthilife.com>',
        to: email,
        bcc: 'healwithsaarthi@gmail.com',
        subject: 'Your session request is received',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #f0f0f0; border-radius: 20px; color: #1a1a1a;">
            <h2 style="color: #5A5A40; font-family: serif; font-size: 24px;">Hi ${name},</h2>
            <p style="font-size: 16px; line-height: 1.6;">Thank you for taking this meaningful step with Saarthi. We have received your request for a <strong>${sessionType}</strong> session.</p>
            
            <div style="background: #fdf6e7; padding: 20px; border-radius: 15px; margin: 25px 0; border: 1px solid #f5f2ed;">
              <p style="margin: 5px 0;"><strong>Date:</strong> ${date}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> ${time}</p>
              <p style="margin: 5px 0;"><strong>Session Type:</strong> ${sessionType}</p>
            </div>
            
            <p style="font-size: 16px; line-height: 1.6;">We’ll confirm your session shortly after checking our therapists' schedules.</p>
            <p style="font-size: 14px; color: #666; margin-top: 30px;">Warmly,<br/><strong>Team Saarthi</strong></p>
          </div>
        `
      });

      // Notify Admin
      await resend.emails.send({
        from: 'Saarthi Admin <admin@saarthilife.com>',
        to: 'healwithsaarthi@gmail.com',
        subject: `New Session Request: ${name} (${sessionType})`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #f0f0f0; border-radius: 20px; color: #1a1a1a;">
            <h2 style="color: #5A5A40; font-family: serif; font-size: 24px;">New Booking Request</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 15px; margin: 25px 0;">
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Gender:</strong> ${gender}</p>
              <p><strong>Age:</strong> ${age}</p>
              <p><strong>Date:</strong> ${date}</p>
              <p><strong>Time:</strong> ${time}</p>
              <p><strong>Type:</strong> ${sessionType}</p>
              <p><strong>Message:</strong></p>
              <p style="white-space: pre-wrap;">${message || 'No message provided'}</p>
            </div>
            <p><a href="https://saarthilife.com/admin" style="display: inline-block; background: #5A5A40; color: white; padding: 12px 25px; text-decoration: none; border-radius: 99px; font-size: 14px;">Manage in Dashboard</a></p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('⚠️ Email notification failed:', emailError);
    }

    return res.status(200).json({ success: true, id: docRef.id });
  } catch (error: any) {
    console.error('❌ Error creating booking:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
