import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '../../_lib/logger';
import crypto from 'crypto';
import { config } from '@/shared/config';
import { ConfirmBookingCommand, ConfirmBookingCommandHandler, SlotAlreadyBookedError } from '@/domains/booking';
import { checkRateLimit } from '../../_lib/rateLimit';

export async function POST(request: Request) {
  try {
    const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(clientIp, 'payment_verify', 10, 60000);
    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Too many verification attempts. Please wait a moment.' }, { status: 429 });
    }

    const payloadSchema = z.object({
      bookingId: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_order_id: z.string().min(1),
      razorpay_signature: z.string().min(1)
    }).strict();

    const body = await request.json().catch(() => null);
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 });
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

    // Explicitly pass expectedBookingId to guarantee payment order binding
    const command = new ConfirmBookingCommand(
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      'direct',
      bookingId
    );
    const handler = new ConfirmBookingCommandHandler();
    await handler.execute(command);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error('PAYMENT', 'Payment verification failed', error);

    // Double-booking prevented: the slot was confirmed for another booking
    // between order creation and payment. The payment was captured and has been
    // flagged for refund inside the command. Tell the user clearly.
    if (error instanceof SlotAlreadyBookedError) {
      return NextResponse.json(
        { error: 'This time slot was just booked by someone else. Your payment will be refunded — please contact support if you need help.' },
        { status: 409 }
      );
    }

    const rawMsg = error instanceof Error ? error.message : String(error);
    
    if (rawMsg.includes('mismatch') || rawMsg.includes('signature') || rawMsg.includes('not found')) {
      return NextResponse.json({ error: rawMsg }, { status: 400 });
    }
    if (rawMsg.includes('payable state') || rawMsg.includes('already')) {
      return NextResponse.json({ error: rawMsg }, { status: 409 });
    }

    return NextResponse.json({ error: 'Failed to verify payment. Please contact support.' }, { status: 500 });
  }
}
