'use client';

/**
 * The refunds page's data.
 *
 * Same shape as `useAdminOverview`: everything that decides what an operator sees
 * lives in `adminRefundsResponse.ts` and is tested there, and what is left here is
 * the part that needs React.
 *
 * No polling, for the same reason as the overview — a list that reorders itself
 * under a cursor mid-click is a way to act on the wrong row — and one extra reason
 * that is specific to this page: the refunds job runs every five minutes, so a row
 * can change standing between two reads. The page states when it was read and
 * offers a reload, rather than shifting silently while somebody is looking at it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  GENERIC_REFUNDS_ERROR,
  REFUNDS_SESSION_ERROR,
  createLatestRequestGuard,
  interpretAdminRefundsResponse,
  type AdminRefundsPayload,
} from './adminRefundsResponse';

export type { AdminRefundsPayload } from './adminRefundsResponse';

export interface AdminRefundsState {
  readonly data: AdminRefundsPayload | null;
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

export function useAdminRefunds(): AdminRefundsState {
  const [data, setData] = useState<AdminRefundsPayload | null>(null);
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
        const response = await fetchWithAuth('/api/admin/refunds', { signal: controller.signal });
        if (!guard.current.isCurrent(ticket)) return;

        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminRefundsResponse(response.status, body);
        if (result.ok) {
          setData(result.payload);
          hasLoaded.current = true;
        } else {
          // The last good payload stays on screen behind the error rather than
          // being cleared: a stale list that says when it was taken beats a blank
          // page, and the banner says the refresh failed.
          setError(result.error);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!guard.current.isCurrent(ticket)) return;
        setError(
          err instanceof Error && err.message === 'User not authenticated'
            ? REFUNDS_SESSION_ERROR
            : GENERIC_REFUNDS_ERROR
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
