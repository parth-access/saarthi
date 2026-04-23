import useSWR from 'swr';
import { useGlobalError } from './useGlobalError';

interface Slot {
  time: string;
  isAvailable: boolean;
  reason: string | null;
}

const fetcher = (url: string) => fetch(url).then(res => res.json()).then(res => {
  if (!res.success) throw new Error(res.error || 'Failed to fetch availability');
  return res.data;
});

export function useAvailability(therapistId: string | null, date: string | null) {
  const { handleError } = useGlobalError();
  const key = therapistId && date ? `/api/availability/get?therapistId=${therapistId}&date=${date}` : null;

  const { data, error, isLoading } = useSWR<Slot[]>(key, fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 10000, // Short cache for availability (10s)
    refreshInterval: 30000, // Refresh every 30s
    onError: (err) => handleError(err, 'Failed to update time slots.')
  });

  return { 
    slots: data || [], 
    loading: isLoading, 
    error: error?.message || null 
  };
}
