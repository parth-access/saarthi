import { useState } from 'react';
import { useGlobalError } from './useGlobalError';

export function useBooking() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { handleError, handleSuccess } = useGlobalError();

  async function lockSlot(params: { therapistId: string; date: string; time: string }) {
    try {
      const res = await fetch('/api/availability/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json();
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
      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        handleError(data.error);
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
