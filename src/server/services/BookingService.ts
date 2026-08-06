import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { bookingSchema } from '../validators/bookingValidators';
import crypto from 'crypto';
import Razorpay from "razorpay";
import { config } from "@/shared/config";
import { firestoreBookingRepository, Booking } from '@/domains/booking';

export class BookingService {
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

    const { bookingData } = await adminDb.runTransaction(async (t) => {
      const data = await firestoreBookingRepository.findById(bookingId, t);
      if (!data) throw new Error("Booking not found");

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

      data.reschedule(newDate, newTime, FieldValue.serverTimestamp(), utcDateTime || undefined);
      await firestoreBookingRepository.save(data, t);

      const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
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
    return firestoreBookingRepository.findAll();
  }

  static async getBookingsByTherapist(therapistId: string) {
    return firestoreBookingRepository.findByTherapistId(therapistId);
  }
}