'use client';

/**
 * The Users page's data: cursor-paged accumulation like Contacts, with one
 * difference — the role filter is applied server-side (an equality query over
 * the whole collection), so changing it refetches page one rather than
 * narrowing what is already on screen. The exact-email lookup is an explicit
 * run, and carries its own state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import type { UserRole } from '@/domains/admin/usersTriage';
import {
  GENERIC_USERS_ERROR,
  USERS_SESSION_ERROR,
  createLatestRequestGuard,
  interpretAdminUsersResponse,
  type AdminUsersPayload,
} from './adminUsersResponse';

export interface AdminUsersState {
  /** Everything read so far for the current filter, newest page first to last. */
  readonly rows: readonly import('@/domains/admin/usersTriage').UsersRow[];
  readonly selfUid: string;
  readonly generatedAtIso: string | null;
  readonly administrators: AdminUsersPayload['administrators'];
  readonly roleFilter: UserRole | 'all';
  readonly setRoleFilter: (role: UserRole | 'all') => void;
  readonly loading: boolean;
  readonly initialLoading: boolean;
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly error: string | null;
  /** Set when the newest read failed while older rows are still on screen. */
  readonly stale: boolean;
  readonly failed: boolean;
  readonly failedReason: string | null;
  readonly reload: () => void;
  readonly loadMore: () => void;
  readonly lookup: LookupState;
  readonly runLookup: (email: string) => void;
  readonly clearLookup: () => void;
}

export interface LookupState {
  readonly status: 'idle' | 'loading' | 'done' | 'error';
  readonly rows: readonly import('@/domains/admin/usersTriage').UsersRow[];
  readonly error: string | null;
  readonly generatedAtIso: string | null;
}

const IDLE_LOOKUP: LookupState = { status: 'idle', rows: [], error: null, generatedAtIso: null };

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useAdminUsers(): AdminUsersState {
  const [pages, setPages] = useState<AdminUsersPayload[]>([]);
  const [roleFilter, setRoleFilterState] = useState<UserRole | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [lookup, setLookup] = useState<LookupState>(IDLE_LOOKUP);
  const hasLoaded = useRef(false);
  const guard = useRef(createLatestRequestGuard());
  const nextCursorRef = useRef<string | null>(null);
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
        const suffix = roleFilter === 'all' ? '' : `&role=${encodeURIComponent(roleFilter)}`;
        const response = await fetchWithAuth(`/api/admin/users?read=page${suffix}`, {
          signal: controller.signal,
        });
        if (!guard.current.isCurrent(ticket)) return;
        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminUsersResponse(response.status, body);
        if (result.ok) {
          nextCursorRef.current = result.payload.nextCursor;
          setPages([result.payload]);
          hasLoaded.current = true;
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!guard.current.isCurrent(ticket)) return;
        setError(
          err instanceof Error && err.message === 'User not authenticated'
            ? USERS_SESSION_ERROR
            : GENERIC_USERS_ERROR
        );
      } finally {
        if (guard.current.isCurrent(ticket)) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadToken, roleFilter]);

  const loadMore = useCallback(() => {
    if (loadingMore || !nextCursorRef.current) return;
    const cursor = nextCursorRef.current;
    const suffix = roleFilter === 'all' ? '' : `&role=${encodeURIComponent(roleFilter)}`;
    const ticket = guard.current.begin();

    setLoadingMore(true);
    (async () => {
      try {
        const response = await fetchWithAuth(
          `/api/admin/users?cursor=${encodeURIComponent(cursor)}${suffix}`
        );
        if (!guard.current.isCurrent(ticket)) return;
        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminUsersResponse(response.status, body);
        if (result.ok) {
          nextCursorRef.current = result.payload.nextCursor;
          // An accumulated read that half-fails keeps its earlier pages; the
          // failed page is surfaced, never silently swallowed.
          setPages((previous) => [...previous, result.payload]);
        } else {
          setError(result.error);
        }
      } catch {
        if (!guard.current.isCurrent(ticket)) return;
        setError(GENERIC_USERS_ERROR);
      } finally {
        if (guard.current.isCurrent(ticket)) setLoadingMore(false);
      }
    })();
  }, [loadingMore, roleFilter]);

  const runLookup = useCallback((email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return;
    const ticket = guard.current.begin();

    setLookup({ status: 'loading', rows: [], error: null, generatedAtIso: null });
    (async () => {
      try {
        const response = await fetchWithAuth(
          `/api/admin/users?email=${encodeURIComponent(trimmed)}`
        );
        if (!guard.current.isCurrent(ticket)) return;
        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminUsersResponse(response.status, body);
        if (result.ok) {
          setLookup({
            status: 'done',
            rows: result.payload.rows,
            error: result.payload.failed ? (result.payload.failedReason ?? GENERIC_USERS_ERROR) : null,
            generatedAtIso: result.payload.generatedAtIso,
          });
        } else {
          setLookup({ status: 'error', rows: [], error: result.error, generatedAtIso: null });
        }
      } catch {
        if (!guard.current.isCurrent(ticket)) return;
        setLookup({ status: 'error', rows: [], error: GENERIC_USERS_ERROR, generatedAtIso: null });
      }
    })();
  }, []);

  const clearLookup = useCallback(() => setLookup(IDLE_LOOKUP), []);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const setRoleFilter = useCallback((role: UserRole | 'all') => setRoleFilterState(role), []);

  const rows = pages.flatMap((page) => page.rows);
  const lastPage = pages[pages.length - 1] ?? null;
  const failedPage = pages.find((page) => page.failed) ?? null;

  return {
    rows,
    selfUid: lastPage?.selfUid ?? '',
    generatedAtIso: lastPage?.generatedAtIso ?? null,
    administrators: lastPage?.administrators ?? null,
    roleFilter,
    setRoleFilter,
    loading,
    initialLoading: loading && !hasLoaded.current,
    loadingMore,
    hasMore: Boolean(nextCursorRef.current),
    error,
    stale: Boolean(error) && rows.length > 0,
    failed: Boolean(failedPage),
    failedReason: failedPage?.failedReason ?? null,
    reload,
    loadMore,
    lookup,
    runLookup,
    clearLookup,
  };
}
