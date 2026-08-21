import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { ConfirmPaymentCommand, ConfirmPaymentCommandHandler } from '@/domains/payment';
import { logger } from '@/app/api/_lib/logger';
import { sendEmailAction } from '@/app/api/email/emailSender';
import { OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';

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
      await this.bookingDomainService.confirmPayment(data, verifiedAt, razorpayPaymentId, transaction, { source });
      data.updatedAt = FieldValue.serverTimestamp();
      
      // Release lock / slot mark
      const slotId = `${data.therapistId}_${data.date}_${data.time}`.replace(/\//g, '-');
      const slotRef = adminDb.collection('locked_slots').doc(slotId);
      transaction.delete(slotRef);

      await firestoreBookingRepository.save(data, transaction);

      const auditPayRef = adminDb.collection('audit_logs').doc();
      transaction.set(auditPayRef, {
        eventType: 'PAYMENT_SUCCEEDED',
        bookingId,
        therapistId: data.therapistId,
        razorpayPaymentId,
        razorpayOrderId,
        source,
        timestamp: FieldValue.serverTimestamp(),
        details: `Payment confirmed via ${source} for booking ${bookingId}`
      });

      const auditBookRef = adminDb.collection('audit_logs').doc();
      transaction.set(auditBookRef, {
        eventType: 'BOOKING_CONFIRMED',
        bookingId,
        therapistId: data.therapistId,
        date: data.date,
        time: data.time,
        source,
        timestamp: FieldValue.serverTimestamp(),
        details: `Booking ${bookingId} confirmed successfully`
      });
    });

    // Post-commit outbox processing
    const outboxEventId = generateDeterministicEventId('booking', bookingId, 'confirmed');
    OutboxProcessor.processEvent(outboxEventId).catch((err) => {
      logger.error('BOOKING', 'Async outbox processing error after confirmation', { bookingId, error: err });
    });

    if (shouldSendEmail && therapistId) {
      // 1. Send Booking Confirmation Email
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

      // 2. Send Payment Receipt Email
      try {
        await sendEmailAction({
          type: 'payment-receipt',
          bookingId: bookingId,
          therapistId: therapistId,
          paymentDetails: {
            paymentId: razorpayPaymentId,
            orderId: razorpayOrderId,
          }
        });
        logger.info('EMAIL', 'Payment receipt email queued', { bookingId });
      } catch (err) {
        logger.error('EMAIL', 'Failed to enqueue payment receipt email', err);
      }
    }

    logger.success('PAYMENT', `Payment verified completely via ${source}`, { bookingId, razorpayPaymentId });
    return { success: true };
  }
}

