import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySession } from '@/lib/auth/verifySession';
import { FollowUpBookingService } from '@/services/followUpBookingService';
import { logger } from '../../_lib/logger';
import { checkRateLimit } from '../../_lib/rateLimit';

export const dynamic = 'force-dynamic';

const schema = z
  .object({
    sourceBookingId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM (24-hour, zero-padded)'),
    overrides: z
      .object({
        name: z.string().min(1).optional(),
        phone: z.string().min(1).optional(),
        email: z.string().email().optional(),
        sessionMode: z.string().optional(),
        sessionType: z.string().optional(),
        message: z.string().optional(),
        gender: z.string().optional(),
        age: z.number().int().min(1).max(120).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Therapist-scheduled follow-up session.
 *
 * Reuses the canonical CreateBookingCommand flow (slot concurrency, 45-minute
 * duration, pricing, Razorpay order, outbox, emails, calendar). Authorization
 * and source-session validation are enforced server-side in the service; the
 * new booking is linked to the source session via previousBookingId.
 */
export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(clientIp, 'follow_up_schedule', 10, 60_000);
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const session = await verifySession(req);
    if (!session?.uid) {
      return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
    }
    if (session.role !== 'therapist' && session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Only therapists can schedule follow-up sessions.' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const result = await FollowUpBookingService.scheduleFollowUp({
      ...parsed.data,
      therapist: { uid: session.uid, role: session.role || 'therapist' },
    });

    if (!result.success) {
      const status = result.error?.startsWith('Unauthorized') ? 403 : 400;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }

    return NextResponse.json({
      success: true,
      bookingId: result.bookingId,
      orderId: result.orderId,
      amount: result.amount,
      currency: result.currency,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('FOLLOW_UP_API', 'Failed to schedule follow-up session', { error: errorMsg });
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
