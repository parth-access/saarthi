import { Command, CommandHandler } from './types';
import { razorpayGateway } from '../RazorpayGateway';
import { firestorePaymentRepository } from '../PaymentRepository';

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

    const payment = await firestorePaymentRepository.findByOrderId(orderId);
    if (!payment) {
      throw new Error(`Payment order not found for ID: ${orderId}`);
    }

    if (expectedBookingId && payment.bookingId !== expectedBookingId) {
      throw new Error('Payment order booking ID mismatch');
    }

    // Idempotent execution: if payment is already marked as success, return early
    if (payment.status === 'success') {
      return { success: true, bookingId: payment.bookingId };
    }

    if (signature) {
      const isValid = razorpayGateway.verifySignature(orderId, paymentId, signature);
      if (!isValid) {
        throw new Error('Invalid signature verification failed');
      }
    }

    // Confirm state transition on Payment entity
    payment.confirm(new Date(), paymentId, signature, source);

    await firestorePaymentRepository.save(payment);

    return { success: true, bookingId: payment.bookingId };
  }
}
