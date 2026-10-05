/**
 * The bookings screen's state, as a URL.
 *
 * Kept out of the components and free of React so it can be tested directly —
 * this repository has no DOM test environment, so any rule that lives inside a
 * component is a rule nothing verifies. The rules worth verifying are all here:
 *
 *  - a cleared select is *absent*, never a filter on the empty string, which
 *    would match nothing and read as "there are no such bookings";
 *  - a link carrying a filter this build does not recognise says so instead of
 *    silently dropping it, because a silently ignored filter makes the resulting
 *    list look like an answer to a question nobody asked;
 *  - changing any filter drops the page cursor, since a cursor means "after this
 *    row *in that ordering*" and reusing it across a different filter set skips
 *    rows without any sign that it did;
 *  - a search term suppresses the filters entirely rather than appearing to
 *    combine with them — the API cannot combine them, so neither will the URL.
 *
 * Filters live in the URL rather than component state so an operator can paste
 * "the six bookings awaiting approval" into a message, and so each page turn is
 * a real history entry the browser Back button understands.
 */
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
  allowedAdditionalFilters,
  isBookingStatusGroupId,
  isPaymentStatusGroupId,
  type AdminBookingFilterField,
  type BookingStatusGroupId,
  type PaymentStatusGroupId,
} from '@/domains/booking/queries/adminBookingQuery';

export interface AdminBookingsView {
  readonly statusGroup: BookingStatusGroupId | null;
  readonly paymentGroup: PaymentStatusGroupId | null;
  readonly therapistId: string | null;
  /** One calendar day of sessions, `YYYY-MM-DD`. Not the creation date. */
  readonly date: string | null;
  /** A typed search term. Present means lookup mode. */
  readonly term: string | null;
  /** Opaque to this module: produced by the API, handed back unread. */
  readonly cursor: string | null;
  /** `null` means "whatever the API defaults to", so the default lives in one place. */
  readonly pageSize: number | null;
}

export const EMPTY_VIEW: AdminBookingsView = {
  statusGroup: null,
  paymentGroup: null,
  therapistId: null,
  date: null,
  term: null,
  cursor: null,
  pageSize: null,
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `YYYY-MM-DD` that names a day that exists.
 *
 * The shape alone is not enough: `2026-02-31` matches the pattern and `Date`
 * rolls it forward to 2 March, so a query built from it would answer about a
 * different day than the one the operator asked for.
 */
function isRealCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Search terms are bounded here as well as at the API. A 5,000-character `q`
 * pasted into the URL is not a search; refusing it early keeps the request line
 * and the "we searched for…" copy readable.
 */
const MAX_TERM_LENGTH = 120;

export interface ParsedAdminBookingsView {
  readonly view: AdminBookingsView;
  /**
   * Query parameters that were present but unusable, by name. The screen names
   * them to the operator: a link whose `status` this build does not know must
   * not quietly return the unfiltered list.
   */
  readonly ignored: readonly string[];
}

function trimmedOrNull(raw: string | null): string | null {
  if (raw === null) return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

export function parseAdminBookingsView(params: URLSearchParams): ParsedAdminBookingsView {
  const ignored: string[] = [];

  const statusRaw = trimmedOrNull(params.get('status'));
  let statusGroup: BookingStatusGroupId | null = null;
  if (statusRaw !== null) {
    if (isBookingStatusGroupId(statusRaw)) statusGroup = statusRaw;
    else ignored.push('status');
  }

  const paymentRaw = trimmedOrNull(params.get('payment'));
  let paymentGroup: PaymentStatusGroupId | null = null;
  if (paymentRaw !== null) {
    if (isPaymentStatusGroupId(paymentRaw)) paymentGroup = paymentRaw;
    else ignored.push('payment');
  }

  const dateRaw = trimmedOrNull(params.get('date'));
  let date: string | null = null;
  if (dateRaw !== null) {
    if (isRealCalendarDate(dateRaw)) date = dateRaw;
    else ignored.push('date');
  }

  const termRaw = trimmedOrNull(params.get('q'));
  let term: string | null = null;
  if (termRaw !== null) {
    if (termRaw.length <= MAX_TERM_LENGTH) term = termRaw;
    else ignored.push('q');
  }

  const pageSizeRaw = trimmedOrNull(params.get('pageSize'));
  let pageSize: number | null = null;
  if (pageSizeRaw !== null) {
    const parsed = Number(pageSizeRaw);
    if (Number.isInteger(parsed) && parsed >= MIN_PAGE_SIZE && parsed <= MAX_PAGE_SIZE) {
      pageSize = parsed;
    } else {
      ignored.push('pageSize');
    }
  }

  return {
    view: {
      statusGroup,
      paymentGroup,
      therapistId: trimmedOrNull(params.get('therapistId')),
      date,
      term,
      cursor: trimmedOrNull(params.get('cursor')),
      pageSize,
    },
    ignored,
  };
}

/** Whether this view searches for one booking rather than listing a filtered page. */
export function isLookupView(view: AdminBookingsView): boolean {
  return view.term !== null;
}

/**
 * The filter fields this view has set, in the order `allowedAdditionalFilters`
 * expects. Empty during a lookup: the API ignores filters then, so reporting
 * them as active would be a lie the rest of the screen is built on.
 */
export function activeFilterFields(view: AdminBookingsView): readonly AdminBookingFilterField[] {
  if (isLookupView(view)) return [];
  const fields: AdminBookingFilterField[] = [];
  if (view.statusGroup) fields.push('status');
  if (view.paymentGroup) fields.push('paymentStatus');
  if (view.therapistId) fields.push('therapistId');
  if (view.date) fields.push('date');
  return fields;
}

export interface FilterAvailability {
  readonly enabled: boolean;
  /** Why it is unavailable, in operator terms. Empty when enabled. */
  readonly reason: string;
}

const FILTER_LABELS: Record<AdminBookingFilterField, string> = {
  status: 'Status',
  paymentStatus: 'Payment',
  therapistId: 'Therapist',
  date: 'Session date',
};

/**
 * Which filters can still be added, and why not.
 *
 * Driven by the same `INDEXED_COMBINATIONS` table the server plans against, so
 * the filter bar disables what the API would refuse instead of letting an
 * operator assemble a combination and receive a 400. A filter that is already
 * set stays enabled — otherwise it could be applied but never cleared.
 */
export function filterAvailability(
  view: AdminBookingsView
): Record<AdminBookingFilterField, FilterAvailability> {
  if (isLookupView(view)) {
    const reason = 'Search looks at one field across every booking. Clear the search to filter.';
    return {
      status: { enabled: false, reason },
      paymentStatus: { enabled: false, reason },
      therapistId: { enabled: false, reason },
      date: { enabled: false, reason },
    };
  }

  const active = activeFilterFields(view);
  const allowed = new Set(allowedAdditionalFilters(active));
  const result = {} as Record<AdminBookingFilterField, FilterAvailability>;

  for (const field of ['status', 'paymentStatus', 'therapistId', 'date'] as const) {
    if (active.includes(field) || allowed.has(field)) {
      result[field] = { enabled: true, reason: '' };
      continue;
    }
    const combination = active.map((f) => FILTER_LABELS[f]).join(' + ');
    result[field] = {
      enabled: false,
      reason: `${FILTER_LABELS[field]} cannot be combined with ${combination}. Clear that filter first.`,
    };
  }
  return result;
}

/**
 * The query string for `GET /api/admin/bookings`.
 *
 * A lookup sends the term alone. The API ignores filters during a lookup, and
 * sending them anyway would put a request on the wire that claims to do
 * something it does not.
 */
export function adminBookingsApiQuery(view: AdminBookingsView): string {
  const params = new URLSearchParams();
  if (isLookupView(view)) {
    params.set('q', view.term as string);
    return params.toString();
  }
  if (view.statusGroup) params.set('status', view.statusGroup);
  if (view.paymentGroup) params.set('payment', view.paymentGroup);
  if (view.therapistId) params.set('therapistId', view.therapistId);
  if (view.date) params.set('date', view.date);
  if (view.pageSize !== null) params.set('pageSize', String(view.pageSize));
  if (view.cursor) params.set('cursor', view.cursor);
  return params.toString();
}

/**
 * The query string for the browser's address bar.
 *
 * Same shape as the API query so a filtered view is reproducible from the URL,
 * except that a lookup keeps nothing but the term — pasting the link must
 * reproduce what is on screen, and what is on screen during a lookup is the
 * search, not the filters underneath it.
 */
export function adminBookingsUrlQuery(view: AdminBookingsView): string {
  return adminBookingsApiQuery(view);
}

/**
 * A view with some filters changed and the cursor dropped.
 *
 * Dropping the cursor is the point of the function existing. `startAfter(row)`
 * only means anything within the ordering it was issued for, so carrying a
 * cursor across a filter change would silently skip an unknown number of rows —
 * and skipped rows are invisible: the operator sees a page and has no way to
 * know something was missing from it.
 */
export function withFilters(
  view: AdminBookingsView,
  patch: Partial<Omit<AdminBookingsView, 'cursor'>>
): AdminBookingsView {
  const next: AdminBookingsView = { ...view, ...patch, cursor: null };
  // A term and filters cannot both apply, and the term wins because it is what
  // was typed most recently. Clearing them keeps the URL honest about what ran.
  if (next.term !== null) {
    return { ...next, statusGroup: null, paymentGroup: null, therapistId: null, date: null };
  }
  return next;
}

/** The next page of the same query. Only the cursor moves. */
export function withCursor(view: AdminBookingsView, cursor: string | null): AdminBookingsView {
  return { ...view, cursor };
}

export interface FilterChip {
  readonly field: AdminBookingFilterField;
  readonly label: string;
  readonly value: string;
}

/**
 * The active filters, spelled out for display.
 *
 * `therapistName` is resolved by the caller, which has the roster; an unknown id
 * is shown as the id rather than as a blank, so a booking pointing at a deleted
 * therapist is still explicable.
 */
export function describeActiveFilters(
  view: AdminBookingsView,
  labels: {
    readonly status?: string;
    readonly payment?: string;
    readonly therapistName?: string;
    readonly date?: string;
  } = {}
): readonly FilterChip[] {
  // Nothing is filtered during a lookup, whatever the rest of the view still
  // holds. Reporting a chip here would put a filter on screen that did not run.
  if (isLookupView(view)) return [];
  const chips: FilterChip[] = [];
  if (view.statusGroup) {
    chips.push({ field: 'status', label: 'Status', value: labels.status ?? view.statusGroup });
  }
  if (view.paymentGroup) {
    chips.push({ field: 'paymentStatus', label: 'Payment', value: labels.payment ?? view.paymentGroup });
  }
  if (view.therapistId) {
    chips.push({
      field: 'therapistId',
      label: 'Therapist',
      value: labels.therapistName ?? view.therapistId,
    });
  }
  if (view.date) {
    chips.push({ field: 'date', label: 'Session date', value: labels.date ?? view.date });
  }
  return chips;
}

/** Clears one chip. Used by the chip's own dismiss button. */
export function withoutFilter(
  view: AdminBookingsView,
  field: AdminBookingFilterField
): AdminBookingsView {
  switch (field) {
    case 'status':
      return withFilters(view, { statusGroup: null });
    case 'paymentStatus':
      return withFilters(view, { paymentGroup: null });
    case 'therapistId':
      return withFilters(view, { therapistId: null });
    case 'date':
      return withFilters(view, { date: null });
  }
}

/** Page size actually in force, for copy that has to state a number. */
export function effectivePageSize(view: AdminBookingsView): number {
  return view.pageSize ?? DEFAULT_PAGE_SIZE;
}
