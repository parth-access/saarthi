import { Resend } from 'resend';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name, email, date, time, message } = req.body;

  if (!name || !email || !date || !time || !message) {
    return res.status(400).json({ success: false, error: 'All fields are required' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    // 1. Send email to admin
    const adminEmail = await resend.emails.send({
      from: 'Saarthi Booking <contact@saarthilife.com>',
      to: 'healwithsaarthi@gmail.com',
      subject: 'New Booking Request - Saarthi',
      html: `
        <h2>New Booking Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Preferred Date:</strong> ${date}</p>
        <p><strong>Preferred Time:</strong> ${time}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `,
    });

    if (adminEmail.error) {
      console.error('Resend admin email error:', adminEmail.error);
      return res.status(400).json({ success: false, error: adminEmail.error });
    }

    // 2. Send confirmation email to user
    const userEmail = await resend.emails.send({
      from: 'Saarthi <contact@saarthilife.com>',
      to: email,
      subject: 'Your Session Request Received - Saarthi',
      html: `
        <h2>Hello ${name},</h2>
        <p>Thank you for reaching out to Saarthi. We have received your session request for <strong>${date}</strong> at <strong>${time}</strong>.</p>
        <p>Our team will review your request and get back to you shortly to confirm the appointment or suggest an alternative if needed.</p>
        <p>Best regards,<br/>The Saarthi Team</p>
      `,
    });

    if (userEmail.error) {
      console.error('Resend user email error:', userEmail.error);
      // We don't necessarily want to fail the whole request if the confirmation fails, 
      // but the user asked for both. For now, we'll return success if the admin was notified.
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
