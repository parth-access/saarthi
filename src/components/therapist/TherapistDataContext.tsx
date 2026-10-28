'use client';

/**
 * The therapist workspace's data, read once by the layout and shared with every
 * page below it, so changing tabs never re-reads. Lives outside `layout.tsx`
 * because a Next.js layout module may only export the layout itself.
 */
import { createContext, useContext } from 'react';
import type { TherapistDashboardData } from '@/hooks/useTherapistDashboard';

export const TherapistDataContext = createContext<TherapistDashboardData | null>(null);

export function useTherapistData(): TherapistDashboardData {
  const ctx = useContext(TherapistDataContext);
  if (!ctx) throw new Error('useTherapistData must be used inside TherapistLayout');
  return ctx;
}
