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
import { mapBooking, mapTherapist } from '../utils/mappers';

export const bookingService = {
  createBooking: async (
    bookingData: Omit<Booking, 'id' | 'createdAt' | 'updatedAt' | 'status'>
  ) => {
    try {
      console.log("Creating booking with data:", bookingData);
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
          const therapist = mapTherapist(therapistSnap.id, therapistSnap.data());
          // Prepare a safe booking object from our payload
          const bData = {
            id: docRef.id,
            ...bookingData,
            status: 'pending' as BookingStatus,
            createdAt: null,
            updatedAt: null
          };
          const safeBooking = mapBooking(docRef.id, bData);
          
          if (!safeBooking.email || !safeBooking.name || !safeBooking.date || !safeBooking.time) {
             console.warn("Skipping 'Booking Received' email. Missing required booking fields:", { safeBooking });
          } else {
             await resendService.sendBookingReceivedEmail(safeBooking, therapist);
          }
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
            const booking = mapBooking(bookingSnap.id, bookingSnap.data());
            if (!booking.email || !booking.name || !booking.date || !booking.time) {
               console.warn("Skipping 'Booking Confirmed' email. Missing required booking fields.", { booking });
               return { success: true };
            }
            const therapistSnap = await getDoc(doc(db, 'therapists', booking.therapistId));
            if (therapistSnap.exists()) {
              const therapist = mapTherapist(therapistSnap.id, therapistSnap.data());
              if (!therapist.name) {
                 console.warn("Skipping 'Booking Confirmed' email. Missing therapist name.", { therapist });
                 return { success: true };
              }
              console.log("SENDING EMAIL WITH PAYLOAD", { booking, therapist });
              await resendService.sendBookingConfirmedEmail(booking, therapist);
            } else {
               console.warn("Skipping 'Booking Confirmed' email. Therapist not found for ID:", booking.therapistId);
            }
          } else {
             console.warn("Skipping 'Booking Confirmed' email. Booking not found for ID:", id);
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