'use client';

/**
 * One booking's data for the detail screen.
 *
 * Mirrors `useAdminBookings`: everything that decides what the operator sees is in
 * `adminBookingDetailResponse.ts` and tested there, and what is left here is the
 * part that needs React.
 *
 * One difference — `notFound` is carried separately from `error`, because the two
 * render differently and only one of them is worth a retry button.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  BOOKINGS_SESSION_ERROR,
  GENERIC_BOOKINGS_ERROR,
  createLatestRequestGuard,
  interpretAdminBookingDetailResponse,
  type AdminBookingDetailPayload,
} from './adminBookingDetailResponse';

export type { AdminBookingDetailPayload, AdminBookingTimeline } from './adminBookingDetailResponse';

export interface AdminBookingDetailState {
  readonly data: AdminBookingDetailPayload | null;
  readonly loading: boolean;
  /** Nothing has arrived yet, so there is nothing to show but a skeleton. */
  readonly initialLoading: boolean;
  readonly error: string | null;
  /** The booking does not exist. Retrying will not change that. */
  readonly notFound: boolean;
  readonly reload: () => void;
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useAdminBookingDetail(bookingId: string): AdminBookingDetailState {
  const [data, setData] = useState<AdminBookingDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const hasLoaded = useRef(false);
  const guard = useRef(createLatestRequestGuard());
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const ticket = guard.current.begin();
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setLoading(true);
    setError(null);
    setNotFound(false);

    (async () => {
      try {
        const response = await fetchWithAuth(
          `/api/admin/bookings/${encodeURIComponent(bookingId)}`,
          { signal: controller.signal }
        );
        if (!guard.current.isCurrent(ticket)) return;

        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminBookingDetailResponse(response.status, body);
        if (result.ok) {
          setData(result.payload);
          hasLoaded.current = true;
        } else {
          setNotFound(result.notFound);
          setError(result.error);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!guard.current.isCurrent(ticket)) return;
        setError(
          err instanceof Error && err.message === 'User not authenticated'
            ? BOOKINGS_SESSION_ERROR
            : GENERIC_BOOKINGS_ERROR
        );
      } finally {
        if (guard.current.isCurrent(ticket)) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [bookingId, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    data,
    loading,
    initialLoading: loading && !hasLoaded.current,
    error,
    notFound,
    reload,
  };
}
