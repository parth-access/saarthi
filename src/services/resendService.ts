import { Booking, Therapist } from '../types';

// Use env var for API base, or empty string to fallback to relative path (proxy) if not set
const getApiBaseurl = () => import.meta.env.VITE_API_BASE_URL || '';

export const resendService = {
  sendBookingReceivedEmail: async (booking: Booking, therapist: Therapist) => {
    try {
      if (!booking?.email) throw new Error("Missing booking.email");
      if (!booking?.name) throw new Error("Missing booking.name");
      if (!booking?.date) throw new Error("Missing booking.date");
      if (!booking?.time) throw new Error("Missing booking.time");
      if (!therapist?.name) throw new Error("Missing therapist.name");

      const payload = { booking, therapist };
      
      const response = await fetch(`${getApiBaseurl()}/api/email/booking-received`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to send booking received email. Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("resendService.sendBookingReceivedEmail Error:", error);
      // Suppress throwing to not block the UI
    }
  },

  sendBookingConfirmedEmail: async (booking: Booking, therapist: Therapist) => {
    try {
      if (!booking?.email) throw new Error("Missing booking.email");
      if (!booking?.name) throw new Error("Missing booking.name");
      if (!booking?.date) throw new Error("Missing booking.date");
      if (!booking?.time) throw new Error("Missing booking.time");
      if (!therapist?.name) throw new Error("Missing therapist.name");

      const payload = { booking, therapist };
      
      const response = await fetch(`${getApiBaseurl()}/api/email/booking-confirmed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to send booking confirmed email. Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("resendService.sendBookingConfirmedEmail Error:", error);
      // Suppress throwing to not block the UI
    }
  }
};
