import { Resend } from 'resend';
import admin, { db } from './_lib/firebase-admin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name, email, message, type, preferred_time } = req.body;

  console.log("📩 Message received:", name, email, type);

  // 1. Save to Firestore if database is available
  if (!db) {
    console.error('Database connection unavailable');
    return res.status(500).json({ success: false, error: 'Database connection unavailable' });
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
    console.log("💾 Saved to Firestore");
  } catch (dbError) {
    console.error('Firestore Admin Error (send):', dbError);
    return res.status(500).json({ success: false, error: 'Database operation failed' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const isBooking = type === 'booking';
  const subject = isBooking ? 'New Booking Request' : 'New Contact Form Submission';

  try {
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
      console.error('Resend error:', error);
      return res.status(400).json({ success: false, error });
    }

    console.log("📧 Email sent");
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('API Error:', error);
    // Still return success as the data is already saved in Firestore
    return res.status(200).json({ success: true });
  }
}
