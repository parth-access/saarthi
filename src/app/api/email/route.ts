import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { sendEmailAction, type EmailPayload } from './emailSender';
import { logger } from '../_lib/logger';
import { requireAdmin } from '@/lib/auth/requireRole';
import { verifySession } from '@/lib/auth/verifySession';
import { getClientIp } from '../_lib/rateLimit';
import { checkDistributedRateLimit } from '../_lib/distributedRateLimit';

/**
 * Transactional email dispatch API.
 *
 * Only `booking-confirmed` and `booking-declined` are accepted here — a manual
 * therapist/admin resend capability. Every other transactional email is sent
 * server-side by its owning flow (calendar service, ConfirmBookingCommand,
 * EmailListener/outbox listeners, reminder service) and is deliberately NOT
 * reachable through this endpoint: unauthenticated, client-parameterized types
 * with a client-supplied details fallback previously made this endpoint a
 * Saarthi-branded, arbitrary-recipient relay.
 *
 * Recipient and content always derive from the booking as stored in Firestore —
 * `sendEmailAction` resolves the booking server-side and refuses to send for a
 * missing or unverifiable booking, so no client-supplied payload is ever
 * trusted for who gets mail or what it says.
 */

const EmailPayloadSchema = z.object({
  type: z.enum(['booking-confirmed', 'booking-declined']),
  bookingId: z.string().min(1),
  therapistId: z.string().min(1),
  declineReason: z.string().optional(),
  declineCustomNote: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    // Shared across serverless instances (security-sensitive, low-volume path).
    const rateCheck = await checkDistributedRateLimit(clientIp, 'email_send', 10, 60_000);
    if (!rateCheck.success) {
      logger.warn('EMAIL', 'Rate limit exceeded for email send', { ip: clientIp, store: rateCheck.store });
      return NextResponse.json({ error: 'Too many email requests. Please try again shortly.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = EmailPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload', details: parsed.error.issues }, { status: 400 });
    }

    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
    }
    if (session.role !== 'therapist' && session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Therapist or administrator permissions required' }, { status: 403 });
    }

    const result = await sendEmailAction(parsed.data as EmailPayload);
    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    logger.error('EMAIL', 'Email API Error', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) return authResult;

    // Query emails
    const emailsSnap = await adminDb.collection('emails')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const emails = emailsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || null,
      };
    });

    return NextResponse.json(emails, { status: 200 });

  } catch (error) {
    logger.error('EMAIL', 'Error fetching email logs', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
