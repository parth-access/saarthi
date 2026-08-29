import { useState, useEffect, useCallback } from 'react';

export interface Slot {
  time: string;
  isAvailable: boolean;
  reason: string | null;
}

export function useAvailability(therapistId: string | null, date: string | null) {
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
      const encodedId = encodeURIComponent(therapistId);
      const encodedDate = encodeURIComponent(date);
      const res = await fetch(`/api/availability?therapistId=${encodedId}&date=${encodedDate}`);
      if (!res.ok) {
        throw new Error('Unable to check slot availability. Please try again.');
      }
      const availabilityData = await res.json();

      const { availableSlots = [], bookedTimes = [], lockedTimes = [] } = availabilityData;

      // Deduplicate slots using Map (Booked & Locked override Available)
      const slotMap = new Map<string, Slot>();

      availableSlots.forEach((time: string) => {
        slotMap.set(time, {
          time,
          isAvailable: true,
          reason: null
        });
      });

      bookedTimes.forEach((time: string) => {
        slotMap.set(time, {
          time,
          isAvailable: false,
          reason: 'Booked'
        });
      });

      lockedTimes.forEach((time: string) => {
        slotMap.set(time, {
          time,
          isAvailable: false,
          reason: 'Locked'
        });
      });

      const slotObjects = Array.from(slotMap.values());
      slotObjects.sort((a, b) => a.time.localeCompare(b.time));

      setSlots(slotObjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [therapistId, date]);

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
