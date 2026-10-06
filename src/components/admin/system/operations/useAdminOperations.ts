'use client';

/**
 * The Operations screen's data: one dashboard read, and an explicit search the
 * operator triggers. Same honesty contract as every other section — no polling
 * (the timeline is not actually live, and a list that shifts under a click is
 * how the wrong row gets acted on).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  GENERIC_OPERATIONS_ERROR,
  OPERATIONS_SESSION_ERROR,
  createLatestRequestGuard,
  interpretAdminOperationsResponse,
  interpretOperationsSearchResponse,
  type OperationsSearchInterpretation,
} from './adminOperationsResponse';
import type { OperationsDashboardPayload, SearchResultsPayload } from '@/domains/admin/operationsTriage';

export type { OperationsDashboardPayload } from '@/domains/admin/operationsTriage';

export interface AdminOperationsState {
  readonly data: OperationsDashboardPayload | null;
  readonly loading: boolean;
  readonly initialLoading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
}

export interface OperationsSearchState {
  readonly result: SearchResultsPayload | null;
  readonly loading: boolean;
  readonly error: string | null;
  /** Whether a search has completed at all — "no results" needs it to exist. */
  readonly ran: boolean;
  readonly run: (term: string) => void;
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useAdminOperations(): AdminOperationsState {
  const [data, setData] = useState<OperationsDashboardPayload | null>(null);
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
        const response = await fetchWithAuth('/api/operations/dashboard', {
          signal: controller.signal,
        });
        if (!guard.current.isCurrent(ticket)) return;
        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminOperationsResponse(response.status, body);
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
            ? OPERATIONS_SESSION_ERROR
            : GENERIC_OPERATIONS_ERROR
        );
      } finally {
        if (guard.current.isCurrent(ticket)) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, loading, initialLoading: loading && !hasLoaded.current, error, reload };
}

export function useOperationsSearch(): OperationsSearchState {
  const [result, setResult] = useState<SearchResultsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);
  const guard = useRef(createLatestRequestGuard());

  const run = useCallback((input: string) => {
    const query = input.trim();
    if (query.length < 3 || loading) return;
    const ticket = guard.current.begin();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const response = await fetchWithAuth(
          `/api/operations/search?q=${encodeURIComponent(query)}`
        );
        if (!guard.current.isCurrent(ticket)) return;
        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const interpretation: OperationsSearchInterpretation = interpretOperationsSearchResponse(
          response.status,
          body,
          query
        );
        setRan(true);
        if (interpretation.ok) {
          setResult(interpretation.payload);
        } else {
          setError(interpretation.error);
        }
      } catch {
        if (!guard.current.isCurrent(ticket)) return;
        setRan(true);
        setError('The search did not complete. Try again.');
      } finally {
        if (guard.current.isCurrent(ticket)) setLoading(false);
      }
    })();
  }, [loading]);

  return { result, loading, error, ran, run };
}
