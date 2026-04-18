import { Resend } from 'resend';
import admin, { db } from '../lib/firebase-admin';

export default async function handler(req: any, res: any) {
  console.log("🔥 API HIT:", req.url);
  
  // Always return JSON
  const sendError = (status: number, message: string) => {
    return res.status(status).json({ success: false, error: message });
  };

  try {
    if (req.method !== 'POST') {
      return sendError(405, 'Method not allowed');
    }

    const { name, email, date, time, message } = req.body;
    console.log("📩 Booking API Hit:", { name, email, date, time });

    // 1. Validation
    if (!name || !email || !date || !time || !message) {
      return sendError(400, 'Missing required fields');
    }

    // 2. Database Write
    if (!db) {
      console.error("🔥 Database instance missing");
      return sendError(500, 'Database initialization failed');
    }

    try {
      const bookingData = {
        name,
        email,
        date,
        time,
        message,
        status: "Pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await db.collection('bookings').add(bookingData);
      console.log("💾 Firestore write success:", docRef.id);
    } catch (dbError) {
      console.error('❌ Firestore Save Error:', dbError);
      return sendError(500, 'Failed to save booking to database');
    }

    // 3. Email Sending
    // We wrap this in its own try/catch so that if emails fail, we still consider the booking "received" (saved in DB)
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      // Admin Notification
      await resend.emails.send({
        from: 'Saarthi Booking <contact@saarthilife.com>',
        to: ['healwithsaarthi@gmail.com'],
        replyTo: email,
        subject: `New Booking Request - ${name}`,
        html: `
          <h2>New Booking Request</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Time:</strong> ${time}</p>
          <p><strong>Message:</strong><br/>${message}</p>
        `,
      });

      // User Confirmation
      await resend.emails.send({
        from: 'Saarthi <contact@saarthilife.com>',
        to: email,
        subject: 'Your Session Request is Received – Saarthi',
        html: `
          <h2>Hi ${name},</h2>
          <p>Thank you for reaching out to Saarthi.</p>
          <p>We've received your session request.</p>
          <p><strong>Your Details:</strong></p>
          <ul>
            <li>Date: ${date}</li>
            <li>Time: ${time}</li>
          </ul>
          <p>We will get in touch with you shortly to confirm your session.</p>
          <br/>
          <p>Warm regards,<br/>Team Saarthi 🌿</p>
        `,
      });

      console.log("📧 Emails sent successfully");
    } catch (emailError) {
      console.error('⚠️ Email sending failed (but booking was saved):', emailError);
      // We don't return error here because the DB write succeeded
    }

    return res.status(200).json({ success: true });

  } catch (fatalError) {
    console.error('💀 FATAL API ERROR:', fatalError);
    return sendError(500, 'Internal server error');
  }
}
