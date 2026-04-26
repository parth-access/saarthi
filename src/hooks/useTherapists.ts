import useSWR from 'swr';
import { Therapist } from '../types';
import { useGlobalError } from './useGlobalError';
import { apiClient } from '../lib/api';

const fetcher = async (url: string) => {
  const res = await apiClient(url, { requireAuth: false });
  if (!res.success) throw new Error(res.error || 'Failed to fetch data');
  return res.data;
};

export function useTherapists() {
  const { handleError } = useGlobalError();
  const { data, error, isLoading } = useSWR<Therapist[]>('/therapists/get', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // Cache for 1 minute
    onError: (err) => handleError(err, 'Could not load therapist data.')
  });

  return { 
    therapists: data || [], 
    loading: isLoading, 
    error: error?.message || null 
  };
}
