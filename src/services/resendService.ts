import { auth } from '../lib/firebase/client';

/**
 * Admin email-log helpers.
 *
 * NOTE: the former client-side senders (sendBookingReceivedEmail,
 * sendBookingConfirmedEmail, sendBookingDeclinedEmail,
 * sendBookingRescheduledEmail, sendReconnectRequestEmail) were removed: no
 * component called them, they posted unauthenticated with client-supplied
 * booking details (an email-relay abuse vector), and every transactional email
 * is already dispatched server-side by its owning flow. Sending happens via
 * sendEmailAction on the server; the POST /api/email route is a
 * therapist/admin resend capability only.
 */
export const resendService = {
  getEmailLogs: async () => {
    try {
      const currentUser = auth?.currentUser;
      if (!currentUser) throw new Error("User must be authenticated to view email logs");
      const token = await currentUser.getIdToken();

      const response = await fetch('/api/email', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch email logs. Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
         console.error("resendService.getEmailLogs Error:", error);
      }
      throw error;
    }
  },

  resendEmail: async (emailId: string) => {
    try {
      const currentUser = auth?.currentUser;
      if (!currentUser) throw new Error("User must be authenticated to resend emails");
      const token = await currentUser.getIdToken();

      const response = await fetch('/api/email/resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ emailId })
      });

      if (!response.ok) {
        throw new Error(`Failed to resend email. Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error("resendService.resendEmail Error:", error);
      }
      throw error;
    }
  }
};
