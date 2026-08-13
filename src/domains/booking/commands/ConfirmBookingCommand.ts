import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { ConfirmPaymentCommand, ConfirmPaymentCommandHandler } from '@/domains/payment';
import { logger } from '@/app/api/_lib/logger';
import { sendEmailAction } from '@/app/api/email/emailSender';

export class ConfirmBookingCommand implements Command {
  readonly name = 'ConfirmBookingCommand';
  constructor(
    public readonly razorpayPaymentId: string,
    public readonly razorpayOrderId: string,
    public readonly razorpaySignature?: string,
    public readonly source: string = 'direct'
  ) {}
}

export class ConfirmBookingCommandHandler implements CommandHandler<ConfirmBookingCommand, { success: boolean }> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: ConfirmBookingCommand): Promise<{ success: boolean }> {
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, source } = command;

    let shouldSendEmail = false;
    let therapistId = '';
    let bookingId = '';

    // 1. Confirm and verify payment in the Payment Domain first to get trusted bookingId
    const confirmPaymentCommand = new ConfirmPaymentCommand(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      source
    );
    const confirmPaymentHandler = new ConfirmPaymentCommandHandler();
    const result = await confirmPaymentHandler.execute(confirmPaymentCommand); 
    bookingId = result.bookingId;

    await adminDb.runTransaction(async (transaction) => {
      const data = await firestoreBookingRepository.findById(bookingId, transaction);
      if (!data) throw new Error('Booking not found');

      if (data.razorpayOrderId !== razorpayOrderId) {
        throw new Error('razorpayOrderId mismatch');
      }

      if (data.status === 'confirmed' && data.paymentStatus === 'paid') {
        return;
      }

      if (data.paymentStatus !== 'pending') {
        throw new Error('Booking is not in PAYMENT_PENDING state');
      }

      therapistId = data.therapistId;
      shouldSendEmail = data.status !== 'confirmed';

      const verifiedAt = FieldValue.serverTimestamp();
      await this.bookingDomainService.confirmPayment(data, verifiedAt, razorpayPaymentId, transaction);
      data.updatedAt = FieldValue.serverTimestamp();
      
      // Release lock
      const slotId = `${data.therapistId}_${data.date}_${data.time}`.replace(/\//g, '-');
      const slotRef = adminDb.collection('locked_slots').doc(slotId);
      transaction.delete(slotRef);

      await firestoreBookingRepository.save(data, transaction);
    });

    if (shouldSendEmail && therapistId) {
      try {
        await sendEmailAction({
          type: 'booking-confirmed',
          bookingId: bookingId,
          therapistId: therapistId,
        });
        logger.info('EMAIL', 'Booking confirmation email queued', { bookingId });
      } catch (err) {
        logger.error('EMAIL', 'Failed to enqueue confirmation email', err);
      }
    }

    logger.success('PAYMENT', `Payment verified completely via ${source}`, { bookingId, razorpayPaymentId });
    return { success: true };
  }
}
