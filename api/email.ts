import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { type, booking, therapist } = req.body;

    if (!booking || typeof booking !== 'object') {
      return res.status(400).json({ error: 'Missing booking in payload' });
    }

    if (!booking.email || !booking.name || !booking.date || !booking.time) {
      return res.status(400).json({ error: 'Missing required booking fields' });
    }

    const therapistName = therapist?.name || 'our therapist';
    const therapistEmail = therapist?.email;

    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY is not set. Simulating email send.');
      return res.status(200).json({ success: true, simulated: true });
    }

    if (type === 'booking-received') {
      const data = await resend.emails.send({
        from: 'Saarthi Contact <healwithsaarthi@gmail.com>',
        to: booking.email,
        subject: 'We have received your booking request',
        html: `
          <h1>Booking Request Received</h1>
          <p>Hi ${booking.name},</p>
          <p>We have successfully received your booking request for a session with ${therapistName}.</p>
          <p><strong>Date:</strong> ${booking.date}</p>
          <p><strong>Time:</strong> ${booking.time}</p>
          <p>We will notify you once your therapist confirms the session.</p>
        `,
      });
      return res.status(200).json({ success: true, data });
    } 
    
    if (type === 'booking-confirmed') {
      const options: any = {
        from: 'Saarthi Contact <healwithsaarthi@gmail.com>',
        to: booking.email,
        subject: 'Your session has been confirmed',
        html: `
          <h1>Session Confirmed</h1>
          <p>Hi ${booking.name},</p>
          <p>Your session with ${therapistName} has been confirmed!</p>
          <p><strong>Date:</strong> ${booking.date}</p>
          <p><strong>Time:</strong> ${booking.time}</p>
          <p>Have a great session!</p>
        `,
      };

      if (therapistEmail) {
        options.bcc = therapistEmail;
      } else {
        console.warn('Skipping BCC: therapist email is missing');
      }

      const data = await resend.emails.send(options);
      return res.status(200).json({ success: true, data });
    }

    return res.status(400).json({ error: 'Invalid email type' });
    
  } catch (error: any) {
    console.error('Email API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
