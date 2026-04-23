import { db } from '../firebase-admin.js';
import { handleError, AppError } from '../../lib/utils/error.js';
import { withProductionHarden } from '../../lib/logger.js';
import { rateLimit, LIMITS } from '../../lib/rate-limiter.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, data: null, error: 'Method not allowed' });
  }

  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    throw new AppError('Name, email, and message are required', 400);
  }

  // Security: Max length
  if (name.length > 100 || email.length > 150 || message.length > 2000) {
    throw new AppError('Message too long or invalid input', 400);
  }

  try {
    // Rate Limit
    await rateLimit(req.headers['x-forwarded-for'] || req.socket.remoteAddress, LIMITS.CONTACT);

    // Record in Firestore
    await db.collection('contacts').add({
      name,
      email,
      message,
      requestId: req.requestId,
      createdAt: new Date(),
    });

    // Notify Admin via email (simple send here as it's admin notification)
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
            <p style="font-size: 12px; color: #666; margin-top: 30px;">Sent via Saarthi Contact Form (ReqID: ${req.requestId})</p>
          </div>
        `
      });
    }

    return res.status(200).json({ success: true, data: { status: 'sent' }, error: null });
  } catch (error: any) {
    return handleError(res, error);
  }
}

export default withProductionHarden(handler);
