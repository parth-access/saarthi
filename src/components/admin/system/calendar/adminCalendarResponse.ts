/**
 * Interpreting `GET /api/admin/calendar` for the screen.
 *
 * Pure and React-free, so every rule about what the browser may conclude from a
 * response is tested here rather than discovered in a component. Mirrors
 * `adminRefundsResponse.ts`: the last good payload survives a failed refresh,
 * and a scan that reports `{ ok: false }` becomes a named gap, never an empty
 * list.
 */
import type {
  CalendarProblemRow,
  CalendarProblemScan,
} from '@/domains/admin/calendarTriage';

export {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from '../../bookings/adminBookingsResponse';

export interface AdminCalendarPayload {
  readonly generatedAtIso: string;
  readonly problems: CalendarProblemScan;
  /** The per-scan document cap, so the UI can explain what "60+" means. */
  readonly scanLimit: number;
}

export const GENERIC_CALENDAR_ERROR =
  'We could not load the calendar list just now. Please try again.';
export const CALENDAR_SESSION_ERROR =
  'Your session has expired. Sign in again to read the calendar list.';

const UNREADABLE_SENTENCE = 'Could not be read just now. Reload to try again.';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function parseScan(value: unknown): CalendarProblemScan | null {
  const scan = asRecord(value);
  if (!scan) return null;
  if (scan.ok === true) {
    if (!Array.isArray(scan.rows)) return null;
    const rows: CalendarProblemRow[] = scan.rows.filter(
      (row): row is CalendarProblemRow => typeof row === 'object' && row !== null && 'id' in row
    );
    return { ok: true, rows, atLeast: scan.atLeast === true };
  }
  if (scan.ok === false) {
    return {
      ok: false,
      reason: typeof scan.reason === 'string' && scan.reason.length > 0 ? scan.reason : UNREADABLE_SENTENCE,
    };
  }
  return null;
}

export function interpretAdminCalendarResponse(
  status: number,
  body: unknown
): { ok: true; payload: AdminCalendarPayload } | { ok: false; error: string } {
  const record = asRecord(body);
  if (status === 401) return { ok: false, error: CALENDAR_SESSION_ERROR };
  if (status === 403) {
    return { ok: false, error: 'This console is for admins. Your account does not have access.' };
  }
  if (status !== 200 || !record || record.success !== true) {
    return { ok: false, error: GENERIC_CALENDAR_ERROR };
  }

  const problems = parseScan(record.problems);
  if (!problems) return { ok: false, error: GENERIC_CALENDAR_ERROR };

  const generatedAtIso = typeof record.generatedAtIso === 'string' ? record.generatedAtIso : null;
  const scanLimit =
    typeof record.scanLimit === 'number' && Number.isFinite(record.scanLimit) ? record.scanLimit : 60;

  return {
    ok: true,
    payload: {
      generatedAtIso: generatedAtIso ?? new Date(0).toISOString(),
      problems,
      scanLimit,
    },
  };
}

/**
 * The sentence for a scan the server could not read, or `null` when the list is
 * real. Rendered as a named gap — an operator who sees a blank list must be able
 * to tell "no session is missing a link" from "this read failed".
 */
export function describeCalendarGaps(payload: AdminCalendarPayload): string | null {
  return payload.problems.ok ? null : payload.problems.reason;
}
