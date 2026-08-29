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
      const res = await fetch(`/api/availability?therapistId=${therapistId}&date=${date}`);
      if (!res.ok) {
        throw new Error('Unable to check slot availability. Please try again.');
      }
      const availabilityData = await res.json();

      const { availableSlots = [], bookedTimes = [], lockedTimes = [] } = availabilityData;

      // Construct standard slot representation
      const slotObjects: Slot[] = [];

      availableSlots.forEach((time: string) => {
        slotObjects.push({
          time,
          isAvailable: true,
          reason: null
        });
      });

      bookedTimes.forEach((time: string) => {
        slotObjects.push({
          time,
          isAvailable: false,
          reason: 'Booked'
        });
      });

      lockedTimes.forEach((time: string) => {
        slotObjects.push({
          time,
          isAvailable: false,
          reason: 'Locked'
        });
      });

      // Sort slot objects chronologically by time
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
  }, [fetchAvailability]);

  return { slots, loading, error, refetch: fetchAvailability };
}
