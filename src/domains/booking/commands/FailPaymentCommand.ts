import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { logger } from '@/app/api/_lib/logger';
import { OutboxProcessor, OutboxService, generateDeterministicEventId } from '@/shared/events/outbox';

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

      // Release slot lock ONLY if this slot lock doc belongs to this specific booking
      const slotId = `${booking.therapistId}_${booking.date}_${booking.time}`.replace(/\//g, '-');
      const slotRef = adminDb.collection('locked_slots').doc(slotId);
      const slotDoc = await transaction.get(slotRef);
      if (slotDoc.exists && slotDoc.data()?.bookingId === bookingId) {
        transaction.delete(slotRef);
      }

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

      // Record Outbox Events for reliable delivery if failure is verified (webhook or server source)
      if (source !== 'client') {
        const failedEventId = generateDeterministicEventId('booking', bookingId, 'payment_failed');
        OutboxService.recordEventInTransaction(transaction, {
          id: failedEventId,
          name: 'PaymentFailed',
          aggregateType: 'booking',
          aggregateId: bookingId,
          payload: {
            bookingId,
            therapistId: booking.therapistId,
            razorpayOrderId: razorpayOrderId || booking.razorpayOrderId || null,
            reason,
            source
          }
        });

        const releasedEventId = generateDeterministicEventId('booking', bookingId, 'slot_released');
        OutboxService.recordEventInTransaction(transaction, {
          id: releasedEventId,
          name: 'SlotReleased',
          aggregateType: 'booking',
          aggregateId: bookingId,
          payload: {
            bookingId,
            therapistId: booking.therapistId,
            reason,
            source
          }
        });
      }
    });

    // Process outbox events outside transaction for verified non-client failures
    if (shouldSendEmails && therapistId && source !== 'client') {
      const failedEventId = generateDeterministicEventId('booking', bookingId, 'payment_failed');
      const releasedEventId = generateDeterministicEventId('booking', bookingId, 'slot_released');

      await Promise.allSettled([
        OutboxProcessor.processEvent(failedEventId).catch((err) => {
          logger.error('PAYMENT', 'Failed to process PaymentFailed outbox event', { bookingId, error: err });
        }),
        OutboxProcessor.processEvent(releasedEventId).catch((err) => {
          logger.error('PAYMENT', 'Failed to process SlotReleased outbox event', { bookingId, error: err });
        })
      ]);
    }

    return { success: true };
  }
}
