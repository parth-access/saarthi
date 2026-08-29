import { useState, useEffect, useCallback } from 'react';
import { Therapist } from '../types';
import { therapistService } from '../services/therapistService';

export function useTherapists() {
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTherapists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await therapistService.getTherapists();
      setTherapists(data);
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)) || 'Failed to load therapists');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTherapists();
  }, [fetchTherapists]);

  return { therapists, loading, error, refetch: fetchTherapists };
}
