import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebase/admin';
import { sendEmailAction, type EmailPayload } from './emailSender';
import { logger } from '../_lib/logger';

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
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
      }

      const idToken = authHeader.split('Bearer ')[1];
      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        if (!decodedToken) {
          throw new Error('Invalid token');
        }
      } catch {
        return NextResponse.json({ error: 'Forbidden: Invalid token' }, { status: 403 });
      }
    }

    const result = await sendEmailAction(parsed.data as EmailPayload);
    return NextResponse.json(result, { status: 200 });
    
  } catch (error) {
    logger.error('EMAIL', 'Email API Error', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
