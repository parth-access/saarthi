import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { logger } from '@/app/api/_lib/logger';
import { sendEmailAction } from '@/app/api/email/emailSender';

export class FailPaymentCommand implements Command {
  readonly name = 'FailPaymentCommand';
  constructor(
    public readonly bookingId?: string,
    public readonly razorpayOrderId?: string,
    public readonly reason?: string,
    public readonly source: string = 'client'
  ) {}
}

export class FailPaymentCommandHandler implements CommandHandler<FailPaymentCommand, { success: boolean; message?: string }> {
  async execute(command: FailPaymentCommand): Promise<{ success: boolean; message?: string }> {
    const { bookingId: inputBookingId, razorpayOrderId, reason = 'Payment was not completed', source } = command;

    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized');
    }

    let targetBookingId = inputBookingId;

    if (!targetBookingId && razorpayOrderId) {
      const snap = await adminDb.collection('bookings').where('razorpayOrderId', '==', razorpayOrderId).limit(1).get();
      if (!snap.empty) {
        targetBookingId = snap.docs[0].id;
      }
    }

    if (!targetBookingId) {
      logger.warn('PAYMENT', 'No booking found to fail payment for', { inputBookingId, razorpayOrderId });
      return { success: false, message: 'Booking not found' };
    }

    const bookingId = targetBookingId;
    let therapistId = '';
    let shouldSendEmails = false;

    await adminDb.runTransaction(async (transaction) => {
      const booking = await firestoreBookingRepository.findById(bookingId, transaction);
      if (!booking) {
        throw new Error(`Booking ${bookingId} not found`);
      }

      // If already confirmed and paid, do not cancel
      if (booking.status === 'confirmed' && booking.paymentStatus === 'paid') {
        logger.warn('PAYMENT', 'Attempted to fail an already confirmed booking', { bookingId });
        return;
      }

      // If already cancelled or rejected, operation is idempotent
      if (booking.status === 'cancelled' || booking.status === 'rejected') {
        return;
      }

      therapistId = booking.therapistId;
      shouldSendEmails = true;

      // Update booking state
      booking.failPayment(reason);
      booking.updatedAt = FieldValue.serverTimestamp();

      // Release slot lock
      const slotId = `${booking.therapistId}_${booking.date}_${booking.time}`.replace(/\//g, '-');
      const slotRef = adminDb.collection('locked_slots').doc(slotId);
      transaction.delete(slotRef);

      await firestoreBookingRepository.save(booking, transaction);

      // Audit logs
      const auditPaymentRef = adminDb.collection('audit_logs').doc();
      transaction.set(auditPaymentRef, {
        eventType: 'PAYMENT_FAILED',
        bookingId,
        therapistId: booking.therapistId,
        razorpayOrderId: razorpayOrderId || booking.razorpayOrderId || null,
        reason,
        source,
        timestamp: FieldValue.serverTimestamp(),
        details: `Payment marked failed for booking ${bookingId}: ${reason}`
      });

      const auditSlotRef = adminDb.collection('audit_logs').doc();
      transaction.set(auditSlotRef, {
        eventType: 'SLOT_RELEASED',
        bookingId,
        therapistId: booking.therapistId,
        date: booking.date,
        time: booking.time,
        reason,
        timestamp: FieldValue.serverTimestamp(),
        details: `Slot released due to payment failure/cancellation for booking ${bookingId}`
      });
    });

    if (shouldSendEmails && therapistId) {
      // 1. Send Slot Released Email
      try {
        await sendEmailAction({
          type: 'booking-slot-released',
          bookingId,
          therapistId,
          declineReason: reason,
        });
        logger.info('EMAIL', 'Booking slot released email queued', { bookingId });
      } catch (err) {
        logger.error('EMAIL', 'Failed to send slot released email', err);
      }

      // 2. Send Payment Failed Email
      try {
        await sendEmailAction({
          type: 'payment-failed',
          bookingId,
          therapistId,
          paymentDetails: {
            orderId: razorpayOrderId,
            failureReason: reason,
          }
        });
        logger.info('EMAIL', 'Payment failed notification email queued', { bookingId });
      } catch (err) {
        logger.error('EMAIL', 'Failed to send payment failed email', err);
      }
    }

    return { success: true };
  }
}
