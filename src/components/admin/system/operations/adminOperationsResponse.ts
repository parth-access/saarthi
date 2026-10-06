/**
 * Interpreting `GET /api/operations/dashboard` and `GET /api/operations/search`
 * for the Operations screen. Pure and React-free.
 *
 * The dashboard endpoint predates this console and answers with raw shapes —
 * timelines as raw documents with Firestore-Timestamp-ish dates, queue counts
 * from `count()` aggregations, and two fields (`workerStatus.status`,
 * `workerStatus.lastPoll`) that observe nothing. The interpreter projects what
 * is real and drops what is not, so the screen cannot accidentally render the
 * theatre.
 */
import type {
  BookingHit,
  DailyMetricRow,
  EmailHit,
  OperationsDashboardPayload,
  TimelineRow,
} from '@/domains/admin/operationsTriage';

export const GENERIC_OPERATIONS_ERROR =
  'We could not load the operations dashboard just now. Please try again.';
export const OPERATIONS_SESSION_ERROR =
  'Your session has expired. Sign in again to read operations.';
export const SEARCH_TOO_SHORT = 'Enter at least 3 characters to search.';
export const GENERIC_SEARCH_ERROR = 'The search did not go through just now. Try again.';

export {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from '../../bookings/adminBookingsResponse';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof candidate.toDate === 'function') {
      try {
        const date = candidate.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
      } catch {
        return null;
      }
    }
    const seconds = candidate.seconds ?? candidate._seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      return new Date(seconds * 1000).toISOString();
    }
  }
  return null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toTimelineRow(id: string, data: Record<string, unknown>): TimelineRow {
  const actor = asRecord(data.actor);
  return {
    id,
    event: str(data.event) ?? 'unknown',
    severity: str(data.severity) ?? 'info',
    message: str(data.message) ?? '',
    actorType: str(actor?.type),
    correlationId: str(data.correlationId),
    bookingId: str(data.bookingId),
    paymentId: str(data.paymentId),
    emailId: str(data.emailId),
    createdAtIso: isoOrNull(data.createdAt),
  };
}

function toMetricRow(data: Record<string, unknown>): DailyMetricRow {
  return {
    date: str(data.date),
    bookingsCreated: num(data.bookingsCreated),
    bookingsConfirmed: num(data.bookingsConfirmed),
    bookingsCancelled: num(data.bookingsCancelled),
    paymentsSucceeded: num(data.paymentsSucceeded),
    paymentsFailed: num(data.paymentsFailed),
    emailsQueued: num(data.emailsQueued),
    emailsSent: num(data.emailsSent),
    emailsFailed: num(data.emailsFailed),
  };
}

function parseMetrics(value: unknown): DailyMetricRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => asRecord(row))
    .filter((row): row is Record<string, unknown> => row !== null)
    .map(toMetricRow);
}

function parseTimelines(value: unknown): TimelineRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => asRecord(row))
    .filter((row): row is Record<string, unknown> => row !== null && typeof row.id === 'string')
    .map((row) => toTimelineRow(row.id as string, row));
}

export function interpretAdminOperationsResponse(
  status: number,
  body: unknown
): { ok: true; payload: OperationsDashboardPayload } | { ok: false; error: string } {
  const record = asRecord(body);
  if (status === 401) return { ok: false, error: OPERATIONS_SESSION_ERROR };
  if (status === 403) {
    return { ok: false, error: 'This console is for admins. Your account does not have access.' };
  }
  if (status !== 200 || !record) {
    return { ok: false, error: GENERIC_OPERATIONS_ERROR };
  }

  const workerStatus = asRecord(record.workerStatus);
  const diagnostics = asRecord(record.diagnostics);

  return {
    ok: true,
    payload: {
      generatedAtIso: new Date().toISOString(),
      timelines: parseTimelines(record.timelines),
      queuedEmailCount: num(workerStatus?.queuedCount),
      failedEmailCount: num(workerStatus?.failedCount),
      metrics: parseMetrics(record.metrics),
      diagnostics: {
        // The endpoint's own vocabulary: 'healthy' means the credentials are
        // present in the environment — presence, not a live connection.
        resendConfigured: diagnostics ? diagnostics.resend === 'healthy' : null,
        razorpayConfigured: diagnostics ? diagnostics.razorpay === 'healthy' : null,
        nodeEnv: str(diagnostics?.env),
      },
    },
  };
}

export type OperationsSearchInterpretation =
  | { readonly ok: true; readonly payload: { readonly query: string; readonly bookings: readonly BookingHit[]; readonly emails: readonly EmailHit[]; readonly timelines: readonly TimelineRow[] } }
  | { readonly ok: false; readonly error: string };

function toBookingHit(data: Record<string, unknown>): BookingHit {
  return {
    id: str(data.id) ?? '',
    name: str(data.name) ?? '',
    email: str(data.email) ?? '',
    phone: str(data.phone) ?? '',
    status: str(data.status) ?? 'unknown',
    therapistName: str(data.therapistName) ?? '',
    sessionType: str(data.sessionType) ?? '',
    razorpayOrderId: str(data.razorpayOrderId),
    razorpayPaymentId: str(data.razorpayPaymentId),
  };
}

function toEmailHit(data: Record<string, unknown>): EmailHit {
  return {
    id: str(data.id) ?? '',
    bookingId: str(data.bookingId),
    recipient: str(data.recipient) ?? '',
    subject: str(data.subject) ?? '',
    status: str(data.status) ?? 'unknown',
  };
}

export function interpretOperationsSearchResponse(
  status: number,
  body: unknown,
  query: string
): OperationsSearchInterpretation {
  const record = asRecord(body);
  if (status === 401) return { ok: false, error: OPERATIONS_SESSION_ERROR };
  if (status === 400) {
    return { ok: false, error: record && typeof record.error === 'string' ? record.error : SEARCH_TOO_SHORT };
  }
  if (status !== 200 || !record) {
    return { ok: false, error: GENERIC_SEARCH_ERROR };
  }

  const bookings: BookingHit[] = Array.isArray(record.bookings)
    ? record.bookings
        .map((row) => asRecord(row))
        .filter((row): row is Record<string, unknown> => row !== null)
        .map(toBookingHit)
        .filter((hit) => hit.id)
    : [];
  const emails: EmailHit[] = Array.isArray(record.emails)
    ? record.emails
        .map((row) => asRecord(row))
        .filter((row): row is Record<string, unknown> => row !== null)
        .map(toEmailHit)
        .filter((hit) => hit.id)
    : [];

  return {
    ok: true,
    payload: { query, bookings, emails, timelines: parseTimelines(record.timelines) },
  };
}
