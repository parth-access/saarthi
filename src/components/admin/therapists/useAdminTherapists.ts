'use client';

/**
 * The therapists section's data: the roster, and one therapist's schedule.
 *
 * Both hooks follow the console's established shape — a single read on mount, no
 * polling, an explicit reload, and the last good payload kept on screen behind an
 * error rather than replaced by a blank page. A roster that reordered itself
 * mid-click is a way to open the wrong therapist, and a schedule that refreshed
 * while being read is a way to misremember what it said.
 *
 * The detail hook exposes `notFound` separately from `error`: a therapist id that
 * matches no document is a different fact from a read that failed, and the screen
 * must not offer "try again" for the first.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  GENERIC_THERAPISTS_ERROR,
  THERAPISTS_SESSION_ERROR,
  createLatestRequestGuard,
  interpretAdminTherapistDetailResponse,
  interpretAdminTherapistsResponse,
  type AdminTherapistDetailPayload,
  type AdminTherapistsPayload,
} from './adminTherapistsResponse';

export type {
  AdminTherapistDetailPayload,
  AdminTherapistsPayload,
} from './adminTherapistsResponse';

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function messageFor(err: unknown): string {
  return err instanceof Error && err.message === 'User not authenticated'
    ? THERAPISTS_SESSION_ERROR
    : GENERIC_THERAPISTS_ERROR;
}

export interface AdminTherapistsState {
  readonly data: AdminTherapistsPayload | null;
  readonly loading: boolean;
  readonly initialLoading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
}

export function useAdminTherapists(): AdminTherapistsState {
  const [data, setData] = useState<AdminTherapistsPayload | null>(null);
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
        const response = await fetchWithAuth('/api/admin/therapists', { signal: controller.signal });
        if (!guard.current.isCurrent(ticket)) return;
        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminTherapistsResponse(response.status, body);
        if (result.ok) {
          setData(result.payload);
          hasLoaded.current = true;
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!guard.current.isCurrent(ticket)) return;
        setError(messageFor(err));
      } finally {
        if (guard.current.isCurrent(ticket)) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, loading, initialLoading: loading && !hasLoaded.current, error, reload };
}

export interface AdminTherapistDetailState {
  readonly data: AdminTherapistDetailPayload | null;
  readonly loading: boolean;
  readonly initialLoading: boolean;
  readonly error: string | null;
  /** True only for a 404 — an id that matches no therapist. */
  readonly notFound: boolean;
  readonly reload: () => void;
}

export function useAdminTherapistDetail(therapistId: string): AdminTherapistDetailState {
  const [data, setData] = useState<AdminTherapistDetailPayload | null>(null);
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
          `/api/admin/therapists/${encodeURIComponent(therapistId)}`,
          { signal: controller.signal }
        );
        if (!guard.current.isCurrent(ticket)) return;
        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        // A 404 is a fact about the id, not a failure to read — kept apart so the
        // screen does not offer a retry that can never succeed.
        if (response.status === 404 || response.status === 400) {
          setNotFound(true);
          hasLoaded.current = true;
          return;
        }

        const result = interpretAdminTherapistDetailResponse(response.status, body);
        if (result.ok) {
          setData(result.payload);
          hasLoaded.current = true;
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!guard.current.isCurrent(ticket)) return;
        setError(messageFor(err));
      } finally {
        if (guard.current.isCurrent(ticket)) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [therapistId, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, loading, initialLoading: loading && !hasLoaded.current, error, notFound, reload };
}
