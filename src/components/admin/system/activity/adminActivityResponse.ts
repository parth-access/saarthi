/**
 * Interpreting `GET /api/admin/activity` for the screen. Pure and React-free.
 * A 400 (bad filter combination) is a request fact with a readable explanation,
 * distinct from a failed read, which is data on the page.
 */
import type { ActivityEntry } from '@/app/api/admin/activity/activitySources';
import type { ActivityFilter, ActivitySource } from '@/domains/admin/activityQuery';

export interface ActivityPagePayload {
  readonly generatedAtIso: string;
  readonly source: ActivitySource;
  readonly entries: readonly ActivityEntry[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly appliedFilter: ActivityFilter | null;
  readonly pageSize: number;
  readonly failed: boolean;
  readonly failedReason: string | null;
}

export const GENERIC_ACTIVITY_ERROR =
  'We could not load the activity log just now. Please try again.';
export const ACTIVITY_SESSION_ERROR =
  'Your session has expired. Sign in again to read the activity log.';

export const UNREADABLE_SENTENCE = 'Could not be read just now. Reload to try again.';

export {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from '../../bookings/adminBookingsResponse';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function interpretAdminActivityResponse(
  status: number,
  body: unknown
): { ok: true; page: ActivityPagePayload } | { ok: false; error: string } {
  const record = asRecord(body);
  if (status === 401) return { ok: false, error: ACTIVITY_SESSION_ERROR };
  if (status === 403) {
    return { ok: false, error: 'This console is for admins. Your account does not have access.' };
  }
  if (status === 400) {
    return {
      ok: false,
      error: record && typeof record.error === 'string' ? record.error : 'That filter is not one the log supports.',
    };
  }
  if (status !== 200 || !record || record.success !== true) {
    return { ok: false, error: GENERIC_ACTIVITY_ERROR };
  }

  const scan = asRecord(record.activity);
  if (!scan) return { ok: false, error: GENERIC_ACTIVITY_ERROR };

  const generatedAtIso = typeof record.generatedAtIso === 'string' ? record.generatedAtIso : null;
  const source: ActivitySource = record.source === 'audit' ? 'audit' : 'timeline';
  const pageSize =
    typeof record.pageSize === 'number' && Number.isFinite(record.pageSize) ? record.pageSize : 30;

  if (scan.ok === false) {
    return {
      ok: true,
      page: {
        generatedAtIso: generatedAtIso ?? new Date(0).toISOString(),
        source,
        entries: [],
        hasMore: false,
        nextCursor: null,
        appliedFilter: null,
        pageSize,
        failed: true,
        failedReason:
          typeof scan.reason === 'string' && scan.reason ? scan.reason : UNREADABLE_SENTENCE,
      },
    };
  }
  if (scan.ok !== true || !Array.isArray(scan.entries)) {
    return { ok: false, error: GENERIC_ACTIVITY_ERROR };
  }

  const entries: ActivityEntry[] = scan.entries.filter(
    (entry): entry is ActivityEntry => typeof entry === 'object' && entry !== null && 'id' in entry
  );

  return {
    ok: true,
    page: {
      generatedAtIso: generatedAtIso ?? new Date(0).toISOString(),
      source,
      entries,
      hasMore: scan.hasMore === true,
      nextCursor: typeof record.nextCursor === 'string' && record.nextCursor ? record.nextCursor : null,
      appliedFilter: asRecord(record.appliedFilter)
        ? (record.appliedFilter as ActivityFilter)
        : null,
      pageSize,
      failed: false,
      failedReason: null,
    },
  };
}
