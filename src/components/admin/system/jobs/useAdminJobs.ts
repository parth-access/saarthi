'use client';

/**
 * The Background jobs page's data. Same contract as `useAdminRefunds`; no
 * polling, because the processor is also working these queues and a list that
 * reorders itself mid-click is a way to act on the wrong row.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  GENERIC_JOBS_ERROR,
  JOBS_SESSION_ERROR,
  createLatestRequestGuard,
  interpretAdminJobsResponse,
  type AdminJobsPayload,
} from './adminJobsResponse';

export type { AdminJobsPayload } from './adminJobsResponse';

export interface AdminJobsState {
  readonly data: AdminJobsPayload | null;
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

export function useAdminJobs(): AdminJobsState {
  const [data, setData] = useState<AdminJobsPayload | null>(null);
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
        const response = await fetchWithAuth('/api/admin/jobs', { signal: controller.signal });
        if (!guard.current.isCurrent(ticket)) return;

        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminJobsResponse(response.status, body);
        if (result.ok) {
          setData(result.payload);
          hasLoaded.current = true;
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!guard.current.isCurrent(ticket)) return;
        setError(
          err instanceof Error && err.message === 'User not authenticated'
            ? JOBS_SESSION_ERROR
            : GENERIC_JOBS_ERROR
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
