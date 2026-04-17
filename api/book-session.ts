import { Resend } from 'resend';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name, email, date, time, message } = req.body;

  if (!name || !email || !date || !time || !message) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    // 1. Send email to admin
    const adminEmail = await resend.emails.send({
      from: 'Saarthi Booking <contact@saarthilife.com>',
      to: ['healwithsaarthi@gmail.com'],
      subject: 'New Booking Request - Saarthi',
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
      console.error('Resend admin email error:', adminEmail.error);
      return res.status(400).json({ success: false, error: 'Failed to notify admin' });
    }

    // 2. Send confirmation email to user
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
      // We don't fail the whole request if only the confirmation email fails, 
      // as long as the admin notification succeeded.
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
