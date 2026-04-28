import { useState, useEffect } from 'react';
import { Therapist } from '../types';
import { therapistService } from '../services/therapistService';

export function useTherapists() {
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    therapistService
      .getTherapists()
      .then((data) => {
        if (mounted) {
          setTherapists(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { therapists, loading, error };
}