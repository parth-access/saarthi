import { useState } from 'react';

export function useBooking() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lockSlot(params: { therapistId: string; date: string; time: string }) {
    try {
      const res = await fetch('/api/availability/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
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
      }
      return data;
    } catch (err: any) {
      setError(err.message || 'Network error');
      return { success: false };
    } finally {
      setSubmitting(false);
    }
  }

  return { createBooking, lockSlot, submitting, error, setError };
}
