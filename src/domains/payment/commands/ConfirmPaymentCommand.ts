import { Command, CommandHandler } from './types';
import { razorpayGateway } from '../RazorpayGateway';
import { firestorePaymentRepository } from '../PaymentRepository';
import { adminDb } from '@/lib/firebase/admin';

export class ConfirmPaymentCommand implements Command {
  readonly name = 'ConfirmPaymentCommand';
  constructor(
    public readonly orderId: string,
    public readonly paymentId: string,
    public readonly signature?: string,
    public readonly source: string = 'direct',
    public readonly expectedBookingId?: string
  ) {}
}

export class ConfirmPaymentCommandHandler implements CommandHandler<ConfirmPaymentCommand, { success: boolean; bookingId: string }> {
  async execute(command: ConfirmPaymentCommand): Promise<{ success: boolean; bookingId: string }> {
    const { orderId, paymentId, signature, source, expectedBookingId } = command;

    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized');
    }

    // 1. Ground truth check directly from Razorpay Gateway if valid paymentId is available
    if (paymentId && !paymentId.startsWith('mock_')) {
      const rzpPayment = await razorpayGateway.fetchPayment(paymentId);
      if (rzpPayment) {
        if (rzpPayment.status !== 'captured' && rzpPayment.status !== 'authorized') {
          throw new Error(`Razorpay payment status is ${rzpPayment.status}, expected captured or authorized`);
        }
        if (rzpPayment.order_id && rzpPayment.order_id !== orderId) {
          throw new Error('Payment/order mismatch: Razorpay payment order ID does not match expected order');
        }
      }
    }

    let bookingId = '';

    // 2. Execute read-verify-confirm-save atomically inside a transaction to prevent race conditions
    await adminDb.runTransaction(async (transaction) => {
      const payment = await firestorePaymentRepository.findByOrderId(orderId, transaction);
      if (!payment) {
        throw new Error(`Payment order not found for ID: ${orderId}`);
      }

      bookingId = payment.bookingId;

      if (expectedBookingId && payment.bookingId !== expectedBookingId) {
        throw new Error('Payment order booking ID mismatch');
      }

      // Idempotent execution: if payment is already marked as success, verify payment ID consistency and return early
      if (payment.status === 'success') {
        if (payment.razorpayPaymentId && payment.razorpayPaymentId !== paymentId && !paymentId.startsWith('mock_')) {
          throw new Error('Order already confirmed with a different payment ID');
        }
        return;
      }

      // Verify captured payment amount matches expected order amount
      if (paymentId && !paymentId.startsWith('mock_')) {
        const rzpPayment = await razorpayGateway.fetchPayment(paymentId);
        if (rzpPayment && payment.amount && rzpPayment.amount) {
          const expectedPaise = payment.amount * 100;
          if (rzpPayment.amount !== expectedPaise && rzpPayment.amount !== payment.amount) {
            throw new Error(`Payment amount mismatch: expected ${expectedPaise} paise, got ${rzpPayment.amount}`);
          }
        }
      }

      if (signature) {
        const isValid = razorpayGateway.verifySignature(orderId, paymentId, signature);
        if (!isValid) {
          throw new Error('Invalid signature verification failed');
        }
      }

      // Confirm state transition on Payment entity
      payment.confirm(new Date(), paymentId, signature, source);

      await firestorePaymentRepository.save(payment, transaction);
    });

    return { success: true, bookingId };
  }
}
