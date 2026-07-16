import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { bookingSchema } from '../validators/bookingValidators';
import crypto from 'crypto';
import Razorpay from "razorpay";
import { config } from "@/shared/config";

export class BookingService {
  /**
   * Core logic for creating a booking transaction.
   */
  static async createBooking(
    bookingData: z.infer<typeof bookingSchema>,
    userId: string,
    email: string
  ) {
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
    const newBookingRef = adminDb.collection('bookings').doc();
    const bookingToken = crypto.randomUUID() + crypto.randomUUID();

    let price = 1500;
    if (data.sessionMode === 'in_person') price = 2000;
    const amount = price;
    const currency = "INR";

    const rzp = new Razorpay({
      key_id: config.razorpay.keyId || "rzp_test_placeholder",
      key_secret: config.razorpay.keySecret || "placeholder"
    });

    const order = await rzp.orders.create({
      amount: amount * 100,
      currency,
      receipt: `receipt_${newBookingRef.id}`,
      notes: {
         bookingId: newBookingRef.id,
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
          throw new Error("This slot is already booked.");
        } else if (slotData?.lockId && slotData.lockId !== lockId) {
          throw new Error("This slot is currently locked by another user.");
        }
      }
      
      t.set(slotRef, {
        therapistId: data.therapistId,
        date: data.date,
        time: data.time,
        bookingId: newBookingRef.id,
        createdAt: FieldValue.serverTimestamp()
      });

      t.set(newBookingRef, {
        ...data,
        email, 
        userId,
        utcDateTime,
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        paymentAmount: amount,
        paymentCurrency: currency,
        razorpayOrderId: order.id,
        bookingToken,
        sessionMode: data.sessionMode || 'Online',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      const auditRef = adminDb.collection('bookings').doc(newBookingRef.id).collection('audit_logs').doc();
      t.set(auditRef, {
        action: 'created',
        timestamp: FieldValue.serverTimestamp(),
        details: 'Booking requested by patient and awaiting payment',
        userId
      });
    });

    return { bookingId: newBookingRef.id };
  }

  /**
   * Unified, authoritative reschedule transactional logic.
   */
  static async rescheduleBooking(
    bookingId: string,
    newDate: string,
    newTime: string,
    session: { uid?: string; role?: string; isTokenFlow?: boolean }
  ) {
    let utcDateTime = '';
    try {
      const localString = `${newDate}T${newTime}`;
      const dt = new Date(localString);
      utcDateTime = isNaN(dt.getTime()) ? '' : dt.toISOString();
    } catch {}

    const ref = adminDb.collection('bookings').doc(bookingId);

    const { bookingData } = await adminDb.runTransaction(async (t) => {
      const doc = await t.get(ref);
      if (!doc.exists) throw new Error("Booking not found");
      const data = doc.data()!;

      if (session.role === 'therapist') {
        const therapistDoc = await t.get(adminDb.collection('therapists').doc(data.therapistId));
        if (!therapistDoc.exists || therapistDoc.data()?.authId !== session.uid) {
          throw new Error("Unauthorized to modify this booking");
        }
      }

      if (data.status === 'cancelled' || data.status === 'rejected') {
        throw new Error("Cannot reschedule a cancelled or rejected booking.");
      }

      const oldSlotId = `${data.therapistId}_${data.date}_${data.time}`.replace(/\//g, '-');
      const oldSlotRef = adminDb.collection('locked_slots').doc(oldSlotId);

      const newSlotId = `${data.therapistId}_${newDate}_${newTime}`.replace(/\//g, '-');
      const newSlotRef = adminDb.collection('locked_slots').doc(newSlotId);

      const newSlotDoc = await t.get(newSlotRef);
      if (newSlotDoc.exists) {
        const slotData = newSlotDoc.data()!;
        if (slotData?.expiresAt) {
          const expiresAtDate = typeof slotData.expiresAt.toDate === 'function' 
            ? slotData.expiresAt.toDate() 
            : typeof slotData.expiresAt.toMillis === 'function'
            ? new Date(slotData.expiresAt.toMillis())
            : new Date(slotData.expiresAt);
          if (expiresAtDate < new Date()) {
            t.delete(newSlotRef);
          } else if ('bookingId' in slotData) {
            throw new Error("This new slot is already booked.");
          } else {
            throw new Error("This new slot is unavailable.");
          }
        } else if ('bookingId' in slotData) {
          throw new Error("This new slot is already booked.");
        } else {
          throw new Error("This new slot is unavailable.");
        }
      }

      t.delete(oldSlotRef);
      t.set(newSlotRef, {
        therapistId: data.therapistId,
        date: newDate,
        time: newTime,
        bookingId,
        createdAt: FieldValue.serverTimestamp()
      });

      const updateData: Record<string, string | FieldValue> = {
        originalDate: data.date,
        originalTime: data.time,
        date: newDate,
        time: newTime,
        updatedAt: FieldValue.serverTimestamp(),
        rescheduledAt: FieldValue.serverTimestamp(),
      };
      if (utcDateTime) {
        updateData.utcDateTime = utcDateTime;
      }
      t.update(ref, updateData);

      const auditRef = ref.collection('audit_logs').doc();
      t.set(auditRef, {
        action: 'rescheduled',
        timestamp: FieldValue.serverTimestamp(),
        details: session.isTokenFlow 
          ? `Booking rescheduled via manage link from ${data.date} ${data.time} to ${newDate} ${newTime}`
          : `Booking rescheduled from ${data.date} ${data.time} to ${newDate} ${newTime}`,
        userId: session.uid || 'system-token-flow'
      });

      return { bookingData: data };
    });

    return bookingData;
  }
    static async getBookings() {
    const snapshot = await adminDb.collection('bookings').orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  static async getBookingsByTherapist(therapistId: string) {
    const snapshot = await adminDb.collection('bookings')
      .where('therapistId', '==', therapistId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
}