import { useState } from 'react';
import { useGlobalError } from './useGlobalError';
import { apiClient } from '../lib/api';

export function useBooking() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { handleError, handleSuccess } = useGlobalError();

  async function lockSlot(params: { therapistId: string; date: string; time: string }) {
    try {
      const data = await apiClient('/availability/lock', {
        method: 'POST',
        body: JSON.stringify(params),
        requireAuth: false
      });
      if (!data.success) {
        handleError(data.error);
      }
      return data;
    } catch (err: any) {
      handleError(err, 'Could not reserve this time slot.');
      return { success: false, error: err.message };
    }
  }

  async function createBooking(bookingData: any) {
    setSubmitting(true);
    setError(null);
    try {
      const data = await apiClient('/bookings/create', {
        method: 'POST',
        body: JSON.stringify(bookingData),
        requireAuth: false // Unless requireAuth is needed
      });
      if (!data.success) {
        const errorMsg = data.error || 'Failed to submit booking';
        setError(errorMsg);
        handleError(errorMsg);
      } else {
        handleSuccess('Booking request sent successfully!');
      }
      return data;
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
