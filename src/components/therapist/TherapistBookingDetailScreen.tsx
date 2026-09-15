'use client';

/**
 * One booking, as the assigned therapist sees it.
 *
 * Fetch half: resolves the booking through the canonical repository read
 * (`/api/therapist/bookings/[bookingId]`, which re-verifies session + booking
 * ownership server-side), distinguishes not-found from failure, and hands the
 * loaded booking to `TherapistBookingDetailView`. All rendering lives there and
 * is tested from fixtures; this file is the state machine.
 */

import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  DetailSkeleton,
  LoadFailed,
  NotFoundCard,
  TherapistBookingDetailView,
} from './TherapistBookingDetailView';
import type { Booking } from '@/types';

interface ScreenState {
  readonly data: Booking | null;
  readonly loading: boolean;
  readonly initialLoading: boolean;
  readonly error: string | null;
  /** The booking doesn't exist — or isn't this therapist's. Retrying won't change that. */
  readonly notFound: boolean;
  readonly reload: () => void;
}

function useTherapistBookingDetail(bookingId: string): ScreenState {
  const [data, setData] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const hasLoaded = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let stale = false;

    setLoading(true);
    setError(null);
    setNotFound(false);

    (async () => {
      try {
        const response = await fetchWithAuth(
          `/api/therapist/bookings/${encodeURIComponent(bookingId)}`,
          { signal: controller.signal }
        );
        const body = await response.json().catch(() => null);
        if (stale) return;

        if (response.status === 404) {
          setNotFound(true);
          return;
        }
        if (!response.ok) {
          setError('We could not load this booking right now. Please try again.');
          return;
        }
        if (body?.success && body.booking) {
          setData(body.booking as Booking);
          hasLoaded.current = true;
        } else {
          setError('We could not load this booking right now. Please try again.');
        }
      } catch (err) {
        if (stale || controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        setError(
          err instanceof Error && err.message === 'User not authenticated'
            ? 'Please sign in to view this booking.'
            : 'We could not reach the server. Please try again.'
        );
      } finally {
        if (!stale) setLoading(false);
      }
    })();

    return () => {
      stale = true;
      controller.abort();
    };
  }, [bookingId, reloadToken]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);
  return { data, loading, initialLoading: loading && !hasLoaded.current, error, notFound, reload };
}

export function TherapistBookingDetailScreen({ bookingId }: { bookingId: string }) {
  const { data, initialLoading, error, notFound, reload } = useTherapistBookingDetail(bookingId);

  if (notFound) {
    return (
      <div className="space-y-3">
        <BackLink />
        <NotFoundCard />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <BackLink />
        {initialLoading ? <DetailSkeleton /> : <LoadFailed error={error} onRetry={reload} />}
      </div>
    );
  }

  return <TherapistBookingDetailView booking={data} onAfterSave={reload} />;
}

function BackLink() {
  return (
    <Link
      href="/therapist"
      className="inline-flex items-center gap-1.5 text-xs text-primary/70 underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
      Your dashboard
    </Link>
  );
}
