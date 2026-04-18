import { Resend } from 'resend';
import admin, { db } from '../lib/firebase-admin';

export default async function handler(req: any, res: any) {
  // Always return JSON
  const sendError = (status: number, message: string) => {
    return res.status(status).json({ success: false, error: message });
  };

  try {
    if (req.method !== 'POST') {
      return sendError(405, 'Method not allowed');
    }

    const { name, email, message, type, preferred_time } = req.body;
    console.log("📩 Message API Hit:", { name, email, type });

    // 1. Database Write
    if (!db) {
      console.error("🔥 Database instance missing in send");
      return sendError(500, 'Database initialization failed');
    }

    try {
      const isBooking = type === 'booking';
      const collectionName = isBooking ? 'bookings' : 'contacts';
      
      await db.collection(collectionName).add({
        name,
        email,
        message,
        preferred_time: preferred_time || null,
        type: type || 'contact',
        status: "Pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log("💾 Firestore write success (send)");
    } catch (dbError) {
      console.error('❌ Firestore Admin Error (send):', dbError);
      return sendError(500, 'Failed to save data to database');
    }

    // 2. Email Sending
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const isBooking = type === 'booking';
      const subject = isBooking ? 'New Booking Request' : 'New Contact Form Submission';

      const { data, error } = await resend.emails.send({
        from: 'Saarthi Contact <contact@saarthilife.com>',
        to: 'healwithsaarthi@gmail.com',
        subject: subject,
        html: `
          <h2>${subject}</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          ${isBooking ? `<p><strong>Preferred Time:</strong> ${preferred_time || 'Not specified'}</p>` : ''}
          <p><strong>Message:</strong></p>
          <p>${message}</p>
        `,
      });

      if (error) {
        console.error('⚠️ Resend error:', error);
      } else {
        console.log("📧 Email sent success");
      }
    } catch (emailError) {
      console.error('⚠️ Email API Error:', emailError);
    }

    return res.status(200).json({ success: true });

  } catch (fatalError) {
    console.error('💀 FATAL SEND API ERROR:', fatalError);
    return sendError(500, 'Internal server error');
  }
}
