import { useState } from 'react';
import { useGlobalError } from './useGlobalError';
import { bookingService } from '../services/bookingService';

export function useBooking() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { handleError, handleSuccess } = useGlobalError();

  async function lockSlot(params: { therapistId: string; date: string; time: string }) {
    setError(null);
    try {
      const response = await bookingService.lockSlot(params.therapistId, params.date, params.time);
      if (response.success) {
        return response;
      } else {
        const msg = response.error || 'Slot unavailable';
        setError(msg);
        return { success: false, error: msg };
      }
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)) || 'Network error';
      setError(msg);
      return { success: false, error: msg };
    }
  }

  async function createBooking(bookingData: Parameters<typeof bookingService.createBooking>[0]) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await bookingService.createBooking({
        ...bookingData
      });
      
      handleSuccess('Booking request sent successfully!');
      return { success: true, data: { id: response.bookingId } };
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)) || 'Network error';
      setError(msg);
      handleError(err, 'Failed to submit booking.');
      return { success: false, error: msg };
    } finally {
      setSubmitting(false);
    }
  }

  return { createBooking, lockSlot, submitting, error, setError };
}



