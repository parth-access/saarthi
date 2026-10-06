/**
 * Interpreting `GET /api/admin/emails` for the Email operations screen. Pure and
 * React-free, like every other list interpreter: the last good payload survives
 * a failed refresh, a failed scan is a named gap, and a 400 (bad booking id in
 * the lookup) is a fact about the request, not a retryable failure.
 */
import type { EmailLogRow, EmailLogScan } from '@/domains/admin/emailTriage';

export interface AdminEmailsPayload {
  readonly generatedAtIso: string;
  readonly emails: EmailLogScan;
  /** Set when the list was read for one booking, so the screen can say so. */
  readonly bookingId: string | null;
  readonly scanLimit: number;
}

export const GENERIC_EMAILS_ERROR =
  'We could not load the email log just now. Please try again.';
export const EMAILS_SESSION_ERROR =
  'Your session has expired. Sign in again to read the email log.';
export const EMAILS_BAD_BOOKING_ID = 'That is not a valid booking id.';

export {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from '../../bookings/adminBookingsResponse';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function parseScan(value: unknown): EmailLogScan | null {
  const scan = asRecord(value);
  if (!scan) return null;
  if (scan.ok === true) {
    if (!Array.isArray(scan.rows)) return null;
    const rows: EmailLogRow[] = scan.rows.filter(
      (row): row is EmailLogRow => typeof row === 'object' && row !== null && 'id' in row
    );
    return { ok: true, rows, atLeast: scan.atLeast === true };
  }
  if (scan.ok === false && typeof scan.reason === 'string') {
    return { ok: false, reason: scan.reason };
  }
  return null;
}

export function interpretAdminEmailsResponse(
  status: number,
  body: unknown
): { ok: true; payload: AdminEmailsPayload } | { ok: false; error: string } {
  const record = asRecord(body);
  if (status === 401) return { ok: false, error: EMAILS_SESSION_ERROR };
  if (status === 403) {
    return { ok: false, error: 'This console is for admins. Your account does not have access.' };
  }
  if (status === 400) {
    return { ok: false, error: record && typeof record.error === 'string' ? record.error : EMAILS_BAD_BOOKING_ID };
  }
  if (status !== 200 || !record || record.success !== true) {
    return { ok: false, error: GENERIC_EMAILS_ERROR };
  }

  const emails = parseScan(record.emails);
  if (!emails) return { ok: false, error: GENERIC_EMAILS_ERROR };

  const generatedAtIso = typeof record.generatedAtIso === 'string' ? record.generatedAtIso : null;
  const scanLimit =
    typeof record.scanLimit === 'number' && Number.isFinite(record.scanLimit) ? record.scanLimit : 100;

  return {
    ok: true,
    payload: {
      generatedAtIso: generatedAtIso ?? new Date(0).toISOString(),
      emails,
      bookingId: typeof record.bookingId === 'string' ? record.bookingId : null,
      scanLimit,
    },
  };
}
