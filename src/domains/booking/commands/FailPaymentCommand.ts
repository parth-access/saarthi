import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { logger } from '@/app/api/_lib/logger';
import { OutboxProcessor, OutboxService, generateDeterministicEventId } from '@/shared/events/outbox';
import { SlotReservationService, PinReleasePlan } from '../services/SlotReservationService';
import { runPlannedTransaction } from '@/shared/firestore/transactionPhases';
import { razorpayGateway } from '@/domains/payment/RazorpayGateway';
import type { Booking } from '../entities/Booking';

export class FailPaymentCommand implements Command {
  readonly name = 'FailPaymentCommand';
  constructor(
    public readonly bookingId?: string,
    public readonly razorpayOrderId?: string,
    public readonly reason?: string,
    public readonly source: string = 'client',
    public readonly sessionUid?: string
  ) {}
}

/** READ-phase outcome for failing a payment. */
interface FailPaymentPlan {
  /** Null when the booking is already terminal (confirmed+paid, cancelled, rejected). */
  booking: Booking | null;
  pinRelease: PinReleasePlan | null;
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

    // CLIENT-SOURCE GUARDS — the browser failure report is untrusted input.
    // The webhook path (HMAC-verified) is exempt from these checks.
    if (source === 'client') {
      // 1. The report must be bound to a Razorpay order. A bare bookingId is
      //    not ownership proof — an attacker who learns one must not be able to
      //    fail another user's checkout.
      if (!razorpayOrderId) {
        throw new Error('orderId is required to report a payment failure');
      }

      // 2. Consult Razorpay ground truth: never cancel a checkout whose order
      //    actually captured/authorized money — that is the verify/webhook
      //    path's job. Fail closed if Razorpay is configured but the check
      //    cannot be completed (the hold expires on its own, so refusing is
      //    always safe). Skipped only in dev, when Razorpay is not configured.
      if (razorpayGateway.isConfigured()) {
        const hasSuccessfulPayment = await razorpayGateway.fetchOrderHasSuccessfulPayment(razorpayOrderId);
        if (hasSuccessfulPayment === true) {
          logger.warn('PAYMENT', 'Client-reported failure refused: order has a successful payment', { bookingId, razorpayOrderId });
          throw new Error('A payment for this order has succeeded; failure report refused');
        }
        if (hasSuccessfulPayment === null) {
          logger.warn('PAYMENT', 'Client-reported failure refused: payment state could not be verified', { bookingId, razorpayOrderId });
          throw new Error('Payment state could not be verified with the payment gateway; failure report refused');
        }
      }
    }

    await runPlannedTransaction<FailPaymentPlan, void>(adminDb, {
      // READ PHASE — load the booking, decide idempotency, and resolve the slot
      // pin's ownership. This helper previously happened to be called before the
      // writes here, which is why this path never threw; the phase split makes
      // that ordering structural instead of accidental.
      read: async (reader) => {
        const booking = await firestoreBookingRepository.findById(bookingId, reader);
        if (!booking) {
          throw new Error(`Booking ${bookingId} not found`);
        }

        // CLIENT-SOURCE GUARDS (continued), against the authoritative booking:
        if (source === 'client') {
          // 3. The reported order must be the booking's own order.
          if (booking.razorpayOrderId && razorpayOrderId && booking.razorpayOrderId !== razorpayOrderId) {
            throw new Error('Reported order does not match this booking');
          }

          // 4. A booking that belongs to a real user can only be failed by that
          //    user. Guest bookings (userId 'guest') rely on the order binding +
          //    gateway checks above.
          if (booking.userId && booking.userId !== 'guest' && command.sessionUid !== booking.userId) {
            logger.warn('PAYMENT', 'Client-reported failure refused: caller does not own the booking', { bookingId });
            throw new Error('Not authorized to report a payment failure for this booking');
          }
        }

        // If already confirmed and paid, do not cancel
        if (booking.status === 'confirmed' && booking.paymentStatus === 'paid') {
          logger.warn('PAYMENT', 'Attempted to fail an already confirmed booking', { bookingId });
          return { booking: null, pinRelease: null };
        }

        // If already cancelled or rejected, operation is idempotent
        if (booking.status === 'cancelled' || booking.status === 'rejected') {
          return { booking: null, pinRelease: null };
        }

        const pinRelease = await SlotReservationService.readPinReleasePlan(
          reader,
          booking.therapistId,
          booking.date,
          booking.time,
          bookingId
        );

        return { booking, pinRelease };
      },

      // WRITE PHASE — no reads are reachable through `writer`.
      write: async (writer, plan) => {
        const booking = plan.booking;
        if (!booking || !plan.pinRelease) return;

        therapistId = booking.therapistId;
        shouldSendEmails = true;

        // Update booking state
        booking.failPayment(reason);
        booking.updatedAt = FieldValue.serverTimestamp();

        // Release slot lock ONLY if this slot lock doc belongs to this booking
        SlotReservationService.applyPinRelease(writer, plan.pinRelease);

        await firestoreBookingRepository.save(booking, writer);

        // Audit logs
        const auditPaymentRef = adminDb.collection('audit_logs').doc();
        writer.set(auditPaymentRef, {
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
        writer.set(auditSlotRef, {
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
          await OutboxService.recordEventInTransaction(writer, {
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
          await OutboxService.recordEventInTransaction(writer, {
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
      },
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
