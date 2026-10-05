import { useState, useCallback } from 'react';
import { auth } from '@/lib/firebase/client';
import { Booking } from '@/types';
import { toast } from 'sonner';

/**
 * Shared "Join Session" behaviour, extracted from the working bookings-page
 * implementation so the main dashboard, bookings list, and details modal all
 * use the exact same real flow (no fake toasts).
 *
 * Flow:
 *  - If the booking already has a meetingUrl, open it immediately.
 *  - Otherwise call the authenticated /api/bookings/join-session endpoint with a
 *    Firebase ID token. The server verifies ownership and lazily creates the
 *    Google Meet link for confirmed bookings.
 *  - 200 + meetingUrl  -> open the Meet in a new tab.
 *  - 202 (PENDING)     -> link still being prepared; ask the user to retry.
 *  - 400/403/404/etc.  -> show the server's human-readable reason.
 */
export function useJoinSession() {
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const join = useCallback(async (session: Booking) => {
    // Fast path: link already stored on the booking.
    if (session.meetingUrl) {
      window.open(session.meetingUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      setJoiningId(session.id);
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) {
        toast.error('Please sign in again to access your meeting link.');
        return;
      }

      toast.loading('Preparing your Google Meet room…', { id: 'join-meet' });
      const res = await fetch(`/api/bookings/join-session?bookingId=${encodeURIComponent(session.id)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.meetingUrl) {
        toast.success('Your session room is ready. Opening…', { id: 'join-meet' });
        window.open(data.meetingUrl, '_blank', 'noopener,noreferrer');
      } else if (res.status === 202) {
        toast.info('Your meeting room is still being prepared. Please try again in a moment.', { id: 'join-meet' });
      } else {
        toast.error(
          data.error || 'Your meeting link is not available yet. Please try again shortly.',
          { id: 'join-meet' }
        );
      }
    } catch {
      toast.error('We could not reach the meeting service. Please try again.', { id: 'join-meet' });
    } finally {
      setJoiningId(null);
    }
  }, []);

  return { join, joiningId };
}
