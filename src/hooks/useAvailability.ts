import { useState, useEffect, useCallback } from 'react';

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

    try {
      const params = new URLSearchParams({ therapistId, date });
      if (excludeBookingId) {
        params.set('excludeBookingId', excludeBookingId);
      }
      const res = await fetch(`/api/availability?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Unable to check slot availability. Please try again.');
      }
      const availabilityData = await res.json();

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
