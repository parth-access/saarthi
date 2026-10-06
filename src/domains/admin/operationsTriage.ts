/**
 * Operations triage: shapes and pure presentation decisions for the Operations
 * screen, which reads `GET /api/operations/dashboard` and `GET /api/operations/search`.
 *
 * The screen is deliberately honest about what those endpoints can and cannot
 * say. `workerStatus.status` is written unconditionally as 'active' and its
 * `lastPoll` is the request's own timestamp — neither observes anything, so
 * neither is rendered. The daily metrics are real (the MetricsListener writes
 * them from events) but their day is keyed to the UTC date and `bookingsCreated`
 * counts slot holds, most of which are abandoned — so the screen labels them as
 * machinery counters, not as the practice's day. Everything hardcoded in the
 * legacy control room (184 ms dispatch, DLQ size 0, polling interval, "Live
 * Streaming", a version string) has no counterpart here because it had no
 * counterpart in reality.
 */
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';

export interface TimelineRow {
  readonly id: string;
  readonly event: string;
  readonly severity: string;
  readonly message: string;
  readonly actorType: string | null;
  readonly correlationId: string | null;
  readonly bookingId: string | null;
  readonly paymentId: string | null;
  readonly emailId: string | null;
  readonly createdAtIso: string | null;
}

export interface DailyMetricRow {
  readonly date: string | null;
  readonly bookingsCreated: number | null;
  readonly bookingsConfirmed: number | null;
  readonly bookingsCancelled: number | null;
  readonly paymentsSucceeded: number | null;
  readonly paymentsFailed: number | null;
  readonly emailsQueued: number | null;
  readonly emailsSent: number | null;
  readonly emailsFailed: number | null;
}

export interface OperationsDiagnostics {
  readonly resendConfigured: boolean | null;
  readonly razorpayConfigured: boolean | null;
  readonly nodeEnv: string | null;
}

export interface OperationsDashboardPayload {
  readonly generatedAtIso: string;
  readonly timelines: readonly TimelineRow[];
  readonly queuedEmailCount: number | null;
  readonly failedEmailCount: number | null;
  readonly metrics: readonly DailyMetricRow[];
  readonly diagnostics: OperationsDiagnostics;
}

export interface BookingHit {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly status: string;
  readonly therapistName: string;
  readonly sessionType: string;
  readonly razorpayOrderId: string | null;
  readonly razorpayPaymentId: string | null;
}

export interface EmailHit {
  readonly id: string;
  readonly bookingId: string | null;
  readonly recipient: string;
  readonly subject: string;
  readonly status: string;
}

export interface SearchResultsPayload {
  readonly query: string;
  readonly bookings: readonly BookingHit[];
  readonly emails: readonly EmailHit[];
  readonly timelines: readonly TimelineRow[];
}

export function severityBadge(severity: string): { label: string; tone: AdminTone } {
  switch (severity) {
    case 'error':
      return { label: 'Error', tone: 'danger' };
    case 'warning':
      return { label: 'Warning', tone: 'warning' };
    case 'info':
      return { label: 'Info', tone: 'info' };
    default:
      return { label: severity ? severity : 'Info', tone: 'neutral' };
  }
}

export function actorLabel(actorType: string | null): string {
  return actorType ? actorType : 'system';
}

/**
 * The chain of one correlation, as far as the loaded timeline slice goes. The
 * dashboard ships the most recent 100 rows, so a chain older than that is
 * visibly incomplete — the caller says so rather than implying finality.
 */
export function correlationChain(
  timelines: readonly TimelineRow[],
  correlationId: string
): readonly TimelineRow[] {
  return timelines.filter((row) => row.correlationId === correlationId);
}

export const CORRELATION_SLICE_BOUND =
  'This chain is stitched from the most recent timeline rows the dashboard loaded — an older stretch of the same correlation is not on screen.';

/** Copy for the configuration checks row. Presence is checked, not liveness. */
export function configurationCheck(label: string, configured: boolean | null): {
  label: string;
  tone: AdminTone;
  detail: string;
} {
  if (configured === null) {
    return { label, tone: 'neutral', detail: 'Not checked on this read.' };
  }
  return configured
    ? { label, tone: 'success', detail: 'Configured. Presence of credentials is checked, not a live connection.' }
    : { label, tone: 'danger', detail: 'Missing. Any flow that needs this integration will fail closed until it is set.' };
}

/**
 * The one honest sentence about a daily_metrics row. It is a real counter, but
 * it is not the practice's day.
 */
export const METRICS_CAVEAT =
  'These are machinery counters keyed to the UTC day (which begins at 5:30 AM IST). "Bookings created" counts slot holds, most of which are abandoned before payment — read it as pipeline activity, not sessions.';
