import { useState, useEffect } from 'react';

interface Slot {
  time: string;
  isAvailable: boolean;
  reason: string | null;
}

export function useAvailability(therapistId: string | null, date: string | null) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!therapistId || !date) return;
    
    let mounted = true;
    setLoading(true);
    
    fetch(`/api/availability?therapistId=${therapistId}&date=${date}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch availability');
        return res.json();
      })
      .then((availabilityData) => {
        if (!mounted) return;

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
        setLoading(false);
      })
      .catch(err => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
      
    return () => { mounted = false };
  }, [therapistId, date]);

  return { slots, loading, error };
}
