'use client';

/**
 * The Calendar & Meet page's data. Same contract as `useAdminRefunds`: the
 * response rules live in `adminCalendarResponse.ts` and are tested there; this
 * is the part that needs React. No polling — the scheduled job is also working
 * this queue, and a list that shifts under a cursor mid-click is a way to act on
 * the wrong row.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  GENERIC_CALENDAR_ERROR,
  CALENDAR_SESSION_ERROR,
  createLatestRequestGuard,
  interpretAdminCalendarResponse,
  type AdminCalendarPayload,
} from './adminCalendarResponse';

export type { AdminCalendarPayload } from './adminCalendarResponse';

export interface AdminCalendarState {
  readonly data: AdminCalendarPayload | null;
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

export function useAdminCalendar(): AdminCalendarState {
  const [data, setData] = useState<AdminCalendarPayload | null>(null);
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
        const response = await fetchWithAuth('/api/admin/calendar', { signal: controller.signal });
        if (!guard.current.isCurrent(ticket)) return;

        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminCalendarResponse(response.status, body);
        if (result.ok) {
          setData(result.payload);
          hasLoaded.current = true;
        } else {
          // The last good payload stays on screen behind the error.
          setError(result.error);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!guard.current.isCurrent(ticket)) return;
        setError(
          err instanceof Error && err.message === 'User not authenticated'
            ? CALENDAR_SESSION_ERROR
            : GENERIC_CALENDAR_ERROR
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
