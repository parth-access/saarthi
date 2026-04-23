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
    if (!therapistId || !date) {
      setSlots([]);
      return;
    }

    const controller = new AbortController();

    async function fetchAvailability() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/availability/get?therapistId=${therapistId}&date=${date}`, {
          signal: controller.signal
        });
        const data = await res.json();
        if (data.success) {
          setSlots(data.slots || []);
        } else {
          setError(data.error || 'Failed to load availability');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Error fetching slots');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchAvailability();
    return () => controller.abort();
  }, [therapistId, date]);

  return { slots, loading, error };
}
