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
import { SlotReservationService } from '../services/SlotReservationService';

export class CreateBookingCommand implements Command {
  readonly name = 'CreateBookingCommand';
  constructor(
    public readonly bookingData: z.infer<typeof bookingSchema>,
    public readonly userId: string,
    public readonly email: string
  ) {}
}

export class CreateBookingCommandHandler implements CommandHandler<CreateBookingCommand, { bookingId: string }> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: CreateBookingCommand): Promise<{ bookingId: string }> {
    const { bookingData, userId, email } = command;
    const { lockId, ...data } = bookingData;

    const therapistDoc = await adminDb.collection('therapists').doc(data.therapistId).get();
    if (!therapistDoc.exists) {
      throw new Error('Therapist not found');
    }

    let utcDateTime = '';
    try {
      const localString = `${data.date}T${data.time}`;
      const dt = new Date(localString);
      utcDateTime = isNaN(dt.getTime()) ? '' : dt.toISOString();
    } catch {}

    const slotId = SlotReservationService.getSlotId(data.therapistId, data.date, data.time);
    const slotRef = adminDb.collection('locked_slots').doc(slotId);
    const newBookingId = firestoreBookingRepository.generateId();
    const bookingToken = crypto.randomUUID() + crypto.randomUUID();

    let price = 1500;
    if (data.sessionMode === 'in_person') price = 2000;
    const amount = price;
    const currency = 'INR';

    // Delegate Razorpay order generation to the Payment domain
    const createPaymentOrderCommand = new CreatePaymentOrderCommand(
      newBookingId,
      data.therapistId,
      amount,
      currency,
      email
    );
    const createPaymentOrderHandler = new CreatePaymentOrderCommandHandler();
    const order = await createPaymentOrderHandler.execute(createPaymentOrderCommand);

    await adminDb.runTransaction(async (t) => {
      const doc = await t.get(slotRef);
      if (doc.exists) {
        SlotReservationService.validateLockForTransaction(doc.data(), lockId);
      }

      t.set(slotRef, {
        therapistId: data.therapistId,
        date: data.date,
        time: data.time,
        bookingId: newBookingId,
        createdAt: FieldValue.serverTimestamp()
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
        razorpayOrderId: order.orderId,
        bookingToken,
        sessionMode: data.sessionMode || 'Online',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      await this.bookingDomainService.awaitPayment(booking, t);
    });

    return { bookingId: newBookingId };
  }
}
