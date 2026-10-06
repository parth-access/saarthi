/**
 * Calendar triage: the shape of a booking that is missing its Meet link, and the
 * pure helpers the console needs to present one.
 *
 * Client-safe on purpose (no Firestore import): the API's reader projects rows
 * into {@link CalendarProblemRow}, the response interpreter carries it to the
 * browser, and the screen renders from it. Keeping the type here — the way
 * `refundTriage.ts` does for refunds — means the API, the interpreter and the
 * screen cannot drift into three different ideas of what a calendar problem is.
 *
 * The set this models is exactly the set `/api/cron/retry-calendar` acts on:
 * confirmed bookings with a `calendarStatus` of `RETRY_REQUIRED`, `FAILED` or
 * `PENDING` and no `meetingUrl`. Anything else (a healthy `CREATED` session, a
 * cancelled one) is not a problem and does not appear.
 */
import type { AdminBookingRow } from '@/domains/booking/queries/adminBookingQuery';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';

export interface CalendarProblemRow extends AdminBookingRow {
  /** The stored failure text, if the last attempt recorded one. */
  readonly calendarError: string | null;
  /** An event was created but its Meet link never came back — the recovery path. */
  readonly hasCalendarEventId: boolean;
}

export type CalendarProblemScan =
  | { readonly ok: true; readonly rows: readonly CalendarProblemRow[]; readonly atLeast: boolean }
  | { readonly ok: false; readonly reason: string };

/** The `calendarStatus` values that can appear on a problem row. */
export type CalendarProblemStatus = 'RETRY_REQUIRED' | 'FAILED' | 'PENDING' | 'unknown';

/**
 * The badge a problem row carries, in operator terms.
 *
 * The distinction that matters is whose court the ball is in: `PENDING` and
 * `RETRY_REQUIRED` mean the machinery has not got there yet and the scheduled job
 * will; `FAILED` means an attempt went wrong and a human probably wants to read
 * the error before retrying.
 */
export function calendarStatusBadge(status: string | null): {
  label: string;
  tone: AdminTone;
  title: string;
} {
  switch (status) {
    case 'FAILED':
      return {
        label: 'Last attempt failed',
        tone: 'danger',
        title: 'An attempt to create the calendar event failed. The recorded error is on the row.',
      };
    case 'RETRY_REQUIRED':
      return {
        label: 'Retry scheduled',
        tone: 'warning',
        title: 'Waiting for the scheduled calendar job to try again (every five minutes).',
      };
    case 'PENDING':
      return {
        label: 'Not created yet',
        tone: 'info',
        title: 'The session is confirmed but its calendar event has not been created.',
      };
    default:
      return {
        label: status ? `Calendar: ${status}` : 'Calendar status not read',
        tone: 'neutral',
        title: 'An unrecognised calendar status — read the booking before acting.',
      };
  }
}

export interface CalendarProblemTally {
  readonly status: CalendarProblemStatus;
  readonly count: number;
  readonly tone: AdminTone;
}

/** Counts rows per calendar status, ordered so the human-relevant ones lead. */
export function tallyCalendarProblems(rows: readonly CalendarProblemRow[]): CalendarProblemTally[] {
  const counts = new Map<CalendarProblemStatus, number>();
  for (const row of rows) {
    const key: CalendarProblemStatus =
      row.calendarStatus === 'FAILED' ||
      row.calendarStatus === 'RETRY_REQUIRED' ||
      row.calendarStatus === 'PENDING'
        ? row.calendarStatus
        : 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const order: CalendarProblemStatus[] = ['FAILED', 'RETRY_REQUIRED', 'PENDING', 'unknown'];
  return order
    .filter((status) => counts.has(status))
    .map((status) => ({
      status,
      count: counts.get(status) as number,
      tone: calendarStatusBadge(status).tone,
    }));
}

/**
 * Whether a row's calendar error is one an operator can do something about.
 *
 * Credentials missing is a deployment problem — retrying without fixing the
 * environment cannot succeed, and the honest UI says so rather than offering a
 * button that will fail the same way.
 */
export function isConfigurationError(error: string | null): boolean {
  return typeof error === 'string' && error.includes('credentials are not configured');
}

/** The sentence for a full scan, mirroring the other bounded lists. */
export function describeCalendarScanBound(atLeast: boolean, scanLimit: number): string | null {
  return atLeast
    ? `The scan stops at ${scanLimit} candidate bookings and there were more. Some sessions missing a Meet link may not be listed.`
    : null;
}
