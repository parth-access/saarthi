import { Booking, Therapist } from '../types';
import { auth } from '../lib/firebase/client';

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
           phone: booking.phone,
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
      if (process.env.NODE_ENV !== 'production') {
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
           phone: booking.phone,
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
      if (process.env.NODE_ENV !== 'production') {
         console.error("resendService.sendBookingConfirmedEmail Error:", error);
      }
      // Suppress throwing to not block the UI
    }
  },

  sendBookingDeclinedEmail: async (booking: Booking, therapist: Therapist, reason: string, customNote: string) => {
    try {
      if (!booking?.id) throw new Error("Missing booking.id");
      if (!therapist?.id) throw new Error("Missing therapist.id");
      
      const currentUser = auth?.currentUser;
      if (!currentUser) throw new Error("User must be authenticated to send emails");
      
      const token = await currentUser.getIdToken();

      const payload = { 
        type: 'booking-declined', 
        bookingId: booking.id, 
        therapistId: therapist.id,
        declineReason: reason,
        declineCustomNote: customNote,
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
        throw new Error(`Failed to send booking declined email. Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
         console.error("resendService.sendBookingDeclinedEmail Error:", error);
      }
    }
  },

  sendBookingRescheduledEmail: async (booking: Booking, therapist: Therapist) => {
    try {
      if (!booking?.id) throw new Error("Missing booking.id");
      if (!therapist?.id) throw new Error("Missing therapist.id");
      
      const payload = { 
        type: 'booking-rescheduled', 
        bookingId: booking.id, 
        therapistId: therapist.id,
        bookingDetails: {
           name: booking.name,
           email: booking.email,
           phone: booking.phone,
           date: booking.date,
           time: booking.time,
           originalDate: booking.originalDate,
           originalTime: booking.originalTime,
           sessionMode: booking.sessionMode,
           bookingToken: booking.bookingToken,
        }
      };
      
      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to send booking rescheduled email. Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
         console.error("resendService.sendBookingRescheduledEmail Error:", error);
      }
    }
  sendReconnectRequestEmail: async (params: { userName: string; userEmail: string; therapistName: string }) => {
    try {
      const payload = { 
        type: 'reconnect-request', 
        ...params
      };
      
      const currentUser = auth?.currentUser;
      const token = currentUser ? await currentUser.getIdToken() : '';

      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to send reconnect request email. Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
         console.error("resendService.sendReconnectRequestEmail Error:", error);
      }
    }
  }
};
