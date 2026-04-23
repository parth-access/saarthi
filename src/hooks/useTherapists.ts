import { useState, useEffect } from 'react';
import { Therapist } from '../types';

export function useTherapists() {
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchTherapists() {
      try {
        setLoading(true);
        const res = await fetch('/api/therapists/get', { signal: controller.signal });
        const data = await res.json();
        if (data.success) {
          setTherapists(data.therapists);
        } else {
          setError(data.error || 'Failed to load specialists');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'System unavailable');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchTherapists();
    return () => controller.abort();
  }, []);

  return { therapists, loading, error };
}
