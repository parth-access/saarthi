import { Booking, Therapist } from '../types';

export const resendService = {
  sendBookingReceivedEmail: async (booking: Booking, therapist: Therapist) => {
    try {
      const response = await fetch('/api/email/booking-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking, therapist })
      });
      if (!response.ok) {
        throw new Error('Failed to send booking received email');
      }
      return await response.json();
    } catch (error) {
      console.error(error);
      // Suppress throwing to not block the UI
    }
  },

  sendBookingConfirmedEmail: async (booking: Booking, therapist: Therapist) => {
    try {
      const response = await fetch('/api/email/booking-confirmed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking, therapist })
      });
      if (!response.ok) {
        throw new Error('Failed to send booking confirmed email');
      }
      return await response.json();
    } catch (error) {
      console.error(error);
      // Suppress throwing to not block the UI
    }
  }
};
