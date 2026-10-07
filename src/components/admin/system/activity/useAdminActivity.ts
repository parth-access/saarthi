'use client';

/**
 * The Activity log's data: cursor-paged accumulation, keyed on the filter —
 * changing the filter restarts the read, because the pages come from different
 * queries and appending them would interleave two answers.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  GENERIC_ACTIVITY_ERROR,
  ACTIVITY_SESSION_ERROR,
  createLatestRequestGuard,
  interpretAdminActivityResponse,
  type ActivityPagePayload,
} from './adminActivityResponse';
import type { ActivityFilter, ActivitySource } from '@/domains/admin/activityQuery';

export interface AdminActivityState {
  readonly pages: readonly ActivityPagePayload[];
  readonly entries: readonly import('@/app/api/admin/activity/activitySources').ActivityEntry[];
  readonly loading: boolean;
  readonly initialLoading: boolean;
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly error: string | null;
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

function filterParams(filter: ActivityFilter | null): string {
  if (!filter) return '';
  return `&${filter.kind}=${encodeURIComponent(filter.value)}`;
}

export function useAdminActivity(filter: ActivityFilter | null, source: ActivitySource = 'timeline'): AdminActivityState {
  const [pages, setPages] = useState<ActivityPagePayload[]>([]);
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
        const response = await fetchWithAuth(
          `/api/admin/activity?pageSize=30&source=${encodeURIComponent(source)}${filterParams(filter)}`,
          { signal: controller.signal }
        );
        if (!guard.current.isCurrent(ticket)) return;
        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminActivityResponse(response.status, body);
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
            ? ACTIVITY_SESSION_ERROR
            : GENERIC_ACTIVITY_ERROR
        );
      } finally {
        if (guard.current.isCurrent(ticket)) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [filter, source, reloadToken]);

  const loadMore = useCallback(() => {
    if (loadingMore || !nextCursorRef.current) return;
    const cursor = nextCursorRef.current;
    const ticket = guard.current.begin();

    setLoadingMore(true);
    (async () => {
      try {
        const response = await fetchWithAuth(
          `/api/admin/activity?pageSize=30&source=${encodeURIComponent(source)}${filterParams(filter)}&cursor=${encodeURIComponent(cursor)}`
        );
        if (!guard.current.isCurrent(ticket)) return;
        const body = await parseJson(response);
        if (!guard.current.isCurrent(ticket)) return;

        const result = interpretAdminActivityResponse(response.status, body);
        if (result.ok) {
          nextCursorRef.current = result.page.nextCursor;
          setPages((previous) => [...previous, result.page]);
        } else {
          setError(result.error);
        }
      } catch {
        if (!guard.current.isCurrent(ticket)) return;
        setError(GENERIC_ACTIVITY_ERROR);
      } finally {
        if (guard.current.isCurrent(ticket)) setLoadingMore(false);
      }
    })();
  }, [filter, source, loadingMore]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const lastPage = pages[pages.length - 1] ?? null;
  const failedPage = pages.find((page) => page.failed) ?? null;

  return {
    pages,
    entries: pages.flatMap((page) => page.entries),
    loading,
    initialLoading: loading && !hasLoaded.current,
    loadingMore,
    hasMore: Boolean(nextCursorRef.current),
    error,
    generatedAtIso: lastPage?.generatedAtIso ?? null,
    failed: Boolean(failedPage),
    failedReason: failedPage?.failedReason ?? null,
    reload,
    loadMore,
  };
}
