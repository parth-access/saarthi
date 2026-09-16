'use client';

/**
 * Data-fetching wrapper for the therapist dashboard.
 *
 * Connects the `useTherapistDashboard` hook to `TherapistDashboardView`.
 * Loading, error and empty states are handled here so the view component
 * stays render-only and testable from fixtures.
 */
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TherapistDashboardView } from './TherapistDashboardView';
import type { TherapistDashboardData } from '@/hooks/useTherapistDashboard';

interface TherapistDashboardScreenProps {
  readonly data: TherapistDashboardData;
}

export function TherapistDashboardScreen({ data }: TherapistDashboardScreenProps) {
  // Loading skeleton
  if (data.initialLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your sessions…</span>
        <div className="h-20 animate-pulse rounded-xl bg-white shadow-sm motion-reduce:animate-none" />
        <div className="h-28 animate-pulse rounded-xl bg-white shadow-sm motion-reduce:animate-none" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white shadow-sm motion-reduce:animate-none" />
          ))}
        </div>
        <div className="h-36 animate-pulse rounded-xl bg-white shadow-sm motion-reduce:animate-none" />
        <div className="h-28 animate-pulse rounded-xl bg-white shadow-sm motion-reduce:animate-none" />
      </div>
    );
  }

  // Hard error with nothing to show
  if (data.error && data.bookings.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-10 text-center">
        <div className="rounded-xl border border-danger/20 bg-white p-8 shadow-sm">
          <AlertTriangle className="mx-auto h-6 w-6 text-danger" aria-hidden="true" />
          <h2 className="mt-3 font-serif text-lg font-semibold text-primary">Couldn&apos;t load your workspace</h2>
          <p className="mt-1 text-xs text-muted-foreground">{data.error}</p>
          <Button variant="outline" size="sm" onClick={data.refresh} className="mt-4">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Soft inline warning when refresh fails but cached data is still available */}
      {data.error && data.bookings.length > 0 && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-surface px-4 py-3 text-xs text-danger shadow-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold">Couldn&apos;t refresh.</span> {data.error} The information
            shown is still available.
          </p>
        </div>
      )}

      <TherapistDashboardView
        therapist={data.therapist}
        todaySessions={data.todaySessions}
        nextSession={data.nextSession}
        pendingRequests={data.pendingRequests}
        upcomingSessions={data.upcomingSessions}
        recentSessions={data.recentSessions}
        needsAttention={data.needsAttention}
        stats={data.stats}
      />
    </>
  );
}
