'use client';

/**
 * Therapist id → name, for labelling bookings and filling the therapist filter.
 *
 * Read through the admin roster API rather than the public therapist list: the
 * console then needs no browser Firestore client at all, an archived therapist
 * still has a name on their old bookings, and the read goes through the same
 * server-side admin check as everything else on the page.
 */
import { useMemo } from 'react';
import { useAdminTherapists } from './useAdminTherapists';

export interface TherapistName {
  readonly id: string;
  readonly name: string;
}

export function useAdminTherapistNames(): { therapists: readonly TherapistName[]; loading: boolean } {
  const { data, loading } = useAdminTherapists();
  const therapists = useMemo(() => {
    if (!data?.roster.ok) return [];
    return [...data.roster.rows]
      .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name))
      .map((row) => ({ id: row.id, name: row.archived ? `${row.name} (archived)` : row.name }));
  }, [data]);
  return { therapists, loading };
}
