import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '../../_lib/logger';
import { GeneratePaymentLinkCommand, GeneratePaymentLinkCommandHandler } from '@/domains/booking';

export async function POST(request: Request) {
  try {
    const payloadSchema = z.object({
      bookingId: z.string().min(1)
    });

    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { bookingId } = parsed.data;

    const command = new GeneratePaymentLinkCommand(bookingId);
    const handler = new GeneratePaymentLinkCommandHandler();
    await handler.execute(command);

    return NextResponse.json({ success: true, bookingId }, { status: 200 });

  } catch (error) {
    logger.error('PAYMENT', 'Failed to create payment order', error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Internal Server Error' }, { status: 500 });
  }
}
