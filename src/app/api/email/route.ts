import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { sendEmailAction, type EmailPayload } from './emailSender';
import { logger } from '../_lib/logger';
import { requireAdmin } from '@/lib/auth/requireRole';
import { verifySession } from '@/lib/auth/verifySession';

const EmailPayloadSchema = z.object({
  type: z.enum(['booking-received', 'booking-confirmed', 'booking-payment-link', 'booking-rescheduled', 'therapist-notification', 'booking-declined']),
  bookingId: z.string().min(1),
  therapistId: z.string().min(1),
  declineReason: z.string().optional(),
  declineCustomNote: z.string().optional(),
  bookingDetails: z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    date: z.string(),
    time: z.string(),
    originalDate: z.string().optional(),
    originalTime: z.string().optional(),
    sessionMode: z.string().optional(),
    bookingToken: z.string().optional(),
  }).optional()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = EmailPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload', details: parsed.error.issues }, { status: 400 });
    }

    const { type } = parsed.data;

    if (type === 'booking-confirmed' || type === 'booking-declined') {
      const session = await verifySession(request);
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
      }
      if (session.role !== 'therapist' && session.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden: Therapist or administrator permissions required' }, { status: 403 });
      }
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
