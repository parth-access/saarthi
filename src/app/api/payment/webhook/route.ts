import { NextResponse } from 'next/server';
import { logger } from '../../_lib/logger';
import crypto from 'crypto';
import { config } from '@/shared/config';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreRefundRepository } from '@/domains/payment';
import {
  firestoreBookingRepository,
  ConfirmBookingCommand,
  ConfirmBookingCommandHandler,
  FailPaymentCommand,
  FailPaymentCommandHandler,
  SlotAlreadyBookedError
} from '@/domains/booking';

/** Best-effort booking-level reconcile after a refund webhook (refunds collection is source of truth). */
async function reconcileBookingRefunded(
  bookingId: string,
  refundId?: string,
  amountPaise?: number
): Promise<void> {
  if (!adminDb) return;
  const update: Record<string, unknown> = {
    paymentStatus: 'refunded',
    refundStatus: 'refunded',
    refundedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (refundId) update.refundId = refundId;
  if (typeof amountPaise === 'number') update.refundAmount = amountPaise;
  await adminDb.collection('bookings').doc(bookingId).update(update);
}

export async function POST(request: Request) {
  try {
    const webhookSignature = request.headers.get('x-razorpay-signature');
    if (!webhookSignature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const secret = config.razorpay.webhookSecret;
    if (!secret || secret === 'placeholder' || secret === 'rzp_test_placeholder') {
        logger.error('PAYMENT', 'Missing or invalid webhook secret in env');
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    const payloadText = await request.text();
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadText)
      .digest('hex');

    if (expectedSignature !== webhookSignature) {
      logger.error('PAYMENT', 'Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadText);
    } catch (parseError) {
      logger.error('PAYMENT', 'Failed to parse webhook JSON payload', parseError);
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const event = payload.event as string;
    const eventPayload = payload.payload as Record<string, Record<string, unknown>> | undefined;

    if (event === 'payment.captured') {
      const paymentData = eventPayload?.payment?.entity as Record<string, unknown> | undefined;
      const razorpayOrderId = paymentData?.order_id as string | undefined;
      const razorpayPaymentId = paymentData?.id as string | undefined;

      if (!razorpayOrderId || !razorpayPaymentId) {
        logger.warn('PAYMENT', 'payment.captured webhook payload missing order_id or payment_id');
        return NextResponse.json({ success: true, note: 'Missing required IDs' }, { status: 200 });
      }

      const booking = await firestoreBookingRepository.findByOrderId(razorpayOrderId);

      if (!booking) {
        logger.error('PAYMENT', 'No booking found for order in webhook', null, { razorpayOrderId });
        return NextResponse.json({ success: true, note: 'Ignored - booking not found' }, { status: 200 });
      }

      const bookingId = booking.id;

      const command = new ConfirmBookingCommand(
        razorpayPaymentId,
        razorpayOrderId,
        undefined,
        'webhook',
        bookingId
      );
      const handler = new ConfirmBookingCommandHandler();
      try {
        await handler.execute(command);
        logger.success('PAYMENT', 'Payment verified via webhook', { bookingId, razorpayPaymentId });
      } catch (confirmErr) {
        // Double-booking prevented: the slot is already confirmed for another
        // booking. Retrying the webhook will never succeed, so acknowledge (200)
        // to stop Razorpay's retries. The captured payment has been flagged
        // REFUND_REQUIRED inside the command for ops / the refund flow.
        if (confirmErr instanceof SlotAlreadyBookedError) {
          logger.error('PAYMENT', 'Webhook: double-booking prevented — payment requires refund, acknowledging to stop retries', confirmErr, { bookingId, razorpayPaymentId });
          return NextResponse.json({ success: true, note: 'Slot conflict — refund required, not confirmed' }, { status: 200 });
        }
        throw confirmErr;
      }
    } else if (event === 'payment.failed') {
      const paymentData = eventPayload?.payment?.entity as Record<string, unknown> | undefined;
      const razorpayOrderId = paymentData?.order_id as string | undefined;
      const errorDescription = (paymentData?.error_description || paymentData?.error_reason || 'Payment failed') as string;

      if (razorpayOrderId) {
        const failCommand = new FailPaymentCommand(
          undefined,
          razorpayOrderId,
          errorDescription,
          'webhook'
        );
        const failHandler = new FailPaymentCommandHandler();
        await failHandler.execute(failCommand);

        logger.warn('PAYMENT', 'Payment failure processed via webhook', { razorpayOrderId, errorDescription });
      } else {
        logger.warn('PAYMENT', 'Payment failure webhook missing order_id', { eventPayload });
      }
    } else if (event === 'refund.processed') {
      const refundData = eventPayload?.refund?.entity as Record<string, unknown> | undefined;
      const paymentId = refundData?.payment_id as string | undefined;
      const gatewayRefundId = refundData?.id as string | undefined;
      const amountRefundedPaise = Number(refundData?.amount) || undefined;

      logger.info('PAYMENT', 'Refund processed webhook received', { refundId: gatewayRefundId, paymentId });

      // Reconcile the refund we track (deterministic doc id) + booking. This closes the
      // loop for refunds that complete asynchronously or were issued from the Razorpay
      // dashboard. Idempotent: an already-PROCESSED doc is left as-is.
      if (paymentId) {
        try {
          const refund = await firestoreRefundRepository.findByPaymentId(paymentId);
          if (refund && refund.status !== 'PROCESSED') {
            await firestoreRefundRepository.save({
              ...refund,
              status: 'PROCESSED',
              refundId: gatewayRefundId ?? refund.refundId,
              amountRefundedPaise: amountRefundedPaise ?? refund.amountRefundedPaise,
            });
            await reconcileBookingRefunded(refund.bookingId, gatewayRefundId, amountRefundedPaise);
            logger.success('PAYMENT', 'Refund reconciled via webhook', { bookingId: refund.bookingId, paymentId, refundId: gatewayRefundId });
          } else if (!refund) {
            logger.warn('PAYMENT', 'refund.processed webhook: no tracked refund doc for payment', { paymentId, refundId: gatewayRefundId });
          }
        } catch (reconcileErr) {
          logger.error('PAYMENT', 'Failed to reconcile refund from webhook', reconcileErr, { paymentId });
        }
      }
    } else {
      logger.info('PAYMENT', 'Unhandled webhook event received', { event });
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    logger.error('PAYMENT', 'Webhook processing failed', error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Internal Server Error' }, { status: 500 });
  }
}
