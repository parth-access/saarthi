/**
 * Interpreting `GET /api/admin/jobs` for the screen. Pure and React-free — the
 * same rules as every other list: the last good payload survives a failed
 * refresh, and a slice that reports `{ ok: false }` becomes a named gap.
 */
import type {
  JobEmailRow,
  JobEventRow,
  JobScan,
} from '@/domains/admin/jobsTriage';

export type { JobScan };

export interface AdminJobsPayload {
  readonly generatedAtIso: string;
  readonly outbox: {
    readonly waiting: JobScan<JobEventRow>;
    readonly failed: JobScan<JobEventRow>;
    readonly dead: JobScan<JobEventRow>;
  };
  readonly emails: {
    readonly queued: JobScan<JobEmailRow>;
    readonly failed: JobScan<JobEmailRow>;
  };
  readonly scanLimit: number;
}

export const GENERIC_JOBS_ERROR =
  'We could not load the background jobs just now. Please try again.';
export const JOBS_SESSION_ERROR =
  'Your session has expired. Sign in again to read the background jobs.';

const UNREADABLE_SENTENCE = 'Could not be read just now. Reload to try again.';

export {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from '../../bookings/adminBookingsResponse';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function parseScan<Row>(value: unknown, isRow: (row: unknown) => row is Row): JobScan<Row> | null {
  const scan = asRecord(value);
  if (!scan) return null;
  if (scan.ok === true) {
    if (!Array.isArray(scan.rows)) return null;
    return { ok: true, rows: scan.rows.filter(isRow), atLeast: scan.atLeast === true };
  }
  if (scan.ok === false) {
    return {
      ok: false,
      reason: typeof scan.reason === 'string' && scan.reason.length > 0 ? scan.reason : UNREADABLE_SENTENCE,
    };
  }
  return null;
}

const isJobEventRow = (row: unknown): row is JobEventRow =>
  typeof row === 'object' && row !== null && 'id' in row && 'name' in row;
const isJobEmailRow = (row: unknown): row is JobEmailRow =>
  typeof row === 'object' && row !== null && 'id' in row && 'recipient' in row;

export function interpretAdminJobsResponse(
  status: number,
  body: unknown
): { ok: true; payload: AdminJobsPayload } | { ok: false; error: string } {
  const record = asRecord(body);
  if (status === 401) return { ok: false, error: JOBS_SESSION_ERROR };
  if (status === 403) {
    return { ok: false, error: 'This console is for admins. Your account does not have access.' };
  }
  if (status !== 200 || !record || record.success !== true) {
    return { ok: false, error: GENERIC_JOBS_ERROR };
  }

  const outbox = asRecord(record.outbox);
  const emails = asRecord(record.emails);
  if (!outbox || !emails) return { ok: false, error: GENERIC_JOBS_ERROR };

  const waiting = parseScan<JobEventRow>(outbox.waiting, isJobEventRow);
  const outboxFailed = parseScan<JobEventRow>(outbox.failed, isJobEventRow);
  const dead = parseScan<JobEventRow>(outbox.dead, isJobEventRow);
  const queued = parseScan<JobEmailRow>(emails.queued, isJobEmailRow);
  const emailsFailed = parseScan<JobEmailRow>(emails.failed, isJobEmailRow);
  if (!waiting || !outboxFailed || !dead || !queued || !emailsFailed) {
    return { ok: false, error: GENERIC_JOBS_ERROR };
  }

  const generatedAtIso = typeof record.generatedAtIso === 'string' ? record.generatedAtIso : null;
  const scanLimit =
    typeof record.scanLimit === 'number' && Number.isFinite(record.scanLimit) ? record.scanLimit : 60;

  return {
    ok: true,
    payload: {
      generatedAtIso: generatedAtIso ?? new Date(0).toISOString(),
      outbox: { waiting, failed: outboxFailed, dead },
      emails: { queued, failed: emailsFailed },
      scanLimit,
    },
  };
}
