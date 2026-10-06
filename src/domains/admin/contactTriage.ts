/**
 * Contact/inquiry triage: the shapes the Contacts screen reads and the pure
 * decisions about status transitions.
 *
 * The contact record has four statuses in its schema; the legacy console could
 * set three of them (unread, resolved, spam — `in-progress` was modelled but
 * never settable). This migration preserves exactly that set of operator
 * actions: no reply workflow is invented here, because none exists in the
 * backend — the reply path today is the operator's own mail client, and the
 * screen says so rather than pretending otherwise.
 */
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';

/** Every status the `contacts` schema models. */
export const CONTACT_STATUSES = ['unread', 'in-progress', 'resolved', 'spam'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

/** The statuses an operator may set from the console — the legacy set. */
export const SETTABLE_STATUSES = ['unread', 'resolved', 'spam'] as const;

export interface ContactRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly message: string;
  readonly status: string;
  readonly priority: string;
  readonly source: string;
  readonly createdAtIso: string | null;
  readonly lastUpdatedAtIso: string | null;
}

export interface ContactPage {
  readonly rows: readonly ContactRow[];
  /** Cursor to the next page, or `null` when the scan reached the end. */
  readonly nextCursor: { readonly createdAtMs: number; readonly id: string } | null;
}

export type ContactPageScan =
  | { readonly ok: true; readonly page: ContactPage; readonly pageSize: number }
  | { readonly ok: false; readonly reason: string };

export function isContactStatus(value: string): value is ContactStatus {
  return (CONTACT_STATUSES as readonly string[]).includes(value);
}

export function isSettableStatus(value: string): value is (typeof SETTABLE_STATUSES)[number] {
  return (SETTABLE_STATUSES as readonly string[]).includes(value);
}

export function contactStatusBadge(status: string): {
  label: string;
  tone: AdminTone;
  title: string;
} {
  switch (status) {
    case 'unread':
      return { label: 'Unread', tone: 'info', title: 'Not yet handled.' };
    case 'in-progress':
      return {
        label: 'In progress',
        tone: 'warning',
        title: 'Modelled in the schema but never settable by any console — shown as stored.',
      };
    case 'resolved':
      return { label: 'Resolved', tone: 'success', title: 'Handled.' };
    case 'spam':
      return { label: 'Spam', tone: 'neutral', title: 'Marked as spam.' };
    default:
      return { label: `Status: ${status}`, tone: 'neutral', title: 'An unrecognised status.' };
  }
}

/**
 * The one-line preview of an inquiry. Truncation is the list's business; the
 * full message is on the row.
 */
export function messagePreview(message: string, max = 180): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

/**
 * Client-side filters over the loaded pages. They see only what this session
 * has read — the screen says so, and the booking lookup is the way to reach
 * anything older.
 */
export function filterContacts(
  rows: readonly ContactRow[],
  status: string | null,
  term: string
): readonly ContactRow[] {
  const normalized = term.trim().toLowerCase();
  return rows.filter((row) => {
    if (status && status !== 'all' && row.status !== status) return false;
    if (!normalized) return true;
    return (
      row.name.toLowerCase().includes(normalized) ||
      row.email.toLowerCase().includes(normalized) ||
      row.message.toLowerCase().includes(normalized)
    );
  });
}

export const CONTACT_FILTER_BOUND =
  'Search and status filters look at the pages this session has read. Load more, or read from the newest page, to widen what they see.';
