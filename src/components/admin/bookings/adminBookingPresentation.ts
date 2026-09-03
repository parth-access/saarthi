/**
 * How a booking row is rendered, separated from the components that render it.
 *
 * Everything here is a pure function of an `AdminBookingRow`, so the decisions
 * that could mislead an operator are testable in a project with no DOM test
 * environment. The decisions themselves:
 *
 *  - the **exact stored status** is shown, tinted by its group. "Cancelled or
 *    closed" is the right filter but the wrong label for a row: `no_show` and
 *    `cancelled` are the same group and call for different conversations.
 *  - a missing value renders as an em dash, never as `0`, `Invalid Date` or a
 *    blank cell. A blank cell is indistinguishable from a rendering bug.
 *  - **times are stated in IST and labelled as such.** Every session date/time in
 *    this system is IST wall-clock (`istToUtcIsoString`), so rendering the
 *    creation timestamp in the operator's own zone would put two different clocks
 *    in one table.
 *  - the Meet column only claims something is *wrong* when it is: a confirmed
 *    session with no link is actionable, and an unconfirmed one is not.
 *
 * The badge and indicator functions take the *fields they read* rather than a
 * whole `AdminBookingRow`, so the detail view badges a booking with these exact
 * rules instead of growing a second, drifting set. `AdminBookingRow` satisfies
 * each of those shapes structurally, so the table's call sites are unchanged.
 */
import {
  bookingStatusGroupFor,
  paymentStatusGroupFor,
  type AdminTone,
} from '@/domains/booking/queries/adminBookingQuery';

/** IST, always: the platform stores session times as IST wall-clock. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The parts of a `YYYY-MM-DD` calendar day, or `null` if it is not one.
 *
 * Compared back against the input so a day that does not exist — `2026-02-31`,
 * which `Date` rolls forward to 2 March — is rejected rather than displayed as a
 * different date than the one stored.
 */
function calendarParts(
  date: string
): { year: number; month: number; day: number; weekday: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (!parsed.toISOString().startsWith(date)) return null;
  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth(),
    day: parsed.getUTCDate(),
    weekday: parsed.getUTCDay(),
  };
}

/**
 * `awaiting_payment` → `Awaiting payment`.
 *
 * An unrecognised status is passed through with the same treatment rather than
 * replaced with "Unknown": the raw value is the only clue an operator has about
 * a document written by something this build does not know about.
 */
export function humanizeStatus(status: string | null | undefined): string {
  if (!status) return '—';
  const spaced = status.replace(/[_-]+/g, ' ').trim();
  if (spaced.length === 0) return '—';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Tailwind classes for a badge in a given semantic tone. */
export function toneClasses(tone: AdminTone): string {
  switch (tone) {
    case 'success':
      return 'bg-success-surface text-success';
    case 'warning':
      return 'bg-warning-surface text-warning';
    case 'danger':
      return 'bg-danger-surface text-danger';
    case 'info':
      return 'bg-info-surface text-info';
    case 'neutral':
      return 'bg-neutral-surface text-primary/70';
  }
}

export interface StatusBadge {
  readonly label: string;
  readonly tone: AdminTone;
  /** Hover/aria explanation: what the group this status belongs to means. */
  readonly title: string;
}

/**
 * Takes the status alone rather than a row, so the detail view badges a booking
 * with the same rules the list does instead of growing a second set.
 */
export function statusBadge(row: { readonly status: string }): StatusBadge {
  const group = bookingStatusGroupFor(row.status);
  if (!group) {
    // A status outside the known union. Saying so is the useful thing: the row is
    // real, and an operator needs to know the console cannot classify it.
    return {
      label: humanizeStatus(row.status),
      tone: 'neutral',
      title: `Stored status "${row.status}" is not one this console knows about.`,
    };
  }
  return {
    label: humanizeStatus(row.status),
    tone: group.tone,
    title: `${group.label} — ${group.meaning}`,
  };
}

export function paymentBadge(row: { readonly paymentStatus: string | null }): StatusBadge | null {
  if (!row.paymentStatus) return null;
  const group = paymentStatusGroupFor(row.paymentStatus);
  return {
    label: humanizeStatus(row.paymentStatus),
    tone: group?.tone ?? 'neutral',
    title: group
      ? `Payment: ${group.label}`
      : `Stored payment status "${row.paymentStatus}" is not one this console knows about.`,
  };
}

/**
 * `1500` → `₹1,500`.
 *
 * `paymentAmount` is stored in rupees, not paise — the same unit the payment
 * routes read — so there is no division here. `null` becomes an em dash rather
 * than `₹0`, which would be a claim that the session is free.
 */
export function formatAmount(
  amountRupees: number | null,
  currency: string | null
): string {
  if (amountRupees === null) return '—';
  const code = (currency ?? 'INR').toUpperCase();
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: amountRupees % 1 === 0 ? 0 : 2,
    }).format(amountRupees);
  } catch {
    // An unknown currency code must not take the table down with it.
    return `${code} ${amountRupees.toLocaleString('en-IN')}`;
  }
}

/** `2026-09-10` → `Thu 10 Sep`. The year is dropped; the column is dense. */
export function formatSessionDay(date: string): string {
  const parts = calendarParts(date);
  if (!parts) return date || '—';
  return `${WEEKDAYS[parts.weekday]} ${parts.day} ${MONTHS[parts.month]}`;
}

/** `2026-09-10` → `Thu 10 Sep 2026`, for headings and filter chips. */
export function formatSessionDayLong(date: string): string {
  const parts = calendarParts(date);
  if (!parts) return date || '—';
  return `${WEEKDAYS[parts.weekday]} ${parts.day} ${MONTHS[parts.month]} ${parts.year}`;
}

/** The zone every time in this console is stated in. Belongs next to the value. */
export const DISPLAY_TIME_ZONE_LABEL = 'IST';

/**
 * When the booking was made, in IST: `1 Sep 2026, 15:45`.
 *
 * This is the column the list is ordered by, so it has to be visible — an
 * ordering an operator cannot see reads as no ordering at all.
 *
 * Assembled from the parts rather than through `toLocaleString` on purpose. ICU
 * abbreviates September as "Sept" in some versions and "Sep" in others, and a
 * string that differs between the server render and the browser is a hydration
 * mismatch; this one cannot differ.
 */
export function formatCreatedAt(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const ist = new Date(ms + IST_OFFSET_MS);
  const day = ist.getUTCDate();
  const month = MONTHS[ist.getUTCMonth()];
  const hours = String(ist.getUTCHours()).padStart(2, '0');
  const minutes = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${ist.getUTCFullYear()}, ${hours}:${minutes}`;
}

export type MeetPresence = 'ready' | 'missing' | 'not-applicable';

export interface MeetIndicator {
  readonly presence: MeetPresence;
  readonly label: string;
  readonly title: string;
}

/**
 * What the Meet column says.
 *
 * A confirmed session with no link is a real problem — the client has paid and
 * has nothing to join — so it is the one case rendered as a warning. Anything
 * unconfirmed has no link *by design*, and flagging it would train an operator
 * to ignore the column. `calendarStatus` is named when it is known, because
 * `FAILED` and `PENDING` call for different responses.
 */
export function meetIndicator(row: {
  readonly hasMeetingLink: boolean;
  readonly status: string;
  readonly calendarStatus: string | null;
}): MeetIndicator {
  if (row.hasMeetingLink) {
    return {
      presence: 'ready',
      label: 'Meet link',
      title: 'A Google Meet link exists for this session. Open the booking to use it.',
    };
  }
  const group = bookingStatusGroupFor(row.status);
  if (group?.id === 'confirmed') {
    return {
      presence: 'missing',
      label: 'No link',
      title: row.calendarStatus
        ? `Confirmed with no Meet link. Calendar status: ${row.calendarStatus}.`
        : 'Confirmed with no Meet link, and no calendar status was recorded.',
    };
  }
  return {
    presence: 'not-applicable',
    label: '—',
    title: 'A Meet link is only created once a session is confirmed.',
  };
}

/**
 * Short flags for things an operator should not have to open the row to see.
 * Only ever derived from stored fields; there is no flag for "looks fine".
 */
export interface RowFlag {
  readonly label: string;
  readonly tone: AdminTone;
  readonly title: string;
}

export function rowFlags(row: {
  readonly rescheduleCount: number;
  readonly refundStatus: string | null;
}): readonly RowFlag[] {
  const flags: RowFlag[] = [];
  if (row.rescheduleCount > 0) {
    flags.push({
      label: row.rescheduleCount === 1 ? 'Rescheduled' : `Rescheduled ×${row.rescheduleCount}`,
      tone: 'info',
      title: `This session has been moved ${row.rescheduleCount} time${row.rescheduleCount === 1 ? '' : 's'}.`,
    });
  }
  if (row.refundStatus) {
    flags.push({
      label: `Refund: ${humanizeStatus(row.refundStatus)}`,
      // A refund that failed is the operator's problem; the rest is information.
      tone: /fail|error/i.test(row.refundStatus) ? 'danger' : 'info',
      title: `Stored refund status: ${row.refundStatus}`,
    });
  }
  return flags;
}

/** `Individual therapy · Video` — omits what is not stored. */
export function formatSessionKind(row: {
  readonly sessionType: string;
  readonly sessionMode: string | null;
}): string {
  const parts = [row.sessionType, row.sessionMode].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );
  return parts.length > 0 ? parts.map((part) => humanizeStatus(part)).join(' · ') : '—';
}
