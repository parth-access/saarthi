import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  query,
  orderBy,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Booking, BookingStatus, Therapist } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { resendService } from './resendService';

export const bookingService = {
  createBooking: async (
    bookingData: Omit<Booking, 'id' | 'createdAt' | 'updatedAt' | 'status'>
  ) => {
    try {
      const docRef = await addDoc(collection(db, 'bookings'), {
        ...bookingData,
        status: 'pending' as BookingStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Try to send email
      try {
        const therapistSnap = await getDoc(doc(db, 'therapists', bookingData.therapistId));
        if (therapistSnap.exists()) {
          const therapist = { id: therapistSnap.id, ...therapistSnap.data() } as Therapist;
          await resendService.sendBookingReceivedEmail({ id: docRef.id, ...bookingData, status: 'pending', createdAt: null }, therapist);
        }
      } catch (err) {
        console.error("Failed to send notification email:", err);
      }

      return { bookingId: docRef.id };
    } catch (err: any) {
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

      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Booking, 'id'>)
      }));
      
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

      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Booking, 'id'>)
      }));
      
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

      return snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Booking, 'id'>)
      }));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, 'bookings');
      return [];
    }
  },

  updateStatus: async (id: string, status: BookingStatus) => {
    try {
      const ref = doc(db, 'bookings', id);

      await updateDoc(ref, {
        status,
        updatedAt: serverTimestamp()
      });

      if (status === 'confirmed') {
        try {
          const bookingSnap = await getDoc(ref);
          if (bookingSnap.exists()) {
            const booking = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;
            const therapistSnap = await getDoc(doc(db, 'therapists', booking.therapistId));
            if (therapistSnap.exists()) {
              const therapist = { id: therapistSnap.id, ...therapistSnap.data() } as Therapist;
              await resendService.sendBookingConfirmedEmail(booking, therapist);
            }
          }
        } catch (err) {
          console.error("Failed to send confirmed email:", err);
        }
      }

      return { success: true };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${id}`);
      throw err;
    }
  }
};