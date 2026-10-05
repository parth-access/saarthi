'use client';

/**
 * The overview's data.
 *
 * Same shape as `useAdminBookingDetail`: everything that decides what an operator
 * sees lives in `adminOverviewResponse.ts` and is tested there, and what is left
 * here is the part that needs React.
 *
 * There is deliberately no polling. This page is read at the start of a shift and
 * acted on, and a list that reorders itself under a cursor mid-click is a way to
 * cancel the wrong booking. What it does instead is state when it was read — the
 * payload carries `generatedAtIso` — and give the operator a reload button. A
 * visible timestamp and a manual refresh are honest about staleness; a silent
 * background refresh is not.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  GENERIC_OVERVIEW_ERROR,
  OVERVIEW_SESSION_ERROR,
  createLatestRequestGuard,
  interpretAdminOverviewResponse,
  type AdminOverviewPayload,
} from './adminOverviewResponse';

export type { AdminOverviewPayload } from './adminOverviewResponse';

export interface AdminOverviewState {
  readonly data: AdminOverviewPayload | null;
  readonly loading: boolean;
  /** Nothing has arrived yet, so there is nothing to show but a skeleton. */
  readonly initialLoading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useAdminOverview(): AdminOverviewState {
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
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
        const response = await fetchWithAuth('/api/admin/overview', { signal: controller.signal });
        if (!guard.current.isCurrent(ticket)) return;

        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminOverviewResponse(response.status, body);
        if (result.ok) {
          setData(result.payload);
          hasLoaded.current = true;
        } else {
          // The last good payload is kept on screen behind the error rather than
          // cleared: a stale reading that says when it was taken beats a blank
          // page, and the banner says the refresh failed.
          setError(result.error);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!guard.current.isCurrent(ticket)) return;
        setError(
          err instanceof Error && err.message === 'User not authenticated'
            ? OVERVIEW_SESSION_ERROR
            : GENERIC_OVERVIEW_ERROR
        );
      } finally {
        if (guard.current.isCurrent(ticket)) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    data,
    loading,
    initialLoading: loading && !hasLoaded.current,
    error,
    reload,
  };
}
