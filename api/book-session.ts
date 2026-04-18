import { Resend } from 'resend';
import admin, { db } from './_lib/firebase-admin.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name, email, date, time, message } = req.body;

  console.log("📩 Booking received:", name, email);

  // 1. Validation
  if (!name || !email || !date || !time || !message) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  // 2. Save to Firestore via Admin SDK
  if (!db) {
    console.error('Database connection unavailable');
    return res.status(500).json({ success: false, error: 'Database connection unavailable' });
  }

  try {
    await db.collection('bookings').add({
      name,
      email,
      date,
      time,
      message,
      status: "Pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("💾 Saved to Firestore");
  } catch (dbError) {
    console.error('Firestore Admin Error:', dbError);
    return res.status(500).json({ success: false, error: 'Database operation failed' });
  }

  // 3. Send Emails via Resend (only if DB save succeeded)
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    // Admin Notification
    const adminEmail = await resend.emails.send({
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

    if (!adminEmail || adminEmail.error) {
       console.error('Resend admin email error:', adminEmail?.error);
    }

    // User Confirmation
    const userEmail = await resend.emails.send({
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

    if (!userEmail || userEmail.error) {
      console.error('Resend user email error:', userEmail?.error);
    }

    console.log("📧 Email sent");
    // Return success since database save was the critical step
    return res.status(200).json({ success: true });
  } catch (emailError) {
    console.error('Email API Error:', emailError);
    // Still return success as the booking is already saved in Firestore
    return res.status(200).json({ success: true });
  }
}
