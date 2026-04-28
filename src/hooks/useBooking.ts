import { useState } from 'react';
import { useGlobalError } from './useGlobalError';
import { bookingService } from '../services/bookingService';

export function useBooking() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { handleError, handleSuccess } = useGlobalError();

  async function lockSlot(params: { therapistId: string; date: string; time: string }) {
    // With backend verification at booking, we don't strictly need a separate lock right now
    return { success: true };
  }

  async function createBooking(bookingData: any) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await bookingService.createBooking({
        ...bookingData
      });
      
      handleSuccess('Booking request sent successfully!');
      return { success: true, data: { id: response.bookingId } };
    } catch (err: any) {
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



