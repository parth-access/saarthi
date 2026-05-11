import { Booking, Therapist } from '../types';
import { auth } from '../lib/firebase';

export const resendService = {
  sendBookingReceivedEmail: async (booking: Booking, therapist: Therapist) => {
    try {
      if (!booking?.id) throw new Error("Missing booking.id");
      if (!therapist?.id) throw new Error("Missing therapist.id");

      const payload = { 
        type: 'booking-received', 
        bookingId: booking.id, 
        therapistId: therapist.id,
        // Fallback for vercel preview if admin SDK not configured
        bookingDetails: {
           name: booking.name,
           email: booking.email,
           date: booking.date,
           time: booking.time,
        }
      };
      
      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to send booking received email. Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("resendService.sendBookingReceivedEmail Error:", error);
      }
      // Suppress throwing to not block the UI
    }
  },

  sendBookingConfirmedEmail: async (booking: Booking, therapist: Therapist) => {
    try {
      if (!booking?.id) throw new Error("Missing booking.id");
      if (!therapist?.id) throw new Error("Missing therapist.id");
      
      const currentUser = auth?.currentUser;
      if (!currentUser) throw new Error("User must be authenticated to send confirmation emails");
      
      const token = await currentUser.getIdToken();

      const payload = { 
        type: 'booking-confirmed', 
        bookingId: booking.id, 
        therapistId: therapist.id,
        bookingDetails: {
           name: booking.name,
           email: booking.email,
           date: booking.date,
           time: booking.time,
        }
      };
      
      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to send booking confirmed email. Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (import.meta.env.DEV) {
         console.error("resendService.sendBookingConfirmedEmail Error:", error);
      }
      // Suppress throwing to not block the UI
    }
  }
};
