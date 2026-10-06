/**
 * Interpreting the contacts endpoints for the screen. Pure and React-free.
 */
import type { ContactRow } from '@/domains/admin/contactTriage';

export interface ContactsPagePayload {
  readonly generatedAtIso: string;
  readonly rows: readonly ContactRow[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  /** Failed read as data: the screen shows a gap, not an empty list. */
  readonly failed: boolean;
  readonly failedReason: string | null;
}

export const GENERIC_CONTACTS_ERROR =
  'We could not load the inquiries just now. Please try again.';
export const CONTACTS_SESSION_ERROR =
  'Your session has expired. Sign in again to read the inquiries.';
export const CONTACTS_BAD_CURSOR = 'That page cursor is not valid. Go back to the first page.';

export const UNREADABLE_SENTENCE = 'Could not be read just now. Reload to try again.';

export {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from '../bookings/adminBookingsResponse';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function interpretAdminContactsResponse(
  status: number,
  body: unknown
): { ok: true; page: ContactsPagePayload } | { ok: false; error: string } {
  const record = asRecord(body);
  if (status === 401) return { ok: false, error: CONTACTS_SESSION_ERROR };
  if (status === 403) {
    return { ok: false, error: 'This console is for admins. Your account does not have access.' };
  }
  if (status === 400) {
    return {
      ok: false,
      error: record && typeof record.error === 'string' ? record.error : CONTACTS_BAD_CURSOR,
    };
  }
  if (status !== 200 || !record || record.success !== true) {
    return { ok: false, error: GENERIC_CONTACTS_ERROR };
  }

  const scan = asRecord(record.contacts);
  if (!scan) return { ok: false, error: GENERIC_CONTACTS_ERROR };

  const generatedAtIso = typeof record.generatedAtIso === 'string' ? record.generatedAtIso : null;

  if (scan.ok === false) {
    return {
      ok: true,
      page: {
        generatedAtIso: generatedAtIso ?? new Date(0).toISOString(),
        rows: [],
        hasMore: false,
        nextCursor: null,
        failed: true,
        failedReason:
          typeof scan.reason === 'string' && scan.reason ? scan.reason : UNREADABLE_SENTENCE,
      },
    };
  }
  if (scan.ok !== true || !Array.isArray(scan.rows)) {
    return { ok: false, error: GENERIC_CONTACTS_ERROR };
  }

  const rows: ContactRow[] = scan.rows.filter(
    (row): row is ContactRow => typeof row === 'object' && row !== null && 'id' in row
  );

  return {
    ok: true,
    page: {
      generatedAtIso: generatedAtIso ?? new Date(0).toISOString(),
      rows,
      hasMore: scan.hasMore === true,
      nextCursor: typeof record.nextCursor === 'string' && record.nextCursor ? record.nextCursor : null,
      failed: false,
      failedReason: null,
    },
  };
}

/** One status-update or delete response. A known refusal quotes the server. */
export function interpretContactMutationResponse(
  status: number,
  body: unknown
): { ok: true } | { ok: false; error: string; indeterminate: boolean } {
  const record = asRecord(body);
  if (status === 200 && record && record.success === true) return { ok: true };
  const serverError =
    record && typeof record.error === 'string' && record.error.length > 0 ? record.error : null;
  if (serverError) return { ok: false, error: serverError, indeterminate: false };
  return {
    ok: false,
    error: 'The request did not complete, so the inquiry may or may not have changed. Reload before doing anything else.',
    indeterminate: true,
  };
}
