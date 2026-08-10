import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '../../_lib/logger';
import crypto from 'crypto';
import { config } from '@/shared/config';
import { ConfirmBookingCommand, ConfirmBookingCommandHandler } from '@/domains/booking';

export async function POST(request: Request) {
  try {
    const payloadSchema = z.object({
      bookingId: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_order_id: z.string().min(1),
      razorpay_signature: z.string().min(1)
    });

    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { bookingId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = parsed.data;

    const secret = config.razorpay.keySecret;
    if (!secret || secret === 'placeholder') {
      return NextResponse.json({ error: 'Razorpay keys are not configured properly.' }, { status: 500 });
    }

    const generated_signature = crypto
      .createHmac('sha256', secret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
       logger.error('PAYMENT', 'Signature mismatch', null, { bookingId });
       return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const command = new ConfirmBookingCommand(
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      'direct'
    );
    const handler = new ConfirmBookingCommandHandler();
    await handler.execute(command);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error('PAYMENT', 'Payment verification failed', error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Internal Server Error' }, { status: 500 });
  }
}
