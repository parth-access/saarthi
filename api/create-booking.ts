import { db } from './firebase-admin.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  // Enforce JSON content type
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { name, email, message, date, time, gender, age, sessionType, therapistId } = req.body;

  if (!name || !email || !date || !time || !gender || !age || !sessionType || !therapistId) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  console.log(`📝 [API] Creating booking for ${name} (${email}) with therapist ${therapistId}`);

  try {
    // 🚫 FINAL DOUBLE BOOKING CHECK
    const existing = await db.collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('time', '==', time)
      .where('status', 'in', ['confirmed', 'pending'])
      .get();

    if (!existing.empty) {
      return res.status(409).json({ success: false, error: 'This time slot is no longer available' });
    }

    // Get therapist name for email
    const therapistDoc = await db.collection('therapists').doc(therapistId).get();
    const therapistName = therapistDoc.exists ? therapistDoc.data()?.name : 'one of our specialists';

    const bookingData = {
      therapistId,
      name,
      email,
      message: message || '',
      date,
      time,
      gender,
      age,
      sessionType,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const docRef = await db.collection('bookings').add(bookingData);
    
    // Clear any existing locks for this slot (optional but good practice)
    // Actually, just let them expire or clean up if you have the lockId.
    
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
            <p style="font-size: 16px; line-height: 1.6;">Thank you for taking this meaningful step with Saarthi. We have received your request for a <strong>${sessionType}</strong> session with <strong>${therapistName}</strong>.</p>
            
            <div style="background: #fdf6e7; padding: 20px; border-radius: 15px; margin: 25px 0; border: 1px solid #f5f2ed;">
              <p style="margin: 5px 0;"><strong>Date:</strong> ${date}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> ${time}</p>
              <p style="margin: 5px 0;"><strong>Therapist:</strong> ${therapistName}</p>
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
        subject: `New Request: ${name} for ${therapistName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #f0f0f0; border-radius: 20px; color: #1a1a1a;">
            <h2 style="color: #5A5A40; font-family: serif; font-size: 24px;">New Booking Request</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 15px; margin: 25px 0;">
              <p><strong>Client:</strong> ${name} (${email})</p>
              <p><strong>Therapist:</strong> ${therapistName}</p>
              <p><strong>Date/Time:</strong> ${date} at ${time}</p>
              <p><strong>Type:</strong> ${sessionType}</p>
            </div>
            <p><a href="https://saarthilife.com/admin" style="display: inline-block; background: #5A5A40; color: white; padding: 12px 25px; text-decoration: none; border-radius: 99px; font-size: 14px;">Review in Dashboard</a></p>
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
