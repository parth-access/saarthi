import {
  collection,
  serverTimestamp,
  getDocs,
  doc,
  getDoc,
  query,
  orderBy,
  where,
  runTransaction,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Booking, BookingStatus, Therapist } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { resendService } from './resendService';
import { mapBooking, mapTherapist } from '../utils/mappers';

const cleanPayload = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(v => cleanPayload(v)).filter(v => v !== undefined);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = cleanPayload(value);
      }
      return acc;
    }, {} as Record<string, any>);
  }
  return obj;
};

export const bookingService = {
  createBooking: async (
    bookingData: Omit<Booking, 'id' | 'createdAt' | 'updatedAt' | 'status'>
  ) => {
    try {
      const cleanedData = cleanPayload(bookingData);
      const slotId = `${cleanedData.therapistId}_${cleanedData.date}_${cleanedData.time}`.replace(/\//g, '-');
      const slotRef = doc(db, 'locked_slots', slotId);
      const newBookingRef = doc(collection(db, 'bookings'));
      const bookingToken = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      await runTransaction(db, async (transaction) => {
        const slotDoc = await transaction.get(slotRef);
        if (slotDoc.exists()) {
           throw new Error("This slot has just been booked. Please select another time.");
        }

        // Lock the slot
        transaction.set(slotRef, {
           bookingId: newBookingRef.id,
           createdAt: serverTimestamp()
        });

        transaction.set(newBookingRef, {
          ...cleanedData,
          status: 'pending' as BookingStatus,
          bookingToken,
          sessionMode: cleanedData.sessionMode || 'Online',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      // Try to send email
      try {
        const therapistSnap = await getDoc(doc(db, 'therapists', bookingData.therapistId));
        if (therapistSnap.exists()) {
          const therapist = mapTherapist(therapistSnap.id, therapistSnap.data());
          const bData = {
            id: newBookingRef.id,
            ...bookingData,
            status: 'pending' as BookingStatus,
            createdAt: null,
            updatedAt: null
          };
          const safeBooking = mapBooking(newBookingRef.id, bData);
          
          if (safeBooking.email && safeBooking.name && safeBooking.date && safeBooking.time) {
             await resendService.sendBookingReceivedEmail(safeBooking, therapist);
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error("Failed to send notification email:", err);
      }

      return { bookingId: newBookingRef.id };
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('Firestore transaction failed:', err);
      handleFirestoreError(err, OperationType.CREATE, 'bookings');
      throw err;
    }
  },

  getBookings: async (): Promise<Booking[]> => {
    try {
      const q = query(
        collection(db, 'bookings'),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);

      const items = snapshot.docs.map((d) => mapBooking(d.id, d.data()));
      
      return items.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, 'bookings');
      return [];
    }
  },

  getBookingsByTherapist: async (therapistId: string): Promise<Booking[]> => {
    try {
      const q = query(
        collection(db, 'bookings'),
        where('therapistId', '==', therapistId)
      );

      const snapshot = await getDocs(q);

      const items = snapshot.docs.map((d) => mapBooking(d.id, d.data()));
      
      return items.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, 'bookings');
      return [];
    }
  },

  getBookingsByDate: async (therapistId: string, date: string): Promise<Booking[]> => {
    try {
      const q = query(
        collection(db, 'bookings'),
        where('therapistId', '==', therapistId),
        where('date', '==', date)
      );

      const snapshot = await getDocs(q);

      return snapshot.docs.map((d) => mapBooking(d.id, d.data()));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, 'bookings');
      return [];
    }
  },

  getBookingByToken: async (token: string): Promise<Booking | null> => {
    try {
      const q = query(
        collection(db, 'bookings'),
        where('bookingToken', '==', token)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      return mapBooking(snapshot.docs[0].id, snapshot.docs[0].data());
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, 'bookings');
      return null;
    }
  },

  updateStatus: async (id: string, status: BookingStatus) => {
    try {
      const ref = doc(db, 'bookings', id);

      await runTransaction(db, async (transaction) => {
        const bookingSnap = await transaction.get(ref);
        if (!bookingSnap.exists()) {
           throw new Error("Booking does not exist");
        }
        const data = bookingSnap.data();

        transaction.update(ref, {
          status,
          updatedAt: serverTimestamp()
        });

        // If cancelled or rejected, release the slot lock
        if (status === 'cancelled' || status === 'rejected') {
           const slotId = `${data.therapistId}_${data.date}_${data.time}`.replace(/\//g, '-');
           const slotRef = doc(db, 'locked_slots', slotId);
           transaction.delete(slotRef);
        }
      });

      if (status === 'confirmed') {
        try {
          const bookingSnap = await getDoc(ref);
          if (bookingSnap.exists()) {
            const booking = mapBooking(bookingSnap.id, bookingSnap.data());
            if (booking.email && booking.name && booking.date && booking.time) {
              const therapistSnap = await getDoc(doc(db, 'therapists', booking.therapistId));
              if (therapistSnap.exists()) {
                const therapist = mapTherapist(therapistSnap.id, therapistSnap.data());
                if (therapist.name) {
                   await resendService.sendBookingConfirmedEmail(booking, therapist);
                }
              }
            }
          }
        } catch (err) {
          if (import.meta.env.DEV) console.error("Failed to send confirmed email:", err);
        }
      }

      return { success: true };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${id}`);
      throw err;
    }
  },

  rescheduleBooking: async (id: string, newDate: string, newTime: string) => {
    try {
      const ref = doc(db, 'bookings', id);
      await runTransaction(db, async (transaction) => {
        const bookingSnap = await transaction.get(ref);
        if (!bookingSnap.exists()) throw new Error("Booking not found");
        
        const data = bookingSnap.data();
        if (data.status === 'cancelled' || data.status === 'rejected') {
          throw new Error("Cannot reschedule a cancelled or rejected booking.");
        }

        const oldSlotId = `${data.therapistId}_${data.date}_${data.time}`.replace(/\//g, '-');
        const oldSlotRef = doc(db, 'locked_slots', oldSlotId);
        
        const newSlotId = `${data.therapistId}_${newDate}_${newTime}`.replace(/\//g, '-');
        const newSlotRef = doc(db, 'locked_slots', newSlotId);

        const newSlotDoc = await transaction.get(newSlotRef);
        if (newSlotDoc.exists()) {
          throw new Error("This new slot is unavailable.");
        }

        transaction.delete(oldSlotRef);
        transaction.set(newSlotRef, {
           bookingId: id,
           createdAt: serverTimestamp()
        });

        transaction.update(ref, {
          originalDate: data.date,
          originalTime: data.time,
          date: newDate,
          time: newTime,
          updatedAt: serverTimestamp(),
          rescheduledAt: serverTimestamp(),
        });
      });

      // Send rescheduled email
      try {
        const bookingSnap = await getDoc(ref);
        if (bookingSnap.exists()) {
          const booking = mapBooking(bookingSnap.id, bookingSnap.data());
          const therapistSnap = await getDoc(doc(db, 'therapists', booking.therapistId));
          if (therapistSnap.exists()) {
            const therapist = mapTherapist(therapistSnap.id, therapistSnap.data());
            await resendService.sendBookingRescheduledEmail(booking, therapist);
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error("Failed to send reschedule emails:", err);
      }

      return { success: true };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${id}`);
      throw err;
    }
  },

  rescheduleByToken: async (token: string, newDate: string, newTime: string) => {
    try {
      const response = await fetch('/api/manage-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newDate, newTime })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to reschedule');
      return data;
    } catch(err: any) {
      console.error(err);
      throw err;
    }
  },

  getBookingByTokenAPIRoute: async (token: string) => {
    try {
      const response = await fetch(`/api/manage-booking?token=${token}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load booking');
      return data;
    } catch(err: any) {
      console.error(err);
      throw err;
    }
  }
};
