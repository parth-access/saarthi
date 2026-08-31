import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { ConfirmPaymentCommand, ConfirmPaymentCommandHandler, razorpayGateway } from '@/domains/payment';
import { logger } from '@/app/api/_lib/logger';
import { sendEmailAction } from '@/app/api/email/emailSender';
import { OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';
import { SlotReservationService } from '../services/SlotReservationService';
import { SlotAlreadyBookedError } from '../errors/SlotAlreadyBookedError';

export class ConfirmBookingCommand implements Command {
  readonly name = 'ConfirmBookingCommand';
  constructor(
    public readonly razorpayPaymentId: string,
    public readonly razorpayOrderId: string,
    public readonly razorpaySignature?: string,
    public readonly source: string = 'direct',
    public readonly expectedBookingId?: string
  ) {}
}

export class ConfirmBookingCommandHandler implements CommandHandler<ConfirmBookingCommand, { success: boolean }> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: ConfirmBookingCommand): Promise<{ success: boolean }> {
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, source, expectedBookingId } = command;

    let shouldSendEmail = false;
    let therapistId = '';
    let bookingId = '';

    // 1. Ground truth Razorpay payment verification if available
    if (razorpayPaymentId && !razorpayPaymentId.startsWith('mock_')) {
      const rzpPayment = await razorpayGateway.fetchPayment(razorpayPaymentId);
      if (rzpPayment) {
        if (rzpPayment.order_id && rzpPayment.order_id !== razorpayOrderId) {
          throw new Error('Razorpay payment order ID does not match expected order');
        }
        if (rzpPayment.status && rzpPayment.status !== 'captured' && rzpPayment.status !== 'authorized') {
          throw new Error(`Razorpay payment status is ${rzpPayment.status}, expected captured or authorized`);
        }
      }
    }

    // 2. Confirm and verify payment in the Payment Domain first to get trusted bookingId
    const confirmPaymentCommand = new ConfirmPaymentCommand(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      source,
      expectedBookingId
    );
    const confirmPaymentHandler = new ConfirmPaymentCommandHandler();
    const result = await confirmPaymentHandler.execute(confirmPaymentCommand); 
    bookingId = result.bookingId;

    if (expectedBookingId && bookingId !== expectedBookingId) {
      throw new Error('Confirmed payment booking ID does not match requested booking ID');
    }

    try {
      await adminDb.runTransaction(async (transaction) => {
        const data = await firestoreBookingRepository.findById(bookingId, transaction);
        if (!data) throw new Error('Booking not found');

        if (expectedBookingId && data.id !== expectedBookingId) {
          throw new Error('Booking ID mismatch');
        }

        if (data.razorpayOrderId !== razorpayOrderId) {
          throw new Error('razorpayOrderId mismatch');
        }

        // Read the permanent slot pin UP-FRONT — before any write in this
        // transaction — so that (a) Firestore's read-before-write ordering is
        // satisfied and (b) concurrent confirmations for the same slot conflict
        // at the Firestore level (the slot ref is now part of the tx read set).
        const slotId = SlotReservationService.getSlotId(data.therapistId, data.date, data.time);
        const slotRef = adminDb.collection('locked_slots').doc(slotId);
        const slotSnap = await transaction.get(slotRef);

        // Idempotent exit: if already paid, return silently without raising error or re-dispatching side-effects
        if (data.paymentStatus === 'paid') {
          return;
        }

        if (data.status === 'confirmed') {
          data.paymentStatus = 'paid';
          data.razorpayPaymentId = razorpayPaymentId;
          const verifiedAt = FieldValue.serverTimestamp();
          data.paymentVerifiedAt = verifiedAt;
          data.updatedAt = verifiedAt;
          await firestoreBookingRepository.save(data, transaction);
          shouldSendEmail = false;
          return;
        }

        if (data.paymentStatus !== 'pending' && data.status !== 'awaiting_payment') {
          throw new Error('Booking is not in a payable state');
        }

        therapistId = data.therapistId;
        shouldSendEmail = true;

        // Double-booking guard: refuse to confirm onto a slot that is already
        // permanently pinned to a DIFFERENT booking. This is the invariant that
        // was previously lost at confirm time — the pin was written with an
        // unconditional `set` and the slot was never read, so two bookings that
        // both survived the hold window could both confirm on one slot.
        const existingSlot = slotSnap?.exists ? (slotSnap.data() || {}) : null;
        if (
          existingSlot &&
          (existingSlot.isPermanent === true || existingSlot.status === 'booked') &&
          existingSlot.bookingId &&
          existingSlot.bookingId !== bookingId
        ) {
          throw new SlotAlreadyBookedError(
            'Slot already confirmed for another booking',
            { bookingId, conflictingBookingId: existingSlot.bookingId, slotId }
          );
        }

        const verifiedAt = FieldValue.serverTimestamp();
        await this.bookingDomainService.confirmPayment(data, verifiedAt, razorpayPaymentId, transaction, { source });
        data.updatedAt = FieldValue.serverTimestamp();

        // Permanently record slot as booked to prevent any race condition
        transaction.set(slotRef, {
          therapistId: data.therapistId,
          date: data.date,
          time: data.time,
          userId: data.userId || data.email,
          bookingId: bookingId,
          status: 'booked',
          isPermanent: true,
          confirmedAt: verifiedAt,
          updatedAt: verifiedAt
        });

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
    } catch (bookingTxErr) {
      // A slot conflict means the payment was captured but the slot is already
      // owned by another confirmed booking. Do NOT confirm (that would double-book);
      // instead flag this captured payment as owing a refund so it is discoverable
      // by ops and, once implemented, the automated refund flow (see P1-1).
      if (bookingTxErr instanceof SlotAlreadyBookedError) {
        logger.error('PAYMENT', 'CRITICAL: double-booking prevented at confirm — captured payment requires refund', bookingTxErr, {
          bookingId,
          razorpayOrderId,
          razorpayPaymentId,
          source,
          conflictingBookingId: (bookingTxErr.metadata?.conflictingBookingId as string | undefined)
        });
        try {
          await adminDb.collection('audit_logs').add({
            eventType: 'REFUND_REQUIRED',
            reason: 'double_booking_prevented',
            bookingId,
            razorpayOrderId,
            razorpayPaymentId,
            conflictingBookingId: (bookingTxErr.metadata?.conflictingBookingId as string | undefined) || null,
            source,
            timestamp: FieldValue.serverTimestamp(),
            details: `Payment captured for booking ${bookingId} but slot was already confirmed for another booking — refund required`
          });
        } catch (auditErr) {
          logger.error('PAYMENT', 'Failed to record REFUND_REQUIRED audit marker after double-booking prevention', auditErr, { bookingId });
        }
        throw bookingTxErr;
      }

      logger.error('PAYMENT', 'CRITICAL: payment captured but booking confirm failed — webhook recovery required', bookingTxErr, {
        bookingId,
        razorpayOrderId,
        razorpayPaymentId,
        source
      });
      throw bookingTxErr;
    }

    // Post-commit outbox processing and payment receipt email dispatch
    const outboxEventId = generateDeterministicEventId('booking', bookingId, 'confirmed');

    const tasks: Promise<unknown>[] = [];

    // 1. Process Outbox Event (triggers EmailListener -> confirmation email, CalendarListener, etc.)
    tasks.push(
      OutboxProcessor.processEvent(outboxEventId)
        .then((result) => {
          if (!result.success) {
            logger.warn('BOOKING', `Outbox event processing status: ${result.status}`, { bookingId, outboxEventId, error: result.error });
          }
        })
        .catch((err) => {
          logger.error('BOOKING', 'Outbox processing error after confirmation', { bookingId, error: err });
        })
    );

    // 2. Send Payment Receipt Email
    if (shouldSendEmail && therapistId) {
      tasks.push(
        sendEmailAction({
          type: 'payment-receipt',
          bookingId: bookingId,
          therapistId: therapistId,
          paymentDetails: {
            paymentId: razorpayPaymentId,
            orderId: razorpayOrderId,
          }
        })
          .then(() => {
            logger.info('EMAIL', 'Payment receipt email sent/queued successfully', { bookingId });
          })
          .catch((err) => {
            logger.error('EMAIL', 'Failed to send payment receipt email', { error: err, bookingId });
          })
      );
    }

    // Await all post-commit tasks so the serverless execution context stays active until delivery completes,
    // while guaranteeing that email/outbox issues never roll back or fail the confirmed booking response.
    await Promise.allSettled(tasks);

    logger.success('PAYMENT', `Payment verified completely via ${source}`, { 
      bookingId, 
      razorpayPaymentId,
      razorpayOrderId,
      therapistId 
    });
    return { success: true };
  }
}

