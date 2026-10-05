import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySession } from '@/lib/auth/verifySession';
import { CancelBookingCommand, CancelBookingCommandHandler } from '@/domains/booking';
import { logger } from '../../_lib/logger';
import { checkRateLimit } from '../../_lib/rateLimit';

export const dynamic = 'force-dynamic';

const schema = z
  .object({
    bookingId: z.string().min(1),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

/**
 * Client self-service cancellation.
 *
 * Runs the canonical CancelBookingCommand for the *logged-in owner* of the
 * booking. Ownership is enforced inside the command against the verified
 * session (uid OR verified email). The cancellation policy (>=48h -> 100%,
 * 24-48h -> 50%, <24h -> 0%) and refund enqueue are applied server-side inside
 * the command's transaction; the returned refundPercent is authoritative.
 */
export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(clientIp, 'cancel_self', 10, 60000);
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Too many cancellation attempts. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Please sign in to cancel this session.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid cancellation request.' }, { status: 400 });
    }

    const { bookingId, reason } = parsed.data;

    const command = new CancelBookingCommand(
      bookingId,
      reason || 'Cancelled by client',
      session.uid,
      session.role,
      undefined,
      false,
      session.email
    );
    const handler = new CancelBookingCommandHandler();
    const result = await handler.execute(command);

    logger.info('BOOKING', 'Booking cancelled by client (self-service)', {
      bookingId,
      uid: session.uid,
      refundPercent: result.refundPercent,
    });

    return NextResponse.json({
      success: true,
      outcome: result.outcome,
      refundPercent: result.refundPercent,
      refundEnqueued: result.refundEnqueued,
    });
  } catch (error) {
    logger.error('BOOKING', 'Client self-service cancellation failed', error);
    const rawMsg = error instanceof Error ? error.message : String(error);

    if (rawMsg.includes('Unauthorized')) {
      return NextResponse.json({ success: false, error: 'You are not allowed to cancel this session.' }, { status: 403 });
    }
    if (rawMsg.includes('not found')) {
      return NextResponse.json({ success: false, error: 'We could not find this session.' }, { status: 404 });
    }
    if (rawMsg.includes('completed') || rawMsg.includes('no-show')) {
      return NextResponse.json(
        { success: false, error: 'This session can no longer be cancelled.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'We could not cancel your session right now. Please try again shortly.' },
      { status: 500 }
    );
  }
}
