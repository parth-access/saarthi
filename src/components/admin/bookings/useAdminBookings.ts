'use client';

/**
 * The bookings list's data, fetched from the API the operator's filters describe.
 *
 * Everything that decides *what the operator sees* lives in
 * `adminBookingsResponse.ts` and is tested there. What is left here is the part
 * that genuinely needs React: issuing the request, aborting its predecessor, and
 * holding the result.
 *
 * Previously loaded rows stay on screen during a refetch. Blanking the table on
 * every filter change makes the screen look like it is losing data.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { adminBookingsApiQuery, type AdminBookingsView } from './adminBookingsUrlState';
import {
  BOOKINGS_SESSION_ERROR,
  GENERIC_BOOKINGS_ERROR,
  createLatestRequestGuard,
  interpretAdminBookingsResponse,
  type AdminBookingsPayload,
} from './adminBookingsResponse';

export type {
  AdminBookingsAppliedFilters,
  AdminBookingsPage,
  AdminBookingsPayload,
} from './adminBookingsResponse';

export interface AdminBookingsState {
  readonly data: AdminBookingsPayload | null;
  /** A request is in flight. Rows from the previous one are still shown. */
  readonly loading: boolean;
  /** No data has ever arrived, so there is nothing to show but a skeleton. */
  readonly initialLoading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
}

/** `null` when the body was not JSON at all — a proxy error page, say. */
async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useAdminBookings(view: AdminBookingsView): AdminBookingsState {
  const query = adminBookingsApiQuery(view);
  const [data, setData] = useState<AdminBookingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

    (async () => {
      try {
        const response = await fetchWithAuth(`/api/admin/bookings${query ? `?${query}` : ''}`, {
          signal: controller.signal,
        });
        if (!guard.current.isCurrent(ticket)) return;

        const body = await parseJson(response);
        // Re-checked: a newer request can be issued while the body is parsed.
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminBookingsResponse(response.status, body);
        if (result.ok) {
          setData(result.payload);
          hasLoaded.current = true;
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!guard.current.isCurrent(ticket)) return;
        // `fetchWithAuth` throws before sending when Firebase has no current user,
        // which is what an expired session looks like from here.
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
  }, [query, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    data,
    loading,
    initialLoading: loading && !hasLoaded.current,
    error,
    reload,
  };
}
