import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { BookingStateMachine } from '../state/BookingStateMachine';
import { CreatePaymentOrderCommand, CreatePaymentOrderCommandHandler } from '@/domains/payment';
import { SlotReservationService } from '../services/SlotReservationService';
import { logger } from '@/app/api/_lib/logger';

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

      const isAwaiting = txData.status === 'awaiting_payment';
      const canTransitionToAwaiting = BookingStateMachine.canTransition(txData.status, 'awaiting_payment');

      if (!isAwaiting && !canTransitionToAwaiting) {
        throw new Error('Booking is not in a valid state to create a payment order');
      }

      // Re-use existing valid order ID if present (Idempotency requirement)
      if (txData.razorpayOrderId) {
        existingOrderId = txData.razorpayOrderId;
        let price = 1500;
        if (txData.sessionMode === 'in_person') price = 2000;
        amount = txData.paymentAmount || price;
        return;
      }

      // Prevent concurrent order creation race
      if (txData.orderCreationInProgress) {
        throw new Error('Payment order creation is already in progress. Please try again.');
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

      let price = 1500;
      if (txData.sessionMode === 'in_person') price = 2000;
      amount = txData.paymentAmount || price;
      therapistId = txData.therapistId;
      email = txData.email;

      txData.orderCreationInProgress = true;

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

    // PHASE 2: Create Razorpay order (outside transaction, only after Phase 1 succeeds)
    let orderId = '';
    try {
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
    } catch (error) {
      try {
        await adminDb.collection('bookings').doc(bookingId).update({ orderCreationInProgress: false });
      } catch {}
      logger.error('PAYMENT', 'Failed to create Razorpay order', error);
      throw new Error('Failed to initialize payment gateway.');
    }

    // PHASE 3: Persist razorpayOrderId safely on the validated booking and reset in-progress flag
    try {
      await adminDb.runTransaction(async (transaction) => {
        const txData = await firestoreBookingRepository.findById(bookingId, transaction);
        if (!txData) throw new Error('Booking not found');

        txData.paymentStatus = 'pending';
        txData.paymentAmount = amount;
        txData.paymentCurrency = currency;
        txData.razorpayOrderId = orderId;
        txData.orderCreationInProgress = false;
        txData.updatedAt = FieldValue.serverTimestamp();

        await firestoreBookingRepository.save(txData, transaction);
      });
    } catch (error) {
      logger.error('PAYMENT', 'Failed to persist Razorpay order ID in Firestore', error);
      try {
        await adminDb.collection('bookings').doc(bookingId).update({ orderCreationInProgress: false });
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
