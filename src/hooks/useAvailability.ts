import useSWR from 'swr';
import { useGlobalError } from './useGlobalError';

interface Slot {
  time: string;
  isAvailable: boolean;
  reason: string | null;
}

export function useAvailability(therapistId: string | null, date: string | null) {
  const { handleError } = useGlobalError();
  const key = therapistId && date ? `/availability/get?therapistId=${therapistId}&date=${date}` : null;

  const { data, error, isLoading } = useSWR<Slot[]>(key, {
    revalidateOnFocus: true,
    dedupingInterval: 10000, // Short cache for availability (10s)
    refreshInterval: 30000, // Refresh every 30s
    onError: (err: any) => handleError(err, 'Failed to update time slots.')
  });

  return { 
    slots: data || [], 
    loading: isLoading, 
    error: error?.message || null 
  };
}

