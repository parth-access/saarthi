import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { BookingStateMachine } from '../state/BookingStateMachine';
import { CreatePaymentOrderCommand, CreatePaymentOrderCommandHandler, firestorePaymentRepository, razorpayGateway, Payment } from '@/domains/payment';
import { SlotReservationService } from '../services/SlotReservationService';
import { logger } from '@/app/api/_lib/logger';
import { calculateBookingPrice } from '../utils/pricing';

export class GeneratePaymentLinkCommand implements Command {
  readonly name = 'GeneratePaymentLinkCommand';
  constructor(public readonly bookingId: string) {}
}

export class GeneratePaymentLinkCommandHandler implements CommandHandler<GeneratePaymentLinkCommand, { success: boolean; orderId?: string; amount?: number; currency?: string }> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: GeneratePaymentLinkCommand): Promise<{ success: boolean; orderId?: string; amount?: number; currency?: string }> {
    const { bookingId } = command;

    let therapistId = '';
    let email = '';
    let amount = 1500;
    const currency = 'INR';
    let existingOrderId: string | undefined;

    // PHASE 1: Validate slot and booking state atomically in a transaction BEFORE calling Razorpay
    await adminDb.runTransaction(async (transaction) => {
      const txData = await firestoreBookingRepository.findById(bookingId, transaction);
      if (!txData) {
        throw new Error('Booking not found');
      }

      if (txData.paymentStatus === 'paid' || txData.status === 'confirmed' || txData.status === 'completed') {
        throw new Error('Payment is already completed for this booking.');
      }

      // A settled booking must never be resurrected by generating a payment order.
      //
      // `BookingStateMachine` intentionally still *permits* cancelled/expired →
      // awaiting_payment (it is a mechanical transition table, and the entity-level
      // recovery transition is asserted in BookingStateMachine.test.ts). But the
      // slot pin for a settled booking has already been released by
      // `SlotReservationService.applyPinRelease`, and this handler only *checks*
      // `locked_slots` for a conflicting bookingId — it never re-reserves. Reviving
      // such a booking would therefore hand the client a payment order for a slot
      // nobody is holding, so a concurrent booker can take it and both end up paid
      // for the same time. Payment in this product is upfront-only; a stale unpaid
      // booking is re-created via the booking wizard, not re-paid in place.
      const SETTLED_STATUSES = ['cancelled', 'rejected', 'expired', 'no_show'];
      const normalizedStatus = BookingStateMachine.normalizeStatus(txData.status);
      if (SETTLED_STATUSES.includes(normalizedStatus)) {
        throw new Error('Booking is not in a valid state to create a payment order');
      }

      const isAwaiting = txData.status === 'awaiting_payment';
      const canTransitionToAwaiting = BookingStateMachine.canTransition(txData.status, 'awaiting_payment');

      if (!isAwaiting && !canTransitionToAwaiting) {
        throw new Error('Booking is not in a valid state to create a payment order');
      }

      // Re-use existing valid order ID if present (Idempotency requirement)
      if (txData.razorpayOrderId) {
        existingOrderId = txData.razorpayOrderId;
        amount = txData.paymentAmount ?? calculateBookingPrice(txData.sessionMode);
        txData.paymentAmount = amount;
        if (txData.status !== 'awaiting_payment' && canTransitionToAwaiting) {
          txData.awaitPayment({ skipEventBus: true });
          await firestoreBookingRepository.save(txData, transaction);
        }
        return;
      }

      // Check if an orphaned payment record was already created in payments collection
      const existingPayment = await firestorePaymentRepository.findByBookingId(bookingId, transaction);
      if (existingPayment?.razorpayOrderId) {
        existingOrderId = existingPayment.razorpayOrderId;
        amount = txData.paymentAmount ?? existingPayment.amount ?? calculateBookingPrice(txData.sessionMode);

        // Repair booking entity state
        txData.razorpayOrderId = existingOrderId;
        txData.paymentStatus = 'pending';
        txData.paymentAmount = amount;
        txData.paymentCurrency = currency;
        txData.orderCreationInProgress = false;
        delete txData.orderCreationStartedAt;
        await firestoreBookingRepository.save(txData, transaction);
        return;
      }

      // Prevent concurrent order creation race, but recover if lock is stale (> 60s)
      if (txData.orderCreationInProgress) {
        const LOCK_TIMEOUT_MS = 60000;
        const now = Date.now();
        let startTime = 0;
        const startedAt = txData.orderCreationStartedAt;

        type FirestoreTimestampLike = { toDate?: () => Date; toMillis?: () => number; _seconds?: number };
        if (typeof startedAt === 'number') {
          startTime = startedAt;
        } else if (startedAt && typeof (startedAt as FirestoreTimestampLike).toDate === 'function') {
          startTime = (startedAt as FirestoreTimestampLike).toDate!().getTime();
        } else if (startedAt && typeof (startedAt as FirestoreTimestampLike).toMillis === 'function') {
          startTime = (startedAt as FirestoreTimestampLike).toMillis!();
        } else if (startedAt && typeof (startedAt as FirestoreTimestampLike)._seconds === 'number') {
          startTime = (startedAt as FirestoreTimestampLike)._seconds! * 1000;
        } else if (startedAt instanceof Date) {
          startTime = startedAt.getTime();
        }

        const isStale = !startTime || (now - startTime > LOCK_TIMEOUT_MS);
        if (!isStale) {
          throw new Error('Payment order creation is already in progress. Please try again.');
        }

        logger.warn('PAYMENT', 'Recovering stale order creation lock', { bookingId, startTime, now });
      }

      if (txData.therapistId && txData.date && txData.time) {
        const slotId = SlotReservationService.getSlotId(txData.therapistId, txData.date, txData.time);
        const slotRef = adminDb.collection('locked_slots').doc(slotId);
        const slotDoc = await transaction.get(slotRef);

        if (slotDoc.exists) {
          const slotData = slotDoc.data();
          if (slotData?.bookingId && slotData.bookingId !== bookingId) {
            throw new Error('This slot is already booked by another user.');
          }
        }
      }

      amount = txData.paymentAmount ?? calculateBookingPrice(txData.sessionMode);
      txData.paymentAmount = amount;
      therapistId = txData.therapistId;
      email = txData.email;

      txData.orderCreationInProgress = true;
      txData.orderCreationStartedAt = Date.now();

      const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
      transaction.set(auditRef, {
        action: 'awaiting_payment',
        timestamp: FieldValue.serverTimestamp(),
        details: 'Payment order initialization'
      });

      if (txData.status !== 'awaiting_payment') {
        await this.bookingDomainService.awaitPayment(txData, transaction);
      } else {
        await firestoreBookingRepository.save(txData, transaction);
      }
    });

    if (existingOrderId) {
      logger.info('PAYMENT', 'Reusing existing Razorpay order ID', { bookingId, orderId: existingOrderId });
      return {
        success: true,
        orderId: existingOrderId,
        amount,
        currency
      };
    }

    // PHASE 2: Create or recover Razorpay order (outside transaction, only after Phase 1 succeeds)
    let orderId = '';
    try {
      const receipt = `receipt_${bookingId}`;
      const existingRzpOrder = await razorpayGateway.findOrderByReceipt?.(receipt);

      if (existingRzpOrder) {
        const receiptMatches = existingRzpOrder.receipt === receipt;
        const amountMatches = existingRzpOrder.amount === amount * 100; // in paise
        const currencyMatches = (existingRzpOrder.currency || '').toUpperCase() === currency.toUpperCase();
        const notesBookingIdMatches = existingRzpOrder.notes?.bookingId === bookingId;

        if (receiptMatches && amountMatches && currencyMatches && notesBookingIdMatches) {
          logger.info('PAYMENT', 'Recovered existing Razorpay order from gateway by receipt', { bookingId, orderId: existingRzpOrder.id });
          orderId = existingRzpOrder.id;

          const recoveredPayment = new Payment({
            id: orderId,
            bookingId,
            therapistId,
            patientEmail: email,
            amount,
            currency,
            razorpayOrderId: orderId,
            status: 'pending',
            createdAt: new Date(),
          });
          await firestorePaymentRepository.save(recoveredPayment);
        } else {
          logger.warn('PAYMENT', 'Razorpay order found by receipt failed security verification', {
            bookingId,
            existingRzpOrder,
            expected: { receipt, amount: amount * 100, currency, bookingId }
          });
        }
      }

      if (!orderId) {
        const createPaymentOrderCommand = new CreatePaymentOrderCommand(
          bookingId,
          therapistId,
          amount,
          currency,
          email
        );
        const createPaymentOrderHandler = new CreatePaymentOrderCommandHandler();
        const order = await createPaymentOrderHandler.execute(createPaymentOrderCommand);
        orderId = order.orderId;
      }
    } catch (error) {
      try {
        await adminDb.collection('bookings').doc(bookingId).update({
          orderCreationInProgress: false,
          orderCreationStartedAt: FieldValue.delete()
        });
      } catch {}
      logger.error('PAYMENT', 'Failed to create or recover Razorpay order', error);
      throw new Error('Failed to initialize payment gateway.');
    }

    // PHASE 3: Persist razorpayOrderId safely on the validated booking and reset in-progress flag
    try {
      await adminDb.runTransaction(async (transaction) => {
        const txData = await firestoreBookingRepository.findById(bookingId, transaction);
        if (!txData) throw new Error('Booking not found');

        // Precondition check: if already confirmed/paid, do not overwrite status/paymentStatus
        if (txData.status === 'confirmed' || txData.paymentStatus === 'paid' || txData.status === 'completed') {
          // Reset the progress flag but do not clobber confirmed state
          txData.orderCreationInProgress = false;
          delete txData.orderCreationStartedAt;
          // Store order ID anyway for completeness and reference
          if (!txData.razorpayOrderId) {
            txData.razorpayOrderId = orderId;
          }
          await firestoreBookingRepository.save(txData, transaction);
          return;
        }

        txData.paymentStatus = 'pending';
        txData.paymentAmount = amount;
        txData.paymentCurrency = currency;
        txData.razorpayOrderId = orderId;
        txData.orderCreationInProgress = false;
        delete txData.orderCreationStartedAt;
        txData.updatedAt = FieldValue.serverTimestamp();

        await firestoreBookingRepository.save(txData, transaction);
      });
    } catch (error) {
      logger.error('PAYMENT', 'Failed to persist Razorpay order ID in Firestore', error);
      try {
        await adminDb.collection('bookings').doc(bookingId).update({
          orderCreationInProgress: false,
          orderCreationStartedAt: FieldValue.delete()
        });
      } catch {}
      throw new Error('Failed to save payment order information.');
    }

    logger.success('PAYMENT', 'Created Razorpay order successfully', { bookingId, orderId });

    return { 
      success: true, 
      orderId,
      amount,
      currency
    };
  }
}
