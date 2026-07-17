import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import Razorpay from 'razorpay';
import { config } from '@/shared/config';
import { firestoreBookingRepository, BookingDomainService } from '@/domains/booking';
import { sendEmailAction } from '@/app/api/email/emailSender';
import { logger } from '@/app/api/_lib/logger';

export class GeneratePaymentLinkCommand implements Command {
  readonly name = 'GeneratePaymentLinkCommand';
  constructor(public readonly bookingId: string) {}
}

export class GeneratePaymentLinkCommandHandler implements CommandHandler<GeneratePaymentLinkCommand, { success: boolean }> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: GeneratePaymentLinkCommand): Promise<{ success: boolean }> {
    const { bookingId } = command;

    await adminDb.runTransaction(async (transaction) => {
      const data = await firestoreBookingRepository.findById(bookingId, transaction);
      if (!data) {
        throw new Error('Booking not found');
      }

      if (data.status !== 'pending_approval' && data.status !== 'pending' && data.status !== 'awaiting_payment') {
        throw new Error('Booking is not in a valid state to create a payment order');
      }

      let price = 1500;
      if (data.sessionMode === 'in_person') price = 2000;
      const amount = price;
      const currency = 'INR';

      const rzp = new Razorpay({
        key_id: config.razorpay.keyId || 'rzp_test_placeholder',
        key_secret: config.razorpay.keySecret || 'placeholder'
      });

      const order = await rzp.orders.create({
        amount: amount * 100,
        currency,
        receipt: `receipt_${bookingId}`,
        notes: {
          bookingId,
          therapistId: data.therapistId
        }
      });

      const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
      transaction.set(auditRef, {
        action: 'awaiting_payment',
        timestamp: FieldValue.serverTimestamp(),
        details: 'Payment order generated'
      });

      await this.bookingDomainService.awaitPayment(data, transaction);
      data.paymentStatus = 'pending';
      data.paymentAmount = amount;
      data.paymentCurrency = currency;
      data.razorpayOrderId = order.id;
      data.updatedAt = FieldValue.serverTimestamp();
      await firestoreBookingRepository.save(data, transaction);
    });

    const updatedBooking = await firestoreBookingRepository.findById(bookingId);
    if (!updatedBooking) throw new Error('Booking not found post-transaction');

    try {
      await sendEmailAction({
        type: 'booking-payment-link',
        bookingId: updatedBooking.id,
        therapistId: updatedBooking.therapistId,
      });
    } catch (err) {
      logger.warn('PAYMENT', 'Failed to trigger payment email', { error: String(err), bookingId });
    }

    logger.success('PAYMENT', 'Created Razorpay order and payment link successfully', { bookingId });
    return { success: true };
  }
}
