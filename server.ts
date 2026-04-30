import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Resend } from 'resend';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const resend = new Resend(process.env.RESEND_API_KEY);

  app.post('/api/email/booking-received', async (req, res) => {
    console.log("EMAIL API HIT:", req.body);
    try {
      const { booking, therapist } = req.body;
      
      if (!booking || typeof booking !== 'object') {
        return res.status(400).json({ error: 'Missing booking in payload' });
      }

      if (!booking.email || !booking.name || !booking.date || !booking.time) {
        return res.status(400).json({ error: 'Missing required booking fields' });
      }

      const therapistName = therapist?.name || 'our therapist';
      
      if (!process.env.RESEND_API_KEY) {
        console.warn('RESEND_API_KEY is not set. Simulating email send.');
        return res.json({ success: true, simulated: true });
      }

      await resend.emails.send({
        from: 'Saarthi <noreply@saarthi.com>',
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

      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to send booking received email:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/email/booking-confirmed', async (req, res) => {
    console.log("EMAIL API HIT:", req.body);
    try {
      const { booking, therapist } = req.body;
      
      if (!booking || typeof booking !== 'object') {
        return res.status(400).json({ error: 'Missing booking in payload' });
      }

      if (!booking.email || !booking.name || !booking.date || !booking.time) {
        return res.status(400).json({ error: 'Missing required booking fields' });
      }

      const therapistName = therapist?.name || 'our therapist';
      
      if (!process.env.RESEND_API_KEY) {
        console.warn('RESEND_API_KEY is not set. Simulating email send.');
        return res.json({ success: true, simulated: true });
      }

      const options: any = {
        from: 'Saarthi <noreply@saarthi.com>',
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

      if (therapist?.email) {
        options.bcc = therapist.email;
      } else {
        console.warn('Skipping BCC: therapist email is missing');
      }

      await resend.emails.send(options);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to send booking confirmed email:', error);
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
