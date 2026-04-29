import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Booking, BookingStatus } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

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

      return snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Booking, 'id'>)
      }));
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

      return { success: true };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${id}`);
      throw err;
    }
  }
};