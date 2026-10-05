'use client';

/**
 * The payments page's data.
 *
 * Same shape as `useAdminRefunds`, with one difference that is the whole point of
 * this page: it takes a `query`. An operator pastes an order, payment or booking
 * id and the trace is read for it; an empty query reads only the recent-orders
 * list. The query is part of the request and of the effect's dependencies, so a
 * new search supersedes the last — the same in-flight guard the other admin pages
 * use keeps a slow earlier read from overwriting a faster later one.
 *
 * No polling, for the reason the other admin reads give: a list that reorders
 * itself under a cursor mid-click is a way to act on the wrong row. The page says
 * when it was read and offers a reload.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  GENERIC_PAYMENTS_ERROR,
  PAYMENTS_SESSION_ERROR,
  createLatestRequestGuard,
  interpretAdminPaymentsResponse,
  type AdminPaymentsPayload,
} from './adminPaymentsResponse';

export type { AdminPaymentsPayload } from './adminPaymentsResponse';

export interface AdminPaymentsState {
  readonly data: AdminPaymentsPayload | null;
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

function urlFor(query: string): string {
  const q = query.trim();
  return q.length > 0 ? `/api/admin/payments?q=${encodeURIComponent(q)}` : '/api/admin/payments';
}

export function useAdminPayments(query: string): AdminPaymentsState {
  const [data, setData] = useState<AdminPaymentsPayload | null>(null);
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
        const response = await fetchWithAuth(urlFor(query), { signal: controller.signal });
        if (!guard.current.isCurrent(ticket)) return;

        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminPaymentsResponse(response.status, body);
        if (result.ok) {
          setData(result.payload);
          hasLoaded.current = true;
        } else {
          // The last good payload stays on screen behind the error rather than
          // being cleared: a stale trace that says when it was taken beats a blank
          // page, and the banner says the refresh failed.
          setError(result.error);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!guard.current.isCurrent(ticket)) return;
        setError(
          err instanceof Error && err.message === 'User not authenticated'
            ? PAYMENTS_SESSION_ERROR
            : GENERIC_PAYMENTS_ERROR
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
