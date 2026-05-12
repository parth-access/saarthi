import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { z } from 'zod';
import escapeHtml from 'escape-html';
import { adminDb } from './_lib/firebaseAdmin.js';
import * as admin from 'firebase-admin';

const resend = new Resend(process.env.RESEND_API_KEY);

const ContactPayloadSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  message: z.string().min(1).max(2000),
  honeypot: z.string().max(0).optional().or(z.literal('')), // Must be empty
});

// A very simple in-memory rate limiter for Vercel edge/serverless
// (Works best per-instance, but suffices for basic abuse prevention)
const ipRateLimit = new Map<string, { count: number, resetTime: number }>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Very basic IP Rate limiting
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rateRecord = ipRateLimit.get(ip);
  if (rateRecord) {
    if (now < rateRecord.resetTime) {
      if (rateRecord.count > 5) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
      rateRecord.count++;
    } else {
      ipRateLimit.set(ip, { count: 1, resetTime: now + 1000 * 60 * 15 }); // 15 mins
    }
  } else {
    ipRateLimit.set(ip, { count: 1, resetTime: now + 1000 * 60 * 15 });
  }

  try {
    const parsed = ContactPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { name, email, message, honeypot } = parsed.data;

    if (honeypot) {
      // Spam detected. Fail silently.
      return res.status(200).json({ success: true });
    }

    const safeName = escapeHtml(name.trim());
    const safeEmail = escapeHtml(email.trim());
    const safeMessage = escapeHtml(message.trim());

    // Save to Firestore
    const docRef = await adminDb.collection('contacts').add({
      name: safeName,
      email: safeEmail,
      message: safeMessage,
      status: 'unread',
      priority: 'normal',
      source: 'website',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    if (process.env.RESEND_API_KEY) {
      // Send Notification to Admin
      await resend.emails.send({
        from: 'Saarthi Contact <contact@saarthilife.com>',
        to: 'healwithsaarthi@gmail.com',
        subject: 'New Saarthi Contact Inquiry',
        html: `
          <h2>New Contact Inquiry</h2>
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          <h3>Message:</h3>
          <p style="white-space: pre-wrap;">${safeMessage}</p>
          <br />
          <p><em>View this inquiry in the <a href="https://saarthi-preview.vercel.app/admin">Admin Dashboard</a></em></p>
        `,
      });

      // Send Auto-Reply to User
      await resend.emails.send({
        from: 'Saarthi <contact@saarthilife.com>',
        to: safeEmail,
        subject: 'We received your message | Saarthi',
        html: `
          <div style="font-family: sans-serif; color: #333; max-w-2xl mx-auto line-height: 1.6;">
            <p>Hi ${safeName},</p>
            <p>Thank you for reaching out to Saarthi. This email is just to let you know that we have received your message.</p>
            <p>We try to respond to all inquiries within 24 to 48 hours. We appreciate your patience.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="font-size: 0.9em; color: #666;">
              <em><strong>Please note:</strong> Saarthi is not an emergency psychiatric service. If you are in immediate danger, distress, or experiencing a crisis, please contact your local emergency services or a crisis helpline immediately.</em>
            </p>
            <p style="font-size: 0.9em; color: #666;">Warmly,<br/>The Saarthi Team</p>
          </div>
        `,
      });
    } else {
      console.warn("RESEND_API_KEY not set. Falling back to DB write only.");
    }

    return res.status(200).json({ success: true, id: docRef.id });
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
       console.error("API /contact FULL ERROR:", error);
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

