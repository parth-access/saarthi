import { useState } from 'react';
import { useGlobalError } from './useGlobalError';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

export function useBooking() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { handleError, handleSuccess } = useGlobalError();

  async function lockSlot(params: { therapistId: string; date: string; time: string }) {
    // In a fully client-side setup, we skip the lock and just return success.
    // Real locking requires either transactions or a backend.
    return { success: true };
  }

  async function createBooking(bookingData: any) {
    setSubmitting(true);
    setError(null);
    try {
      const docRef = await addDoc(collection(db, 'bookings'), {
        ...bookingData,
        status: 'pending',
        userId: auth?.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      handleSuccess('Booking request sent successfully!');
      return { success: true, data: { id: docRef.id } };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'bookings');
      const msg = err.message || 'Network error';
      setError(msg);
      handleError(err, 'Failed to submit booking.');
      return { success: false, error: msg };
    } finally {
      setSubmitting(false);
    }
  }

  return { createBooking, lockSlot, submitting, error, setError };
}

