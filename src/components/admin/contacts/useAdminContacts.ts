'use client';

/**
 * The Contacts page's data: cursor-paged accumulation. Each "Load more" appends
 * a page and keeps the previous ones — the filters see everything this session
 * has read, and the screen says exactly that.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  GENERIC_CONTACTS_ERROR,
  CONTACTS_SESSION_ERROR,
  createLatestRequestGuard,
  interpretAdminContactsResponse,
  type ContactsPagePayload,
} from './adminContactsResponse';

export interface AdminContactsState {
  /** Everything read so far, newest page first to last. */
  readonly rows: readonly import('@/domains/admin/contactTriage').ContactRow[];
  readonly loading: boolean;
  readonly initialLoading: boolean;
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly error: string | null;
  /** Set when the newest read failed while older rows are still on screen. */
  readonly stale: boolean;
  readonly generatedAtIso: string | null;
  readonly failed: boolean;
  readonly failedReason: string | null;
  readonly reload: () => void;
  readonly loadMore: () => void;
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useAdminContacts(): AdminContactsState {
  const [pages, setPages] = useState<ContactsPagePayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
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
        const response = await fetchWithAuth('/api/admin/contacts', { signal: controller.signal });
        if (!guard.current.isCurrent(ticket)) return;
        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminContactsResponse(response.status, body);
        if (result.ok) {
          nextCursorRef.current = result.page.nextCursor;
          setPages([result.page]);
          hasLoaded.current = true;
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!guard.current.isCurrent(ticket)) return;
        setError(
          err instanceof Error && err.message === 'User not authenticated'
            ? CONTACTS_SESSION_ERROR
            : GENERIC_CONTACTS_ERROR
        );
      } finally {
        if (guard.current.isCurrent(ticket)) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const loadMore = useCallback(() => {
    if (loadingMore || !nextCursorRef.current) return;
    const cursor = nextCursorRef.current;
    const ticket = guard.current.begin();

    setLoadingMore(true);
    (async () => {
      try {
        const response = await fetchWithAuth(
          `/api/admin/contacts?cursor=${encodeURIComponent(cursor)}`
        );
        if (!guard.current.isCurrent(ticket)) return;
        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminContactsResponse(response.status, body);
        if (result.ok) {
          nextCursorRef.current = result.page.nextCursor;
          // An accumulated read that half-fails keeps its earlier pages; the
          // failed page is surfaced, never silently swallowed.
          setPages((previous) => [...previous, result.page]);
        } else {
          setError(result.error);
        }
      } catch {
        if (!guard.current.isCurrent(ticket)) return;
        setError(GENERIC_CONTACTS_ERROR);
      } finally {
        if (guard.current.isCurrent(ticket)) setLoadingMore(false);
      }
    })();
  }, [loadingMore]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const rows = pages.flatMap((page) => page.rows);
  const lastPage = pages[pages.length - 1] ?? null;
  const failedPage = pages.find((page) => page.failed) ?? null;

  return {
    rows,
    loading,
    initialLoading: loading && !hasLoaded.current,
    loadingMore,
    hasMore: Boolean(nextCursorRef.current),
    error,
    stale: Boolean(error) && rows.length > 0,
    generatedAtIso: lastPage?.generatedAtIso ?? null,
    failed: Boolean(failedPage),
    failedReason: failedPage?.failedReason ?? null,
    reload,
    loadMore,
  };
}
