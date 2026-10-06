/**
 * Email-log triage: the shape the Email operations screen reads, and the pure
 * presentation decisions.
 *
 * Two projections matter for privacy and payload size, and both are enforced at
 * the API boundary — this module only makes them typeable:
 *
 *  - The LIST row never carries `html` or `text`. A hundred rendered emails is
 *    not a table column, it is a data breach waiting for a wrong click.
 *  - The DETAIL carries the plaintext backup (`text`) but still not `html`. The
 *    plaintext is the recovery/audit copy the legacy Email Operations Center
 *    showed; the HTML adds nothing an operator can act on.
 */
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';

export const EMAIL_LIST_LIMIT = 100;

export interface EmailAttemptRow {
  readonly attemptNumber: number;
  readonly attemptedAtIso: string | null;
  readonly status: string;
  readonly error: string | null;
  readonly responseId: string | null;
}

export interface EmailLogRow {
  readonly id: string;
  readonly bookingId: string | null;
  readonly type: string;
  readonly recipient: string;
  readonly subject: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly lastError: string | null;
  readonly createdAtIso: string | null;
  readonly updatedAtIso: string | null;
}

export interface EmailLogDetail extends EmailLogRow {
  /** The stored plaintext body — the recovery/audit copy. Never `html`. */
  readonly text: string | null;
  readonly attempts: readonly EmailAttemptRow[];
}

export type EmailLogScan =
  | { readonly ok: true; readonly rows: readonly EmailLogRow[]; readonly atLeast: boolean }
  | { readonly ok: false; readonly reason: string };

export function emailStatusBadge(status: string): {
  label: string;
  tone: AdminTone;
  title: string;
} {
  switch (status) {
    case 'sent':
      return { label: 'Sent', tone: 'success', title: 'Accepted by the email provider.' };
    case 'delivered':
      return { label: 'Delivered', tone: 'success', title: 'The provider reported delivery.' };
    case 'failed':
      return {
        label: 'Failed',
        tone: 'danger',
        title: 'In-process retries were exhausted. Nothing re-drives this automatically.',
      };
    case 'queued':
      return { label: 'Queued', tone: 'info', title: 'Waiting to be dispatched.' };
    case 'sending':
      return { label: 'Sending', tone: 'info', title: 'Dispatch is in flight.' };
    default:
      return { label: `Status: ${status}`, tone: 'neutral', title: 'An unrecognised status.' };
  }
}

export interface EmailStatusTally {
  readonly status: string;
  readonly count: number;
  readonly tone: AdminTone;
}

/** Counts the loaded slice by status, failures first. Counts the sample only. */
export function tallyEmailLog(rows: readonly EmailLogRow[]): EmailStatusTally[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const toneFor = (status: string) => emailStatusBadge(status).tone;
  const priority: Record<string, number> = { failed: 0, queued: 1, sending: 2, sent: 3, delivered: 4 };
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count, tone: toneFor(status) }))
    .sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));
}

/**
 * Client-side filters over the loaded slice. These see only what was read — the
 * screen must say so, which is why this function and its bound sentence live
 * together.
 */
export function filterEmailLog(
  rows: readonly EmailLogRow[],
  status: string | null,
  term: string
): readonly EmailLogRow[] {
  const normalized = term.trim().toLowerCase();
  return rows.filter((row) => {
    if (status && status !== 'all' && row.status !== status) return false;
    if (!normalized) return true;
    return (
      row.recipient.toLowerCase().includes(normalized) ||
      row.subject.toLowerCase().includes(normalized) ||
      row.type.toLowerCase().includes(normalized) ||
      (row.bookingId?.toLowerCase().includes(normalized) ?? false)
    );
  });
}

export const EMAIL_FILTER_BOUND =
  'Search and status filters look at what this page read — the most recent slice only. To find an older email, look it up by booking.';
