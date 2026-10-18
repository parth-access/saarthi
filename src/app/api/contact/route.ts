import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import escapeString from 'escape-html';
import { adminDb } from '@/lib/firebase/admin';
import * as admin from 'firebase-admin';
import {
  generateContactConfirmationEmail,
  generateContactConfirmationText,
} from '../_lib/emailTemplates';

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

import { getClientIp } from '../_lib/rateLimit';
import { checkDistributedRateLimit } from '../_lib/distributedRateLimit';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  // Shared across serverless instances: this route sends mail to a
  // visitor-supplied address, so a per-instance limit is not enough.
  const rateCheck = await checkDistributedRateLimit(ip, 'contact_submit', 5, 15 * 60000);
  if (!rateCheck.success) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
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

    // Stored as plain text; escaping happens only where it is rendered as HTML
    // (the admin notification below). The admin console renders text via React.
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanMessage = message.trim();
    const safeName = escapeString(cleanName);
    const safeEmail = escapeString(cleanEmail);
    const safeMessage = escapeString(cleanMessage);

    // Save to Firestore
    const docRef = await adminDb.collection('contacts').add({
      name: cleanName,
      email: cleanEmail,
      message: cleanMessage,
      status: 'unread',
      priority: 'normal',
      source: 'website',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      userAgent: request.headers.get('user-agent') || 'unknown',
    });

    if (resend) {
      // The enquiry is already saved, so email failures must not turn into a
      // 500 — the visitor would resubmit and create duplicate contacts.
      try {
        await resend.emails.send({
          from: 'Saarthi Contact <contact@saarthilife.com>',
          to: 'contact@saarthilife.com',
          replyTo: cleanEmail,
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
      } catch (err) {
        console.error('API /contact: admin notification failed', err);
      }

      // Auto-reply deliberately echoes nothing the visitor typed (no name,
      // no message): anything echoed to a visitor-chosen address would let
      // the form send Saarthi-branded text to arbitrary inboxes.
      try {
        await resend.emails.send({
          from: 'Saarthi <contact@saarthilife.com>',
          to: cleanEmail,
          replyTo: 'healwithsaarthi@gmail.com',
          subject: 'We received your message — Saarthi',
          html: generateContactConfirmationEmail({ email: cleanEmail }),
          text: generateContactConfirmationText({ email: cleanEmail }),
        });
      } catch (err) {
        console.error('API /contact: auto-reply failed', err);
      }
    }

    return NextResponse.json({ success: true, id: docRef.id }, { status: 200 });
  } catch (error) {
    console.error("API /contact error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
