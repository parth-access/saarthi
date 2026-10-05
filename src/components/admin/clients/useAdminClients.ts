'use client';

/**
 * The clients page's data.
 *
 * Same shape as the payments hook, and for the same reason: it takes a `query`. An
 * operator types an email and the profile is read for it; an empty query reads only
 * the recent-activity list. The query is part of the request and of the effect's
 * dependencies, so a new search supersedes the last, and the shared in-flight guard
 * keeps a slow earlier read from overwriting a faster later one.
 *
 * No polling: a list that reorders itself mid-click is a way to open the wrong
 * client. The page says when it was read and offers a reload.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  GENERIC_CLIENTS_ERROR,
  CLIENTS_SESSION_ERROR,
  createLatestRequestGuard,
  interpretAdminClientsResponse,
  type AdminClientsPayload,
} from './adminClientsResponse';

export type { AdminClientsPayload } from './adminClientsResponse';

export interface AdminClientsState {
  readonly data: AdminClientsPayload | null;
  readonly loading: boolean;
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
  return q.length > 0 ? `/api/admin/clients?q=${encodeURIComponent(q)}` : '/api/admin/clients';
}

export function useAdminClients(query: string): AdminClientsState {
  const [data, setData] = useState<AdminClientsPayload | null>(null);
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

        const result = interpretAdminClientsResponse(response.status, body);
        if (result.ok) {
          setData(result.payload);
          hasLoaded.current = true;
        } else {
          // The last good payload stays on screen behind the error rather than being
          // cleared: a stale profile that says when it was read beats a blank page.
          setError(result.error);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!guard.current.isCurrent(ticket)) return;
        setError(
          err instanceof Error && err.message === 'User not authenticated'
            ? CLIENTS_SESSION_ERROR
            : GENERIC_CLIENTS_ERROR
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
