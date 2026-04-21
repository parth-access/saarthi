import { db } from './firebase-admin.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    // Record the contact in Firestore
    await db.collection('contacts').add({
      name,
      email,
      message,
      createdAt: new Date(),
    });

    // Notify Admin via email
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'Saarthi Contact <contact@saarthilife.com>',
        to: 'healwithsaarthi@gmail.com',
        subject: `New Message from ${name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #f0f0f0; border-radius: 20px;">
            <h2 style="color: #5A5A40; font-family: serif;">New Contact Message</h2>
            <p><strong>From:</strong> ${name} (${email})</p>
            <p><strong>Message:</strong></p>
            <div style="background: #fdf6e7; padding: 20px; border-radius: 15px; border: 1px solid #f5f2ed; italic: true;">
              "${message}"
            </div>
            <p style="font-size: 12px; color: #666; margin-top: 30px;">Sent via Saarthi Contact Form</p>
          </div>
        `
      });
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Error in send-contact API:', error);
    return res.status(500).json({ success: false, error: 'Failed to send message' });
  }
}
