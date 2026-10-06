'use client';

/**
 * The Email operations page's data. `bookingId` is part of the identity of the
 * read: `null` means "most recent slice", a value means "every email logged for
 * this booking", and switching it refetches rather than filtering in place —
 * the two answers come from different queries.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  GENERIC_EMAILS_ERROR,
  EMAILS_SESSION_ERROR,
  createLatestRequestGuard,
  interpretAdminEmailsResponse,
  type AdminEmailsPayload,
} from './adminEmailsResponse';

export type { AdminEmailsPayload } from './adminEmailsResponse';

export interface AdminEmailsState {
  readonly data: AdminEmailsPayload | null;
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

export function useAdminEmails(bookingId: string | null): AdminEmailsState {
  const [data, setData] = useState<AdminEmailsPayload | null>(null);
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
        const url = bookingId
          ? `/api/admin/emails?bookingId=${encodeURIComponent(bookingId)}`
          : '/api/admin/emails';
        const response = await fetchWithAuth(url, { signal: controller.signal });
        if (!guard.current.isCurrent(ticket)) return;

        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminEmailsResponse(response.status, body);
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
            ? EMAILS_SESSION_ERROR
            : GENERIC_EMAILS_ERROR
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
    reload,
  };
}
