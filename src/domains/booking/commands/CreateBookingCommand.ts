import { Command, CommandHandler } from './types';
import { z } from 'zod';
import { bookingSchema } from '@/server/validators/bookingValidators';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { CreatePaymentOrderCommand, CreatePaymentOrderCommandHandler } from '@/domains/payment';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { Booking } from '../entities/Booking';
import { BookingDomainService } from '../services/BookingDomainService';
import { OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';
import { istToUtcIsoString } from '@/shared/utils/dateTime';

export class CreateBookingCommand implements Command {
  readonly name = 'CreateBookingCommand';
  constructor(
    public readonly bookingData: z.infer<typeof bookingSchema>,
    public readonly userId: string,
    public readonly email: string
  ) {}
}

export class CreateBookingCommandHandler implements CommandHandler<CreateBookingCommand, { bookingId: string; orderId: string; amount: number; currency: string }> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: CreateBookingCommand): Promise<{ bookingId: string; orderId: string; amount: number; currency: string }> {
    const { bookingData, userId, email } = command;
    const { lockId, ...data } = bookingData;

    const therapistDoc = await adminDb.collection('therapists').doc(data.therapistId).get();
    if (!therapistDoc.exists) {
      throw new Error('Therapist not found');
    }

    const utcDateTime = istToUtcIsoString(data.date, data.time);

    const slotId = `${data.therapistId}_${data.date}_${data.time}`.replace(/\//g, '-');
    const slotRef = adminDb.collection('locked_slots').doc(slotId);

    const newBookingId = firestoreBookingRepository.generateId();
    const bookingToken = crypto.randomUUID() + crypto.randomUUID();

    let price = 1500;
    if (data.sessionMode === 'in_person') price = 2000;
    const amount = price;
    const currency = 'INR';

    const holdExpiresAtDate = new Date(Date.now() + 10 * 60 * 1000);

    await adminDb.runTransaction(async (t) => {
      const doc = await t.get(slotRef);
      if (doc.exists) {
        const slotData = doc.data();
        let isExpired = false;
        if (slotData?.expiresAt) {
          const expiresDate = typeof slotData.expiresAt.toDate === 'function' 
            ? slotData.expiresAt.toDate() 
            : new Date(slotData.expiresAt);
          if (expiresDate < new Date()) {
            isExpired = true;
          }
        }
        
        if (isExpired) {
          t.delete(slotRef);
        } else if (slotData?.bookingId) {
          throw new Error('This slot is already booked.');
        } else if (slotData?.lockId && lockId && slotData.lockId !== lockId) {
          throw new Error('This slot is currently reserved by another user.');
        }
      }

      const activeLockId = lockId || crypto.randomUUID();
      t.set(slotRef, {
        therapistId: data.therapistId,
        date: data.date,
        time: data.time,
        userId: userId || email,
        lockId: activeLockId,
        bookingId: newBookingId,
        expiresAt: holdExpiresAtDate,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      const age = data.age !== undefined ? (typeof data.age === 'string' ? parseInt(data.age, 10) : data.age) : undefined;

      const booking = new Booking({
        ...data,
        age,
        id: newBookingId,
        email,
        userId,
        utcDateTime,
        status: 'draft',
        paymentStatus: 'pending',
        paymentAmount: amount,
        paymentCurrency: currency,
        holdExpiresAt: holdExpiresAtDate,
        bookingToken,
        sessionMode: data.sessionMode || 'Online',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      await this.bookingDomainService.awaitPayment(booking, t);

      const auditRef = adminDb.collection('audit_logs').doc();
      t.set(auditRef, {
        eventType: 'SLOT_HELD',
        bookingId: newBookingId,
        therapistId: data.therapistId,
        date: data.date,
        time: data.time,
        userId: userId || email,
        lockId: activeLockId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        timestamp: FieldValue.serverTimestamp(),
        details: `Slot reserved for 10 minutes for booking ${newBookingId}`
      });

      const auditPaymentRef = adminDb.collection('audit_logs').doc();
      t.set(auditPaymentRef, {
        eventType: 'PAYMENT_INITIATED',
        bookingId: newBookingId,
        therapistId: data.therapistId,
        amount,
        currency,
        userId: userId || email,
        timestamp: FieldValue.serverTimestamp(),
        details: `Payment initiated for booking ${newBookingId}`
      });
    });

    let orderId = '';
    try {
      const createPaymentOrderCommand = new CreatePaymentOrderCommand(
        newBookingId,
        data.therapistId,
        amount,
        currency,
        email
      );
      const createPaymentOrderHandler = new CreatePaymentOrderCommandHandler();
      const order = await createPaymentOrderHandler.execute(createPaymentOrderCommand);
      orderId = order.orderId;
      
      await adminDb.collection('bookings').doc(newBookingId).update({
        razorpayOrderId: orderId
      });

      // Process outbox event post-commit
      const outboxEventId = generateDeterministicEventId('booking', newBookingId, 'awaiting_payment');
      OutboxProcessor.processEvent(outboxEventId).catch((err) => {
        console.error('[CreateBookingCommandHandler] Async outbox processing error:', err);
      });
    } catch {
      // Compensating transaction (perform all reads before writes)
      await adminDb.runTransaction(async (t) => {
        const doc = await t.get(slotRef);
        
        const bookingRef = adminDb.collection('bookings').doc(newBookingId);
        t.delete(bookingRef);
        
        if (doc.exists && doc.data()?.bookingId === newBookingId) {
          t.delete(slotRef);
        }

        const outboxRef = adminDb.collection('outbox_events').doc(generateDeterministicEventId('booking', newBookingId, 'awaiting_payment'));
        t.delete(outboxRef);
        
        const auditRef = adminDb.collection('audit_logs').doc();
        t.set(auditRef, {
          eventType: 'BOOKING_CREATION_FAILED',
          bookingId: newBookingId,
          details: 'Razorpay order creation failed. Compensating transaction executed.',
          timestamp: FieldValue.serverTimestamp()
        });
      });
      throw new Error('Failed to initialize payment gateway.');
    }

    return { 
      bookingId: newBookingId,
      orderId,
      amount,
      currency
    };
  }
}

