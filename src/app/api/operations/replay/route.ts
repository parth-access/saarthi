import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/requireRole';
import { resendSavedEmailAction } from '@/app/api/email/emailSender';
import { firestoreBookingRepository } from '@/domains/booking';
import { logger } from '../../_lib/logger';
import { EventBus } from '@/shared/events/EventBus';
import { checkRateLimit, getClientIp } from '@/app/api/_lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * The two event names an admin may republish.
 *
 * This endpoint used to publish ANY client-supplied `eventName` straight onto the
 * EventBus — an arbitrary event injection into domain listeners. The console only
 * ever needed two lifecycle events, and these two are safe to republish because
 * their downstream effects are idempotent: email sends dedupe on their
 * deterministic document id (an already-sent email is not sent twice), and the
 * timeline/audit listeners append records of the replay itself. Anything else —
 * payment events, cancellation flows, anything a future listener subscribes to —
 * is refused here rather than trusted to be harmless.
 */
const REPLAYABLE_EVENT_NAMES = ['BookingConfirmed', 'BookingExpired'] as const;

const replayRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('resend_email'),
    emailId: z.string().min(1).max(256),
  }),
  z.object({
    action: z.literal('replay_event'),
    bookingId: z.string().min(1).max(128),
    eventName: z.enum(REPLAYABLE_EVENT_NAMES),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) return authResult;
    const session = authResult;

    // After auth, before work: only a verified admin consumes the bucket.
    const limit = checkRateLimit(getClientIp(req), 'operations_replay', 15, 60_000);
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many replay requests in a short time. Wait a minute and try again.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
    }

    const parsed = replayRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'That replay request is not one this endpoint accepts.' },
        { status: 400 }
      );
    }
    const body = parsed.data;

    if (body.action === 'resend_email') {
      await resendSavedEmailAction(body.emailId);
      return NextResponse.json({ success: true, message: 'Email resent successfully' });
    }

    const booking = await firestoreBookingRepository.findById(body.bookingId);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    await EventBus.publish({
      name: body.eventName,
      timestamp: new Date(),
      payload: {
        bookingId: body.bookingId,
        booking,
        metadata: { replayedAt: new Date().toISOString(), replayedBy: session.uid },
      },
    });

    logger.info('OPERATIONS', `Admin replayed ${body.eventName} for booking ${body.bookingId}`, {
      adminUid: session.uid,
    });

    return NextResponse.json({
      success: true,
      message: `Event ${body.eventName} replayed successfully`,
    });
  } catch (error) {
    logger.error('OPERATIONS', 'Operations replay failed', error);
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
  }
}
