import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '../../_lib/logger';
import { FailPaymentCommand, FailPaymentCommandHandler } from '@/domains/booking';

const failPayloadSchema = z.object({
  bookingId: z.string().optional(),
  orderId: z.string().optional(),
  reason: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = failPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { bookingId, orderId, reason } = parsed.data;

    if (!bookingId && !orderId) {
      return NextResponse.json({ error: 'bookingId or orderId is required' }, { status: 400 });
    }

    const command = new FailPaymentCommand(
      bookingId,
      orderId,
      reason || 'Payment cancelled or dismissed by user',
      'client'
    );
    const handler = new FailPaymentCommandHandler();
    const result = await handler.execute(command);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error('PAYMENT', 'Failed to process payment failure report', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
