import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { Booking, Therapist } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { sessionStartMs } from '@/lib/sessionDisplay';

/**
 * Single source of truth for the client dashboard's booking data.
 *
 * Replaces the per-page N+1 fetch (one getDoc per therapist, duplicated across
 * dashboard/bookings/receipts) with one bookings query + a de-duplicated,
 * parallel batch of therapist reads. Exposes `refresh()` so mutations
 * (reschedule/cancel/join) can re-pull authoritative state without a hard
 * reload, and derived `upcoming`/`past`/`nextSession` slices so pages don't each
 * re-derive them.
 *
 * Ownership note: this is a *read* convenience keyed on the signed-in user's
 * email (matching the existing bookings query). All mutations still go through
 * the server commands, which re-verify ownership against the verified session —
 * the client never becomes authoritative.
 */

const UPCOMING_STATUSES = new Set<Booking['status']>([
  'confirmed',
  'pending',
  'pending_approval',
  'awaiting_payment',
  'pending_payment',
]);

const PAST_STATUSES = new Set<Booking['status']>([
  'completed',
  'cancelled',
  'rejected',
  'expired',
  'no_show',
]);

export interface DashboardData {
  bookings: Booking[];
  therapists: Record<string, Therapist>;
  upcoming: Booking[];
  past: Booking[];
  /** Soonest actionable (confirmed/pending) future session, or null. */
  nextSession: Booking | null;
  loading: boolean;
  /** True only on the very first load; refreshes keep prior data visible. */
  initialLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDashboardData(): DashboardData {
  const { currentUser } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [therapists, setTherapists] = useState<Record<string, Therapist>>({});
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);

  const fetchData = useCallback(async () => {
    if (!currentUser?.email) return;
    setLoading(true);
    setError(null);
    try {
      const bookingsRef = collection(db, 'bookings');
      const snap = await getDocs(query(bookingsRef, where('email', '==', currentUser.email)));
      const allBookings = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking));

      // Sort newest-first in memory (avoids a composite index requirement).
      allBookings.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      // De-duplicate therapist IDs, then fetch them all in parallel (no N+1 loop).
      const uniqueTherapistIds = Array.from(
        new Set(allBookings.map((b) => b.therapistId).filter(Boolean))
      );
      const therapistDocs = await Promise.all(
        uniqueTherapistIds.map((tId) => getDoc(doc(db, 'therapists', tId)))
      );
      const tMap: Record<string, Therapist> = {};
      therapistDocs.forEach((tDoc) => {
        if (tDoc.exists()) tMap[tDoc.id] = { id: tDoc.id, ...tDoc.data() } as Therapist;
      });

      setBookings(allBookings);
      setTherapists(tMap);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError('We could not load your sessions right now. Please try again.');
    } finally {
      setLoading(false);
      setInitialLoading(false);
      hasLoadedOnce.current = true;
    }
  }, [currentUser?.email]);

  useEffect(() => {
    if (currentUser?.email) {
      fetchData();
    }
  }, [currentUser?.email, fetchData]);

  const { upcoming, past, nextSession } = useMemo(() => {
    const now = Date.now();
    const todayStr = new Date().toISOString().split('T')[0];

    const up = bookings
      .filter((b) => UPCOMING_STATUSES.has(b.status) && (b.date || '') >= todayStr)
      .sort((a, b) => {
        const sa = sessionStartMs(a);
        const sb = sessionStartMs(b);
        if (Number.isFinite(sa) && Number.isFinite(sb)) return sa - sb;
        return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
      });

    const pa = bookings
      .filter((b) => PAST_STATUSES.has(b.status) || (b.date || '') < todayStr)
      // newest-first (bookings already sorted desc, but be explicit)
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

    // Next actionable session: soonest confirmed/pending that is still ahead.
    const next =
      up.find((b) => {
        const start = sessionStartMs(b);
        const ahead = Number.isFinite(start) ? start > now : (b.date || '') >= todayStr;
        return ahead && (b.status === 'confirmed' || b.status === 'pending' || b.status === 'pending_approval' || b.status === 'awaiting_payment');
      }) || null;

    return { upcoming: up, past: pa, nextSession: next };
  }, [bookings]);

  return {
    bookings,
    therapists,
    upcoming,
    past,
    nextSession,
    loading,
    initialLoading: initialLoading && !hasLoadedOnce.current,
    error,
    refresh: fetchData,
  };
}
