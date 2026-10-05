import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '../../_lib/logger';
import { getClientIp } from '../../_lib/rateLimit';
import { checkDistributedRateLimit } from '../../_lib/distributedRateLimit';
import { FailPaymentCommand, FailPaymentCommandHandler } from '@/domains/booking';
import { verifySession } from '@/lib/auth/verifySession';

/**
 * Client-reported payment failure (checkout dismissed / payment.failed event).
 *
 * Authorization model:
 *  - the report MUST be bound to a Razorpay order (orderId is required) — a
 *    bare bookingId is not ownership proof;
 *  - Razorpay ground truth is consulted before failing: an order that actually
 *    captured/authorized money is never cancelled here (verify/webhook own the
 *    success path), and an unverifiable state fails closed;
 *  - a booking that belongs to a real user can only be failed by that user
 *    (session-bound); guest bookings are protected by the order binding +
 *    gateway checks (enforced in FailPaymentCommandHandler);
 *  - the HMAC-verified Razorpay webhook uses the same command with
 *    source='webhook' and is exempt from these client checks.
 */

const failPayloadSchema = z.object({
  bookingId: z.string().min(1),
  orderId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    // Shared across serverless instances (security-sensitive, low-volume path).
    const rateCheck = await checkDistributedRateLimit(clientIp, 'payment_fail', 10, 60_000);
    if (!rateCheck.success) {
      logger.warn('PAYMENT', 'Rate limit exceeded for payment failure report', { ip: clientIp, store: rateCheck.store });
      return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = failPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { bookingId, orderId, reason } = parsed.data;

    // Session is optional (guest checkout) but is passed through so the
    // command can enforce ownership for bookings that belong to a real user.
    const session = await verifySession(request);

    const command = new FailPaymentCommand(
      bookingId,
      orderId,
      reason || 'Payment cancelled or dismissed by user',
      'client',
      session?.uid
    );
    const handler = new FailPaymentCommandHandler();
    const result = await handler.execute(command);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    logger.warn('PAYMENT', 'Payment failure report rejected', { error: message });

    if (message.includes('Not authorized')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes('refused') || message.includes('could not be verified')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes('not found') || message.includes('No booking')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes('required') || message.includes('does not match')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
