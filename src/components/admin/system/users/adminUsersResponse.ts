/**
 * Interpreting the users endpoints for the screen. Pure and React-free.
 */
import type { UsersRow } from '@/domains/admin/usersTriage';

export interface AdminUsersPayload {
  readonly selfUid: string;
  readonly generatedAtIso: string;
  readonly mode: 'page' | 'emailLookup';
  readonly rows: readonly UsersRow[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  /** Failed read as data: the screen shows a gap, not an empty list. */
  readonly failed: boolean;
  readonly failedReason: string | null;
  readonly administrators:
    | { ok: true; count: number }
    | { ok: false; reason: string }
    | null;
}

export const GENERIC_USERS_ERROR = 'We could not load the accounts just now. Please try again.';
export const USERS_SESSION_ERROR = 'Your session has expired. Sign in again to read the accounts.';
export const USERS_BAD_CURSOR = 'That page cursor is not valid. Go back to the first page.';

export const UNREADABLE_SENTENCE = 'Could not be read just now. Reload to try again.';

export {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from '../../bookings/adminBookingsResponse';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function parseAdministrators(value: unknown): AdminUsersPayload['administrators'] {
  const record = asRecord(value);
  if (!record) return null;
  if (record.ok === true && typeof record.count === 'number') {
    return { ok: true, count: record.count };
  }
  if (record.ok === false && typeof record.reason === 'string' && record.reason) {
    return { ok: false, reason: record.reason };
  }
  return null;
}

export function interpretAdminUsersResponse(
  status: number,
  body: unknown
): { ok: true; payload: AdminUsersPayload } | { ok: false; error: string } {
  const record = asRecord(body);
  if (status === 401) return { ok: false, error: USERS_SESSION_ERROR };
  if (status === 403) {
    return { ok: false, error: 'This console is for admins. Your account does not have access.' };
  }
  if (status === 400) {
    return {
      ok: false,
      error: record && typeof record.error === 'string' ? record.error : USERS_BAD_CURSOR,
    };
  }
  if (status !== 200 || !record || record.success !== true) {
    return { ok: false, error: GENERIC_USERS_ERROR };
  }

  const scan = asRecord(record.users);
  if (!scan) return { ok: false, error: GENERIC_USERS_ERROR };

  const generatedAtIso = typeof record.generatedAtIso === 'string' ? record.generatedAtIso : new Date(0).toISOString();
  const selfUid = typeof record.selfUid === 'string' ? record.selfUid : '';
  const mode = record.mode === 'emailLookup' ? 'emailLookup' : 'page';
  const administrators = parseAdministrators(record.administrators);

  if (scan.ok === false) {
    return {
      ok: true,
      payload: {
        selfUid,
        generatedAtIso,
        mode,
        rows: [],
        hasMore: false,
        nextCursor: null,
        failed: true,
        failedReason:
          typeof scan.reason === 'string' && scan.reason ? scan.reason : UNREADABLE_SENTENCE,
        administrators,
      },
    };
  }
  if (scan.ok !== true || !Array.isArray(scan.rows)) {
    return { ok: false, error: GENERIC_USERS_ERROR };
  }

  const rows: UsersRow[] = scan.rows.filter(
    (row): row is UsersRow => typeof row === 'object' && row !== null && 'id' in row
  );

  return {
    ok: true,
    payload: {
      selfUid,
      generatedAtIso,
      mode,
      rows,
      hasMore: scan.hasMore === true,
      nextCursor:
        typeof record.nextCursor === 'string' && record.nextCursor ? record.nextCursor : null,
      failed: false,
      failedReason: null,
      administrators,
    },
  };
}

/** One mutation response. Known refusals quote the server; silence is indeterminate. */
export function interpretUserMutationResponse(
  status: number,
  body: unknown
): { ok: true; changed: boolean; summary: string } | { ok: false; error: string; indeterminate: boolean } {
  const record = asRecord(body);
  if (status === 200 && record && record.success === true) {
    return {
      ok: true,
      changed: record.changed !== false,
      summary:
        typeof record.summary === 'string' && record.summary
          ? record.summary
          : 'The change was written. Reload to see it settle.',
    };
  }
  const serverError =
    record && typeof record.error === 'string' && record.error.length > 0 ? record.error : null;
  if (serverError) return { ok: false, error: serverError, indeterminate: false };
  return {
    ok: false,
    error: 'The request did not complete, so the account may or may not have changed. Reload before doing anything else.',
    indeterminate: true,
  };
}
