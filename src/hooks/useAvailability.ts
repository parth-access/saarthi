import { useState, useEffect, useCallback } from 'react';
import { perfMark, perfMeasure } from '@/lib/perfTracing';

export interface Slot {
  time: string;
  isAvailable: boolean;
  reason: string | null;
}

/**
 * Slot availability for a therapist on one IST calendar day.
 *
 * `excludeBookingId` is for the reschedule flows: the booking being moved must
 * not count as a *competing* booking or lock to itself, and the server also
 * excludes that booking's own current date/time from `availableSlots` — a
 * session cannot be "rescheduled" to where it already is. The server
 * authorizes the exclusion against the session, so passing a booking the
 * caller does not own fails rather than leaking anything.
 *
 * Temporal filtering (past slots, beyond the booking window) is decided by the
 * server against IST — never by the browser clock — and arrives here as a
 * `reason`, so a caller can render it greyed out instead of dropping it.
 */
export function useAvailability(
  therapistId: string | null,
  date: string | null,
  excludeBookingId?: string | null
) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchAvailability = useCallback(async () => {
    if (!therapistId || !date) {
      setSlots([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    perfMark('AVAILABILITY_START');

    try {
      const url = availabilityUrl(therapistId, date, excludeBookingId);
      // A request started when the date was picked is reused once; a failed
      // one falls back to a fresh fetch rather than surfacing its error.
      const res = await (takePrefetched(url)?.catch(() => fetch(url)) ?? fetch(url));
      if (!res.ok) {
        throw new Error('Unable to check slot availability. Please try again.');
      }
      const availabilityData = await res.json();
      perfMeasure('AVAILABILITY_RESPONSE', 'AVAILABILITY_START', 'UI');

      const {
        availableSlots = [],
        bookedTimes = [],
        lockedTimes = [],
        pastTimes = [],
        beyondWindowTimes = [],
      } = availabilityData;

      // Deduplicate slots using Map. Later writes win, so the order below is the
      // precedence order: an unavailable reason always overrides "available".
      const slotMap = new Map<string, Slot>();

      availableSlots.forEach((time: string) => {
        slotMap.set(time, { time, isAvailable: true, reason: null });
      });

      bookedTimes.forEach((time: string) => {
        slotMap.set(time, { time, isAvailable: false, reason: 'Booked' });
      });

      lockedTimes.forEach((time: string) => {
        slotMap.set(time, { time, isAvailable: false, reason: 'Locked' });
      });

      beyondWindowTimes.forEach((time: string) => {
        slotMap.set(time, { time, isAvailable: false, reason: 'Too far' });
      });

      pastTimes.forEach((time: string) => {
        slotMap.set(time, { time, isAvailable: false, reason: 'Past' });
      });

      const slotObjects = Array.from(slotMap.values());
      slotObjects.sort((a, b) => a.time.localeCompare(b.time));

      setSlots(slotObjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [therapistId, date, excludeBookingId]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability, refreshKey]);

  // Proxies AVAILABILITY_RENDERED: fires after the state update that carries
  // fresh slots has been committed.
  useEffect(() => {
    if (!loading) {
      perfMeasure('AVAILABILITY_RENDERED', 'AVAILABILITY_START', 'UI');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  // Re-validate availability on browser tab visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchAvailability();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchAvailability]);

  const refetch = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return { slots, loading, error, refetch };
}

function availabilityUrl(therapistId: string, date: string, excludeBookingId?: string | null): string {
  const params = new URLSearchParams({ therapistId, date });
  if (excludeBookingId) params.set('excludeBookingId', excludeBookingId);
  return `/api/availability?${params.toString()}`;
}

/**
 * How long a prefetched response may stand in for a fresh one. Short on
 * purpose: it only has to cover "pick a date, click Find Slots", and the slot
 * lock re-checks the time server-side anyway, so a slot taken in between is
 * refused at lock time rather than booked twice.
 */
export const PREFETCH_TTL_MS = 15_000;

const prefetched = new Map<string, { at: number; response: Promise<Response> }>();

/** Hands out a prefetched response at most once; stale entries are dropped. */
function takePrefetched(url: string): Promise<Response> | null {
  const hit = prefetched.get(url);
  prefetched.delete(url);
  if (!hit || Date.now() - hit.at > PREFETCH_TTL_MS) return null;
  return hit.response;
}

/**
 * Starts the slot request for a day as soon as it is picked, so the slot step
 * (which mounts only after "Find Slots" and the step transition) finds the
 * answer already on its way instead of starting from zero.
 */
export function prefetchAvailability(therapistId: string | null | undefined, date: string | null | undefined): void {
  if (!therapistId || !date || typeof window === 'undefined') return;
  const url = availabilityUrl(therapistId, date);
  const hit = prefetched.get(url);
  if (hit && Date.now() - hit.at <= PREFETCH_TTL_MS) return;
  const response = fetch(url);
  response.catch(() => {});
  prefetched.set(url, { at: Date.now(), response });
}

const warmedTherapists = new Set<string>();

/**
 * Fire-and-forget request that wakes the availability function (and its
 * Firestore connection) before the visitor reaches the slot step. Called when a
 * therapist is picked, so a serverless cold start overlaps with the time spent
 * choosing a session type and date instead of happening after the date click.
 * The response is ignored — slots are always fetched fresh by useAvailability —
 * and each therapist is warmed at most once per page load.
 */
export function warmAvailability(therapistId: string | null | undefined): void {
  if (!therapistId || warmedTherapists.has(therapistId) || typeof window === 'undefined') return;
  warmedTherapists.add(therapistId);
  // Today's date in IST, the calendar the server schedules against.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const params = new URLSearchParams({ therapistId, date: today });
  fetch(`/api/availability?${params.toString()}`).catch(() => {});
}
