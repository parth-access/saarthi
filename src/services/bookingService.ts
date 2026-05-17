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
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase/client';
import { Booking, BookingStatus, Therapist } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { resendService } from './resendService';
import { mapBooking, mapTherapist } from '../utils/mappers';
import { logger } from '../utils/logger';

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
  lockSlot: async (therapistId: string, date: string, time: string) => {
    try {
      const slotId = `${therapistId}_${date}_${time}`.replace(/\//g, '-');
      const slotRef = doc(db, 'locked_slots', slotId);
      
      const lockData = await runTransaction(db, async (transaction) => {
         const slotDoc = await transaction.get(slotRef);
         if (slotDoc.exists()) {
           const data = slotDoc.data();
           const now = Date.now();
           // Check if it's expired
           if (data.expiresAt && data.expiresAt.toMillis) {
             const expiresTime = data.expiresAt.toMillis();
             if (now < expiresTime) {
               throw new Error("This slot is currently locked by another user.");
             }
           } else if (data.expiresAt) {
             const expiresTime = data.expiresAt;
             if (now < expiresTime) {
               throw new Error("This slot is currently locked by another user.");
             }
           } else {
             throw new Error("This slot is already booked.");
           }
         }
         
         const expiresAt = Timestamp.fromDate(new Date(Date.now() + 5 * 60000)); // 5 minutes
         const lockId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
         
         transaction.set(slotRef, {
           lockId,
           therapistId,
           date,
           time,
           createdAt: serverTimestamp(),
           expiresAt
         });
         return { lockId };
      });
      return { success: true, lockId: lockData.lockId };
    } catch (err: any) {
      logger.error('BOOKING', 'Lock slot failed', err);
      return { success: false, error: err.message };
    }
  },

  createBooking: async (
    bookingData: Omit<Booking, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { lockId?: string }
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
           const data = slotDoc.data();
           const now = Date.now();
           const isExpired = (data.expiresAt && data.expiresAt.toMillis && now >= data.expiresAt.toMillis()) || (data.expiresAt && typeof data.expiresAt === 'number' && now >= data.expiresAt);
           
           if (!isExpired) {
             // If there's an active lock and the lockId doesn't match...
             if (data.lockId && data.lockId !== cleanedData.lockId) {
               throw new Error("This slot is currently locked by another user or has just been booked.");
             }
             // If no lockId was provided by the client, or it's permanently booked (no lockId/expiresAt)
             if (!cleanedData.lockId && !data.lockId && !data.expiresAt) {
               throw new Error("This slot has just been booked. Please select another time.");
             }
           }
        } else if (cleanedData.lockId) {
           // Provide safe failover if lock mysteriously vanished but they have a lockId
        }

        // Lock the slot permanently by removing lockId and expiresAt
        transaction.set(slotRef, {
           therapistId: cleanedData.therapistId,
           date: cleanedData.date,
           time: cleanedData.time,
           bookingId: newBookingRef.id,
           createdAt: serverTimestamp()
        });

        // Delete lockId from cleaned data before saving
        delete cleanedData.lockId;

        transaction.set(newBookingRef, {
          ...cleanedData,
          status: 'pending_approval' as BookingStatus,
          paymentStatus: 'unpaid',
          bookingToken,
          sessionMode: cleanedData.sessionMode || 'Online',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Audit log
        const auditRef = doc(collection(db, 'bookings', newBookingRef.id, 'audit_logs'));
        transaction.set(auditRef, {
          action: 'created',
          timestamp: serverTimestamp(),
          details: 'Booking requested by patient'
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
            status: 'pending_approval' as BookingStatus,
            paymentStatus: 'unpaid',
            createdAt: null,
            updatedAt: null
          };
          const safeBooking = mapBooking(newBookingRef.id, bData);
          
          if (safeBooking.email && safeBooking.name && safeBooking.date && safeBooking.time) {
             await resendService.sendBookingReceivedEmail(safeBooking, therapist);
          }
        }
      } catch (err) {
        logger.warn('BOOKING', "Failed to send notification email", err);
      }

      logger.success('BOOKING', 'Created booking successfully', { bookingId: newBookingRef.id });
      return { bookingId: newBookingRef.id };
    } catch (err: any) {
      logger.error('BOOKING', 'Firestore transaction failed for createBooking', err);
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

  updateStatus: async (id: string, status: BookingStatus) => {
    // If status is awaiting_payment, call the API directly and return
    if (status === 'awaiting_payment') {
      try {
        const response = await fetch('/api/payment/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: id })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to create payment order');
        return { success: true };
      } catch (err: any) {
         logger.error('BOOKING', 'Failed to create payment order', err);
         throw err;
      }
    }

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

        // Audit log
        const auditRef = doc(collection(db, 'bookings', id, 'audit_logs'));
        transaction.set(auditRef, {
          action: 'status_updated',
          status: status,
          timestamp: serverTimestamp(),
          details: `Booking status changed to ${status}`
        });
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
          logger.warn('BOOKING', "Failed to send confirmed email", err);
        }
      }

      logger.success('BOOKING', 'Updated booking status successfully', { bookingId: id, status });
      return { success: true };
    } catch (err: any) {
      logger.error('BOOKING', `Failed to update status to ${status}`, err, { bookingId: id });
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${id}`);
      throw err;
    }
  },

  declineBooking: async (id: string, adminUid: string, reason: string, customNote: string) => {
    try {
      const ref = doc(db, 'bookings', id);
      const status: BookingStatus = 'rejected';

      await runTransaction(db, async (transaction) => {
        const bookingSnap = await transaction.get(ref);
        if (!bookingSnap.exists()) {
           throw new Error("Booking does not exist");
        }
        const data = bookingSnap.data();

        transaction.update(ref, {
          status,
          declineReason: reason,
          declineCustomNote: customNote,
          declinedAt: serverTimestamp(),
          declinedBy: adminUid,
          updatedAt: serverTimestamp()
        });

        const slotId = `${data.therapistId}_${data.date}_${data.time}`.replace(/\//g, '-');
        const slotRef = doc(db, 'locked_slots', slotId);
        transaction.delete(slotRef);

        const auditRef = doc(collection(db, 'bookings', id, 'audit_logs'));
        transaction.set(auditRef, {
          action: 'status_updated',
          status: status,
          reason: reason,
          timestamp: serverTimestamp(),
          details: `Booking declined by admin: ${reason}`
        });
      });

      // Send email
      try {
        const bookingSnap = await getDoc(ref);
        if (bookingSnap.exists()) {
          const booking = mapBooking(bookingSnap.id, bookingSnap.data());
          if (booking.email && booking.name && booking.date && booking.time) {
            const therapistSnap = await getDoc(doc(db, 'therapists', booking.therapistId));
            if (therapistSnap.exists()) {
              const therapist = mapTherapist(therapistSnap.id, therapistSnap.data());
              await resendService.sendBookingDeclinedEmail(booking, therapist, reason, customNote);
            }
          }
        }
      } catch (err) {
        logger.warn('BOOKING', "Failed to send decline email", err);
      }

      logger.success('BOOKING', 'Declined booking successfully', { bookingId: id });
      return { success: true };
    } catch (err: any) {
      logger.error('BOOKING', 'Failed to decline booking', err, { bookingId: id });
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
           const newSlotData = newSlotDoc.data();
           const now = Date.now();
           const isExpired = (newSlotData.expiresAt && newSlotData.expiresAt.toMillis && now >= newSlotData.expiresAt.toMillis()) || (newSlotData.expiresAt && typeof newSlotData.expiresAt === 'number' && now >= newSlotData.expiresAt);
           if (!isExpired) {
             throw new Error("This new slot is unavailable.");
           }
        }

        transaction.delete(oldSlotRef);
        transaction.set(newSlotRef, {
           therapistId: data.therapistId,
           date: newDate,
           time: newTime,
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

        // Audit log
        const auditRef = doc(collection(db, 'bookings', id, 'audit_logs'));
        transaction.set(auditRef, {
          action: 'rescheduled',
          timestamp: serverTimestamp(),
          details: `Booking rescheduled from ${data.date} ${data.time} to ${newDate} ${newTime}`
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
        logger.warn('BOOKING', "Failed to send reschedule emails", err);
      }

      logger.success('BOOKING', 'Rescheduled booking successfully', { bookingId: id, newDate, newTime });
      return { success: true };
    } catch (err: any) {
      logger.error('BOOKING', 'Failed to reschedule booking', err, { bookingId: id });
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
      
      logger.success('BOOKING', 'Rescheduled via token successfully', { token: token.slice(0, 5) + '...' });
      return data;
    } catch(err: any) {
      logger.error('BOOKING', 'Failed to reschedule via token', err);
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
      logger.error('BOOKING', 'Failed to get booking by token API route', err);
      throw err;
    }
  }
};
