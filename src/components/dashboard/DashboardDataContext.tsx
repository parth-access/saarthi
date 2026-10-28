'use client';

/**
 * The client dashboard's bookings, read once by the dashboard layout and shared
 * with every page below it, so moving between Overview and My Sessions never
 * re-reads. Lives outside `layout.tsx` because a Next.js layout module may only
 * export the layout itself.
 */
import { createContext, useContext } from 'react';
import { useDashboardData, type DashboardData } from '@/hooks/useDashboardData';

const DashboardDataContext = createContext<DashboardData | null>(null);

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const data = useDashboardData();
  return <DashboardDataContext.Provider value={data}>{children}</DashboardDataContext.Provider>;
}

export function useSharedDashboardData(): DashboardData {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) throw new Error('useSharedDashboardData must be used inside the dashboard layout');
  return ctx;
}
