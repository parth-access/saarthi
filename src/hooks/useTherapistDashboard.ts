'use client';

/**
 * Data hook for the therapist workspace.
 *
 * Fetches the therapist profile and their bookings in one request
 * (GET /api/therapist/workspace), then computes the memos the dashboard,
 * sessions and availability pages need. Nothing here reads Firestore from the
 * browser, so the Firestore SDK stays out of the workspace bundle.
 *
 * Designed to be called once in the layout and passed down through context or
 * props, so tab changes within the workspace never re-fetch.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isToday, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { bookingService } from '@/services/bookingService';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { mapBooking } from '@/utils/mappers';
import type { Booking, BookingStatus, Therapist } from '@/types';

function isTodaysBooking(b: Booking): boolean {
  if (!b.date) return false;
  try { return isToday(parseISO(b.date)); } catch { return false; }
}

function sessionDate(b: Booking): Date | null {
  if (!b.date) return null;
  try {
    const d = parseISO(b.date);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

const byDateTimeAsc = (a: Booking, b: Booking) =>
  `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);

export interface TherapistDashboardData {
  therapist: Therapist | null;
  bookings: Booking[];
  loading: boolean;
  initialLoading: boolean;
  error: string | null;
  refresh: () => void;

  // Computed
  todaySessions: Booking[];
  nextSession: Booking | null;
  pendingRequests: Booking[];
  upcomingSessions: Booking[];
  recentSessions: Booking[];
  needsAttention: Booking[];
  stats: {
    today: number;
    pending: number;
    upcoming: number;
    attention: number;
  };
}

export function useTherapistDashboard(): TherapistDashboardData {
  const { currentUser } = useAuth();
  const [therapist, setTherapist] = useState<Therapist | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentUser?.uid) return;
    try {
      setLoading(true);
      setError(null);

      const response = await fetchWithAuth('/api/therapist/workspace');
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Your workspace could not be loaded just now.');

      const therapistProfile = (body.therapist ?? null) as Therapist | null;
      setTherapist(therapistProfile);
      setBookings(
        (Array.isArray(body.bookings) ? body.bookings : []).map((b: Record<string, unknown>) =>
          mapBooking(String(b.id), b)
        )
      );
      if (!therapistProfile) {
        setError('No therapist profile found mapped to your account. Please contact support.');
      }
      setHasLoaded(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred while fetching data.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => { fetchData(); }, [fetchData, reloadToken]);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  // --- Computed memos ---

  const todaySessions = useMemo(
    () => bookings.filter(isTodaysBooking).sort(byDateTimeAsc),
    [bookings]
  );

  const nextSession = useMemo(() => {
    const active = bookings.filter(
      (b) => b.status === 'confirmed' || b.status === 'awaiting_payment'
    );
    // Today's first active session
    const todayActive = active.filter(isTodaysBooking).sort(byDateTimeAsc);
    if (todayActive.length > 0) return todayActive[0];
    // Else next future session
    const startOfTomorrow = new Date();
    startOfTomorrow.setHours(24, 0, 0, 0);
    return (
      active
        .filter((b) => {
          const d = sessionDate(b);
          return d !== null && d.getTime() >= startOfTomorrow.getTime();
        })
        .sort(byDateTimeAsc)[0] ?? null
    );
  }, [bookings]);

  const pendingRequests = useMemo(
    () => bookings.filter((b) => b.status === 'pending' || b.status === 'pending_approval'),
    [bookings]
  );

  const upcomingSessions = useMemo(
    () =>
      bookings
        .filter((b) => {
          const d = sessionDate(b);
          return Boolean(
            d &&
            !isTodaysBooking(b) &&
            d.getTime() >= new Date().setHours(0, 0, 0, 0) &&
            (b.status === 'confirmed' || b.status === 'awaiting_payment')
          );
        })
        .sort(byDateTimeAsc),
    [bookings]
  );

  const recentSessions = useMemo(
    () =>
      bookings
        .filter((b) => b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show')
        .sort((a, b) => byDateTimeAsc(b, a)) // most recent first
        .slice(0, 5),
    [bookings]
  );

  const needsAttention = useMemo(
    () =>
      bookings.filter(
        (b) =>
          (b.status === 'completed' || b.status === 'no_show') &&
          (!b.hasSessionNotes || !b.followUpStatus)
      ),
    [bookings]
  );

  const stats = useMemo(
    () => ({
      today: todaySessions.length,
      pending: pendingRequests.length,
      upcoming: upcomingSessions.length,
      attention: needsAttention.length,
    }),
    [todaySessions.length, pendingRequests.length, upcomingSessions.length, needsAttention.length]
  );

  return {
    therapist,
    bookings,
    loading,
    initialLoading: loading && !hasLoaded,
    error,
    refresh,
    todaySessions,
    nextSession,
    pendingRequests,
    upcomingSessions,
    recentSessions,
    needsAttention,
    stats,
  };
}

// --- Status update helpers ---

export function useBookingActions(
  /** Called after a successful change so the shared therapist data re-reads. */
  onChanged: () => void
) {
  const { currentUser } = useAuth();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const updateStatus = useCallback(async (id: string, status: BookingStatus, reason?: string) => {
    try {
      setProcessingId(id);
      await bookingService.updateStatus(id, status, reason);
      onChanged();
    } finally {
      setProcessingId(null);
    }
  }, [onChanged]);

  const declineBooking = useCallback(async (id: string, reason: string, note?: string) => {
    if (!currentUser?.uid) return;
    try {
      setProcessingId(id);
      await bookingService.declineBooking(id, currentUser.uid, reason, note);
      onChanged();
    } finally {
      setProcessingId(null);
    }
  }, [currentUser?.uid, onChanged]);

  return { processingId, updateStatus, declineBooking };
}
