/**
 * The admin bookings list, as a query plan rather than a Firestore call.
 *
 * This module is pure and client-safe on purpose. It holds three things that
 * have to agree with each other or the console lies to an operator:
 *
 *  1. **Which filter combinations Firestore can actually serve.** Firestore
 *     needs a composite index for every equality-plus-ordering shape, and a
 *     query with no index fails at runtime. So the set of supported
 *     combinations is data here, checked by tests against
 *     `firestore.indexes.json`, and the UI reads the same table to decide which
 *     filters it may offer. An unsupported combination is refused with an
 *     explanation — never quietly answered with a different query.
 *
 *  2. **Status grouping.** `BookingStatus` has sixteen members, several of them
 *     legacy aliases for the same operational state (`pending` /
 *     `pending_approval`, `awaiting_payment` / `pending_payment`). An operator
 *     triages by state, not by which code path wrote the document, so filters
 *     work on groups and the group expands to an `in` clause.
 *
 *  3. **The row projection.** The list sends the columns it shows and nothing
 *     more. The Meet link, the payment ids and the full history belong to the
 *     detail view, where the operator has asked for one specific booking.
 *
 * Known and deliberate: ordering by `createdAt` excludes any booking document
 * that lacks the field entirely. Every write path sets it, but a hand-edited
 * document would be invisible to this list — the lookup path (by id, email or
 * phone) has no such constraint and is the way to reach one.
 */
import type { BookingStatus, PaymentStatus } from '@/types';

/* ------------------------------------------------------------------ *
 * Status vocabulary
 * ------------------------------------------------------------------ */

/**
 * Compile-time exhaustiveness: `Record<BookingStatus, true>` cannot be built
 * unless every union member is present, so adding a status to `@/types` without
 * telling the admin console about it is a type error rather than a booking that
 * silently belongs to no group.
 */
const BOOKING_STATUS_PRESENCE: Record<BookingStatus, true> = {
  pending: true,
  pending_approval: true,
  awaiting_payment: true,
  pending_payment: true,
  confirmed: true,
  rejected: true,
  cancelled: true,
  completed: true,
  draft: true,
  locked: true,
  slot_locked: true,
  payment_initiated: true,
  payment_started: true,
  rescheduled: true,
  expired: true,
  no_show: true,
};

export const ALL_BOOKING_STATUSES = Object.keys(BOOKING_STATUS_PRESENCE) as readonly BookingStatus[];

const PAYMENT_STATUS_PRESENCE: Record<PaymentStatus, true> = {
  unpaid: true,
  pending: true,
  initiated: true,
  paid: true,
  success: true,
  failed: true,
  refunded: true,
};

export const ALL_PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_PRESENCE) as readonly PaymentStatus[];

/** Tone names match the semantic colour tokens in `globals.css`. */
export type AdminTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type BookingStatusGroupId =
  | 'awaiting_approval'
  | 'awaiting_payment'
  | 'confirmed'
  | 'completed'
  | 'closed'
  | 'holding';

export interface BookingStatusGroup {
  readonly id: BookingStatusGroupId;
  readonly label: string;
  /** What the operator is looking at, in their terms. Shown as filter help. */
  readonly meaning: string;
  readonly statuses: readonly BookingStatus[];
  readonly tone: AdminTone;
}

/**
 * Ordered by how urgently a group needs an operator, not alphabetically: the
 * two groups at the top are the ones where a client is waiting on Saarthi.
 */
export const BOOKING_STATUS_GROUPS: readonly BookingStatusGroup[] = [
  {
    id: 'awaiting_approval',
    label: 'Awaiting approval',
    meaning: 'Requested by a client and not yet accepted or declined.',
    statuses: ['pending', 'pending_approval'],
    tone: 'warning',
  },
  {
    id: 'awaiting_payment',
    label: 'Awaiting payment',
    meaning: 'Accepted, with payment started or not yet completed.',
    statuses: ['awaiting_payment', 'pending_payment', 'payment_initiated', 'payment_started'],
    tone: 'info',
  },
  {
    id: 'confirmed',
    label: 'Confirmed',
    meaning: 'Paid and scheduled. Includes sessions that were rescheduled.',
    statuses: ['confirmed', 'rescheduled'],
    tone: 'success',
  },
  {
    id: 'completed',
    label: 'Completed',
    meaning: 'The session happened.',
    statuses: ['completed'],
    tone: 'neutral',
  },
  {
    id: 'closed',
    label: 'Cancelled or closed',
    meaning: 'Cancelled, declined, expired, or the client did not attend.',
    statuses: ['cancelled', 'rejected', 'expired', 'no_show'],
    tone: 'danger',
  },
  {
    id: 'holding',
    label: 'Unfinished holds',
    meaning: 'A slot was held but the booking was never submitted. Rarely actionable.',
    statuses: ['draft', 'locked', 'slot_locked'],
    tone: 'neutral',
  },
];

export type PaymentStatusGroupId = 'paid' | 'unpaid' | 'failed' | 'refunded';

export interface PaymentStatusGroup {
  readonly id: PaymentStatusGroupId;
  readonly label: string;
  readonly statuses: readonly PaymentStatus[];
  readonly tone: AdminTone;
}

export const PAYMENT_STATUS_GROUPS: readonly PaymentStatusGroup[] = [
  { id: 'paid', label: 'Paid', statuses: ['paid', 'success'], tone: 'success' },
  { id: 'unpaid', label: 'Not paid', statuses: ['unpaid', 'pending', 'initiated'], tone: 'warning' },
  { id: 'failed', label: 'Failed', statuses: ['failed'], tone: 'danger' },
  { id: 'refunded', label: 'Refunded', statuses: ['refunded'], tone: 'info' },
];

/** The group a stored status belongs to, or `null` for a value not in the union. */
export function bookingStatusGroupFor(status: string | undefined | null): BookingStatusGroup | null {
  if (!status) return null;
  return (
    BOOKING_STATUS_GROUPS.find((group) =>
      (group.statuses as readonly string[]).includes(status)
    ) ?? null
  );
}

export function paymentStatusGroupFor(status: string | undefined | null): PaymentStatusGroup | null {
  if (!status) return null;
  return (
    PAYMENT_STATUS_GROUPS.find((group) => (group.statuses as readonly string[]).includes(status)) ??
    null
  );
}

export function isBookingStatusGroupId(value: string): value is BookingStatusGroupId {
  return BOOKING_STATUS_GROUPS.some((group) => group.id === value);
}

export function isPaymentStatusGroupId(value: string): value is PaymentStatusGroupId {
  return PAYMENT_STATUS_GROUPS.some((group) => group.id === value);
}

/* ------------------------------------------------------------------ *
 * Pagination cursor
 * ------------------------------------------------------------------ */

/**
 * Where the previous page stopped.
 *
 * The document id is part of the cursor, not decoration. Two bookings created in
 * the same millisecond would make a `createdAt`-only cursor ambiguous, and the
 * failure mode is a booking that is skipped entirely — invisible in the UI and
 * indistinguishable from "we have no such booking". The id breaks the tie.
 */
export interface AdminBookingCursor {
  readonly createdAtMs: number;
  readonly id: string;
}

const CURSOR_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

/**
 * `<createdAtMillis>.<documentId>` — deliberately plain text.
 *
 * There is nothing to hide: both halves come from a row the operator is already
 * looking at. Keeping it readable means a paging bug can be diagnosed from the
 * URL, and it avoids `Buffer`, which would make this module unusable in the
 * browser bundle that imports the status groups from it.
 */
export function encodeBookingCursor(cursor: AdminBookingCursor): string {
  return `${cursor.createdAtMs}.${cursor.id}`;
}

/**
 * `null` for anything that is not a cursor this module produced.
 *
 * A malformed cursor must not fall back to "start from the beginning": an
 * operator paging through 900 bookings would silently loop over the first page
 * and conclude the rest do not exist. The caller turns `null` into a 400.
 */
export function decodeBookingCursor(raw: string | null | undefined): AdminBookingCursor | null {
  if (!raw) return null;
  const separator = raw.indexOf('.');
  if (separator <= 0) return null;
  const createdAtMs = Number(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) return null;
  if (!CURSOR_ID_PATTERN.test(id)) return null;
  return { createdAtMs, id };
}

/* ------------------------------------------------------------------ *
 * Query planning
 * ------------------------------------------------------------------ */

export type AdminBookingFilterField = 'status' | 'paymentStatus' | 'therapistId' | 'date';

export interface AdminBookingListRequest {
  readonly statusGroup?: BookingStatusGroupId;
  readonly paymentGroup?: PaymentStatusGroupId;
  readonly therapistId?: string;
  /** One calendar day of *sessions*, `YYYY-MM-DD`. Not the creation date. */
  readonly date?: string;
  readonly pageSize?: number;
  readonly cursor?: AdminBookingCursor | null;
}

export interface FirestoreEquality {
  readonly field: AdminBookingFilterField;
  readonly op: '==' | 'in';
  readonly value: string | readonly string[];
}

export interface AdminBookingQueryPlan {
  readonly where: readonly FirestoreEquality[];
  readonly orderBy: readonly { readonly field: string; readonly direction: 'asc' | 'desc' }[];
  /** One more than the page size, so the caller can tell whether more exist. */
  readonly limit: number;
  readonly pageSize: number;
  readonly startAfter: AdminBookingCursor | null;
  /** The composite index this shape needs; `null` when single-field is enough. */
  readonly index: string | null;
}

export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Every filter combination Firestore can serve, with the index that serves it.
 *
 * `index` names the entry in `firestore.indexes.json`; a test asserts each one is
 * actually declared there, so this table cannot drift into promising a query the
 * project has no index for. Combinations absent from the table are refused —
 * answering them by querying on one filter and discarding rows in memory would
 * return short pages and let an operator conclude "no results" while matching
 * bookings sat further down the collection.
 */
const INDEXED_COMBINATIONS: readonly {
  readonly fields: readonly AdminBookingFilterField[];
  readonly index: string | null;
}[] = [
  { fields: [], index: null },
  { fields: ['status'], index: 'bookings(status,createdAt DESC)' },
  { fields: ['paymentStatus'], index: 'bookings(paymentStatus,createdAt DESC)' },
  { fields: ['therapistId'], index: 'bookings(therapistId,createdAt DESC)' },
  { fields: ['date'], index: 'bookings(date,createdAt DESC)' },
  { fields: ['date', 'status'], index: 'bookings(date,status,createdAt DESC)' },
  { fields: ['therapistId', 'date'], index: 'bookings(therapistId,date,createdAt DESC)' },
];

/** Stable key for a set of filter fields, order-independent. */
function combinationKey(fields: readonly AdminBookingFilterField[]): string {
  return [...fields].sort().join('+');
}

const COMBINATION_INDEX = new Map(
  INDEXED_COMBINATIONS.map((entry) => [combinationKey(entry.fields), entry])
);

/** Index names this module claims exist. Used by the indexes-file test. */
export const REQUIRED_COMPOSITE_INDEXES: readonly string[] = INDEXED_COMBINATIONS.map(
  (entry) => entry.index
).filter((name): name is string => name !== null);

export function isSupportedFilterCombination(fields: readonly AdminBookingFilterField[]): boolean {
  return COMBINATION_INDEX.has(combinationKey(fields));
}

/**
 * Filters that can still be added to the active set without leaving the indexed
 * combinations. The filter bar uses this to disable the controls that would
 * produce a query the project cannot run, instead of letting an operator build
 * one and meet an error.
 */
export function allowedAdditionalFilters(
  active: readonly AdminBookingFilterField[]
): readonly AdminBookingFilterField[] {
  const all: readonly AdminBookingFilterField[] = ['status', 'paymentStatus', 'therapistId', 'date'];
  return all.filter(
    (field) => !active.includes(field) && isSupportedFilterCombination([...active, field])
  );
}

export type AdminBookingPlanResult =
  | { readonly ok: true; readonly plan: AdminBookingQueryPlan }
  | {
      readonly ok: false;
      readonly code: 'UNSUPPORTED_FILTER_COMBINATION' | 'INVALID_PAGE_SIZE' | 'INVALID_DATE';
      readonly message: string;
    };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns an operator's filter selection into a Firestore query shape, or explains
 * why it cannot.
 *
 * A group with one member becomes `==`; a group with several becomes `in`. Both
 * use the same composite index, but `==` is the simpler shape and there is no
 * reason to send a one-element `in`.
 */
export function planAdminBookingList(request: AdminBookingListRequest): AdminBookingPlanResult {
  const pageSize = request.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < MIN_PAGE_SIZE || pageSize > MAX_PAGE_SIZE) {
    return {
      ok: false,
      code: 'INVALID_PAGE_SIZE',
      message: `Page size must be a whole number between ${MIN_PAGE_SIZE} and ${MAX_PAGE_SIZE}.`,
    };
  }

  if (request.date !== undefined && !ISO_DATE.test(request.date)) {
    return { ok: false, code: 'INVALID_DATE', message: 'Date must be in YYYY-MM-DD form.' };
  }

  const where: FirestoreEquality[] = [];
  const fields: AdminBookingFilterField[] = [];

  // Ordered so the emitted constraints read the way the index is declared.
  if (request.date !== undefined) {
    where.push({ field: 'date', op: '==', value: request.date });
    fields.push('date');
  }
  if (request.therapistId !== undefined) {
    where.push({ field: 'therapistId', op: '==', value: request.therapistId });
    fields.push('therapistId');
  }
  if (request.statusGroup !== undefined) {
    const group = BOOKING_STATUS_GROUPS.find((candidate) => candidate.id === request.statusGroup);
    if (!group) {
      return {
        ok: false,
        code: 'UNSUPPORTED_FILTER_COMBINATION',
        message: `Unknown status filter "${request.statusGroup}".`,
      };
    }
    where.push(
      group.statuses.length === 1
        ? { field: 'status', op: '==', value: group.statuses[0] }
        : { field: 'status', op: 'in', value: group.statuses }
    );
    fields.push('status');
  }
  if (request.paymentGroup !== undefined) {
    const group = PAYMENT_STATUS_GROUPS.find((candidate) => candidate.id === request.paymentGroup);
    if (!group) {
      return {
        ok: false,
        code: 'UNSUPPORTED_FILTER_COMBINATION',
        message: `Unknown payment filter "${request.paymentGroup}".`,
      };
    }
    where.push(
      group.statuses.length === 1
        ? { field: 'paymentStatus', op: '==', value: group.statuses[0] }
        : { field: 'paymentStatus', op: 'in', value: group.statuses }
    );
    fields.push('paymentStatus');
  }

  const combination = COMBINATION_INDEX.get(combinationKey(fields));
  if (!combination) {
    return {
      ok: false,
      code: 'UNSUPPORTED_FILTER_COMBINATION',
      message:
        `Filtering by ${describeFields(fields)} together is not indexed. ` +
        `Narrow to one of: ${INDEXED_COMBINATIONS.filter((entry) => entry.fields.length > 0)
          .map((entry) => describeFields(entry.fields))
          .join('; ')}.`,
    };
  }

  return {
    ok: true,
    plan: {
      where,
      orderBy: [
        { field: 'createdAt', direction: 'desc' },
        // Ties broken by document id so a cursor can never straddle two rows.
        { field: '__name__', direction: 'desc' },
      ],
      limit: pageSize + 1,
      pageSize,
      startAfter: request.cursor ?? null,
      index: combination.index,
    },
  };
}

function describeFields(fields: readonly AdminBookingFilterField[]): string {
  if (fields.length === 0) return 'nothing';
  const labels: Record<AdminBookingFilterField, string> = {
    status: 'status',
    paymentStatus: 'payment',
    therapistId: 'therapist',
    date: 'session date',
  };
  return [...fields].sort().map((field) => labels[field]).join(' + ');
}

/* ------------------------------------------------------------------ *
 * Row projection
 * ------------------------------------------------------------------ */

/**
 * What the list sends to the browser for one booking.
 *
 * Narrower than the stored document, on purpose. The Meet link, payment ids,
 * reschedule history, decline notes and the client's free-text message are not
 * here: they belong to the detail view, where an operator has named one booking
 * and the access is attributable. A list is the wrong place to hand out every
 * client's phone number and session link in bulk — but name, email and phone are
 * how an operator recognises the row they were called about, so those stay.
 */
export interface AdminBookingRow {
  readonly id: string;
  readonly createdAtIso: string | null;
  readonly status: string;
  readonly statusGroup: BookingStatusGroupId | null;
  readonly paymentStatus: string | null;
  readonly paymentGroup: PaymentStatusGroupId | null;
  readonly clientName: string;
  readonly clientEmail: string;
  readonly clientPhone: string;
  readonly therapistId: string;
  readonly date: string;
  readonly time: string;
  readonly sessionType: string;
  readonly sessionMode: string | null;
  /** Rupees — the unit `booking.paymentAmount` is stored in. `null` if unset. */
  readonly amountRupees: number | null;
  readonly currency: string | null;
  /** Whether a Meet link exists, not the link itself. */
  readonly hasMeetingLink: boolean;
  readonly calendarStatus: string | null;
  readonly refundStatus: string | null;
  readonly rescheduleCount: number;
}

/** The subset of a booking document this projection reads. */
export interface AdminBookingSource {
  id: string;
  status?: string;
  paymentStatus?: string;
  name?: string;
  email?: string;
  phone?: string;
  therapistId?: string;
  date?: string;
  time?: string;
  sessionType?: string;
  sessionMode?: string;
  paymentAmount?: number;
  paymentCurrency?: string;
  meetingUrl?: string;
  calendarStatus?: string;
  refundStatus?: string;
  rescheduleHistory?: unknown[];
  createdAt?: unknown;
}

/**
 * Firestore `Timestamp`, `Date`, ISO string or epoch millis to an ISO string.
 *
 * Written out rather than imported so this module stays dependency-free and
 * usable in both the route handler and the browser bundle. Anything
 * unrecognisable becomes `null`; the UI prints a dash, which is honest, instead
 * of "Invalid Date".
 */
function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Date(value).toISOString() : null;
  }
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

export function toAdminBookingRow(booking: AdminBookingSource): AdminBookingRow {
  const amount = booking.paymentAmount;
  return {
    id: booking.id,
    createdAtIso: isoOrNull(booking.createdAt),
    status: booking.status ?? 'pending',
    statusGroup: bookingStatusGroupFor(booking.status)?.id ?? null,
    paymentStatus: booking.paymentStatus ?? null,
    paymentGroup: paymentStatusGroupFor(booking.paymentStatus)?.id ?? null,
    clientName: booking.name ?? '',
    clientEmail: booking.email ?? '',
    clientPhone: booking.phone ?? '',
    therapistId: booking.therapistId ?? '',
    date: booking.date ?? '',
    time: booking.time ?? '',
    sessionType: booking.sessionType ?? '',
    sessionMode: booking.sessionMode ?? null,
    amountRupees: typeof amount === 'number' && Number.isFinite(amount) ? amount : null,
    currency: booking.paymentCurrency ?? null,
    hasMeetingLink: typeof booking.meetingUrl === 'string' && booking.meetingUrl.length > 0,
    calendarStatus: booking.calendarStatus ?? null,
    refundStatus: booking.refundStatus ?? null,
    rescheduleCount: Array.isArray(booking.rescheduleHistory) ? booking.rescheduleHistory.length : 0,
  };
}

/** The cursor that continues a page ending on this row, or `null` if it can't. */
export function cursorForRow(row: AdminBookingRow): AdminBookingCursor | null {
  if (!row.createdAtIso) return null;
  const ms = Date.parse(row.createdAtIso);
  return Number.isFinite(ms) ? { createdAtMs: ms, id: row.id } : null;
}

/* ------------------------------------------------------------------ *
 * Direct lookup
 * ------------------------------------------------------------------ */

/**
 * How a typed search term should be looked up.
 *
 * Every kind here is an exact match or a prefix range, so each is served by an
 * automatic single-field index and stays fast on a collection of any size. There
 * is deliberately no substring search: Firestore cannot do one, and faking it by
 * downloading bookings and filtering in memory is what made the old console miss
 * everything past its 500-document ceiling. `name` is a *prefix* match and is
 * case-sensitive — the UI says so rather than letting an operator read "no
 * results" as "no such client".
 */
export type BookingLookupKind =
  | 'bookingId'
  | 'orderId'
  | 'paymentId'
  | 'email'
  | 'phone'
  | 'namePrefix';

export interface BookingLookup {
  readonly kind: BookingLookupKind;
  /**
   * Exact values to try, in order, de-duplicated. More than one only for phone
   * numbers — see `classifyBookingLookup`. For `namePrefix` the single value is
   * the prefix, not an exact match.
   */
  readonly values: readonly string[];
}

/** Digits, optionally with a leading +, spaces, dashes or brackets. */
const PHONE_LIKE = /^\+?[\d\s()-]{6,20}$/;

/**
 * Which stored field a typed term should be matched against.
 *
 * **Phone is the weak one, and the weakness is in the stored data rather than
 * here.** `bookingSchema.phone` only `.trim()`s, so a booking holds whatever the
 * client typed — `+91 98765 43210`, `098765-43210` and `9876543210` are three
 * different strings for one person, and Firestore has no way to match across
 * them. So a phone lookup tries the term as typed *and* its digits-only form,
 * which covers a stored value that matches either shape, and the UI says plainly
 * that it can still miss. Email is safe by comparison: `/api/bookings/create`
 * lowercases before writing, so the lowercased term is the right key.
 *
 * The real fix is a normalised `phoneDigits` field written alongside `phone` and
 * backfilled — a booking *write-path* change, deliberately not made here, where
 * the job is to read what exists without regressing creation.
 */
export function classifyBookingLookup(raw: string): BookingLookup | null {
  const term = raw.trim();
  if (term.length === 0) return null;

  if (/^bk_/i.test(term)) return { kind: 'bookingId', values: [term] };
  if (/^order_/i.test(term)) return { kind: 'orderId', values: [term] };
  if (/^pay_/i.test(term)) return { kind: 'paymentId', values: [term] };
  if (term.includes('@')) return { kind: 'email', values: [term.toLowerCase()] };
  if (PHONE_LIKE.test(term)) {
    const digitsOnly = term.replace(/[\s()-]/g, '');
    const values = digitsOnly === term ? [term] : [term, digitsOnly];
    return { kind: 'phone', values };
  }
  return { kind: 'namePrefix', values: [term] };
}

/** One line of what a lookup will and will not match, shown next to the input. */
export function describeBookingLookup(lookup: BookingLookup): string {
  switch (lookup.kind) {
    case 'bookingId':
      return 'Exact booking id.';
    case 'orderId':
      return 'Exact Razorpay order id.';
    case 'paymentId':
      return 'Exact Razorpay payment id.';
    case 'email':
      return 'Exact email address, ignoring capitals.';
    case 'phone':
      return 'Phone number as the client typed it, or the same digits without spacing. Stored numbers are not normalised, so a different format will not match — use the email or booking id if this finds nothing.';
    case 'namePrefix':
      return 'Names starting with this text. Case-sensitive, so “Ananya” and “ananya” differ.';
  }
}
