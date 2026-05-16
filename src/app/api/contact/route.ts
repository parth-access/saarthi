import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import escapeHtml from 'escape-html';
import { adminDb } from '@/lib/firebase/admin';
import * as admin from 'firebase-admin';

// Initialize Resend
let resend: Resend | null = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
}

const ContactPayloadSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  message: z.string().min(1).max(2000),
  honeypot: z.string().max(0).optional().or(z.literal('')), // Must be empty
});

const ipRateLimit = new Map<string, { count: number, resetTime: number }>();

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const rateRecord = ipRateLimit.get(ip);

  if (rateRecord) {
    if (now < rateRecord.resetTime) {
      if (rateRecord.count > 5) {
        return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
      }
      rateRecord.count++;
    } else {
      ipRateLimit.set(ip, { count: 1, resetTime: now + 1000 * 60 * 15 });
    }
  } else {
    ipRateLimit.set(ip, { count: 1, resetTime: now + 1000 * 60 * 15 });
  }

  try {
    const body = await request.json();
    const parsed = ContactPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
    }

    const { name, email, message, honeypot } = parsed.data;

    if (honeypot) {
      return NextResponse.json({ success: true }, { status: 200 });
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
      userAgent: request.headers.get('user-agent') || 'unknown',
    });

    if (resend) {
      // Send Notification to Admin
      await resend.emails.send({
        from: 'Saarthi Contact <healwithsaarthi@gmail.com>',
        to: 'healwithsaarthi@gmail.com',
        subject: 'New Saarthi Contact Inquiry',
        html: `
          <h2>New Contact Inquiry</h2>
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          <h3>Message:</h3>
          <p style="white-space: pre-wrap;">${safeMessage}</p>
        `,
      });

      // Auto-Reply
      await resend.emails.send({
        from: 'Saarthi <healwithsaarthi@gmail.com>',
        to: safeEmail,
        subject: 'We received your message | Saarthi',
        html: `
          <p>Hi ${safeName},</p>
          <p>Thank you for reaching out to Saarthi. We have received your message.</p>
        `,
      });
    }

    return NextResponse.json({ success: true, id: docRef.id }, { status: 200 });
  } catch (error: any) {
    console.error("API /contact error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
