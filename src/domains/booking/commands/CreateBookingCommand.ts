import { Command, CommandHandler } from './types';
import { z } from 'zod';
import { bookingSchema } from '@/server/validators/bookingValidators';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { config } from '@/shared/config';
import { firestoreBookingRepository, Booking, BookingDomainService } from '@/domains/booking';

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

    const slotId = `${data.therapistId}_${data.date}_${data.time}`.replace(/\//g, '-');
    const slotRef = adminDb.collection('locked_slots').doc(slotId);
    const newBookingId = firestoreBookingRepository.generateId();
    const bookingToken = crypto.randomUUID() + crypto.randomUUID();

    let price = 1500;
    if (data.sessionMode === 'in_person') price = 2000;
    const amount = price;
    const currency = 'INR';

    const rzp = new Razorpay({
      key_id: config.razorpay.keyId || 'rzp_test_placeholder',
      key_secret: config.razorpay.keySecret || 'placeholder'
    });

    const order = await rzp.orders.create({
      amount: amount * 100,
      currency,
      receipt: `receipt_${newBookingId}`,
      notes: {
        bookingId: newBookingId,
        therapistId: data.therapistId
      }
    });

    await adminDb.runTransaction(async (t) => {
      const doc = await t.get(slotRef);
      if (doc.exists) {
        const slotData = doc.data();
        if (slotData?.expiresAt && slotData.expiresAt.toDate() < new Date()) {
          t.delete(slotRef);
        } else if (slotData?.bookingId) {
          throw new Error('This slot is already booked.');
        } else if (slotData?.lockId && slotData.lockId !== lockId) {
          throw new Error('This slot is currently locked by another user.');
        }
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
        razorpayOrderId: order.id,
        bookingToken,
        sessionMode: data.sessionMode || 'Online',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      await this.bookingDomainService.awaitPayment(booking, t);

      const auditRef = adminDb.collection('bookings').doc(newBookingId).collection('audit_logs').doc();
      t.set(auditRef, {
        action: 'created',
        timestamp: FieldValue.serverTimestamp(),
        details: 'Booking requested by patient and awaiting payment',
        userId
      });
    });

    return { bookingId: newBookingId };
  }
}
