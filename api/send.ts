import { Resend } from 'resend';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name, email, message, type, preferred_time } = req.body;
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

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ success: false });
  }
}
