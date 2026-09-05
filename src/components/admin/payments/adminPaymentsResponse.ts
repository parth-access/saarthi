/**
 * How a response from `GET /api/admin/payments` becomes what the screen shows —
 * and what it refuses to show.
 *
 * This screen reconciles two records of one payment, so the failure that matters
 * is a malformed side reading as agreement, or a broken recent scan reading as
 * "no payments". The rules, the same family the refunds parser uses:
 *
 *  - **A malformed trace side is not an empty side.** Every field of the payment
 *    document and the booking is narrowed; if either object is present but any
 *    field is the wrong type, the whole payload is rejected rather than passed to
 *    `reconcilePayment`, which would otherwise compare `undefined` against
 *    `undefined` and report a spurious agreement.
 *  - **A missing scan is not an empty scan.** `recent` must be present and
 *    well-formed; a body without it — an older deploy, a truncated response —
 *    would read as `undefined` and could render as "no recent orders".
 *  - **A 200 that says `success: false` is a failure.**
 *  - **The server's sentence wins on error.** The route keeps raw Firestore and
 *    gateway errors in the server log, so whatever copy it sends is safe verbatim.
 *
 * Kept out of the hook so it can be tested without a DOM: these are the rules that
 * decide whether a false reassurance about money reaches an operator.
 */
import type { AdminPaymentBooking, AdminPaymentDoc } from '@/domains/admin/paymentTrace';

export type { AdminPaymentBooking, AdminPaymentDoc } from '@/domains/admin/paymentTrace';

export {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from '../bookings/adminBookingsResponse';

/** One row of the recent gateway-orders list. Mirrors the server projection. */
export interface AdminPaymentOrderRow {
  readonly orderId: string;
  readonly bookingId: string | null;
  readonly status: string | null;
  readonly amountRupees: number | null;
  readonly currency: string | null;
  readonly razorpayPaymentId: string | null;
  readonly source: string | null;
  readonly createdAtIso: string | null;
}

export type PaymentScan =
  | { readonly ok: true; readonly rows: readonly AdminPaymentOrderRow[]; readonly atLeast: boolean }
  | { readonly ok: false; readonly reason: string };

export type AdminPaymentTraceResult =
  | {
      readonly ok: true;
      readonly query: string;
      readonly payment: AdminPaymentDoc | null;
      readonly booking: AdminPaymentBooking | null;
      readonly receiptNumber: string | null;
    }
  | { readonly ok: false; readonly query: string; readonly reason: string };

export interface AdminPaymentsPayload {
  readonly generatedAtIso: string;
  readonly trace: AdminPaymentTraceResult | null;
  readonly recent: PaymentScan;
  readonly scanLimit: number;
}

export type AdminPaymentsInterpretation =
  | { readonly ok: true; readonly payload: AdminPaymentsPayload }
  | { readonly ok: false; readonly error: string };

export const GENERIC_PAYMENTS_ERROR = 'We could not load payments right now. Please try again.';

export const PAYMENTS_ACCESS_ERROR =
  'Your session no longer has admin access. Sign in again to continue.';

export const PAYMENTS_SESSION_ERROR = 'Your session has expired. Reload the page to sign in again.';

/** The `error` string a response body carries, if it carries a usable one. */
function messageIn(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const message = (body as { error?: unknown }).error;
  return typeof message === 'string' && message.trim().length > 0 ? message : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

/** A `payments` document, every field narrowed. `orderId` is the one required id. */
function isPaymentDoc(value: unknown): value is AdminPaymentDoc {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Record<string, unknown>;
  return (
    typeof doc.orderId === 'string' &&
    doc.orderId.length > 0 &&
    isNullableString(doc.bookingId) &&
    isNullableString(doc.status) &&
    isNullableNumber(doc.amountRupees) &&
    isNullableString(doc.currency) &&
    isNullableString(doc.razorpayOrderId) &&
    isNullableString(doc.razorpayPaymentId) &&
    isNullableString(doc.source) &&
    isNullableString(doc.createdAtIso) &&
    isNullableString(doc.verifiedAtIso) &&
    isNullableString(doc.refundedAtIso)
  );
}

/** The booking side of a trace, every field narrowed. `id` is required. */
function isPaymentBooking(value: unknown): value is AdminPaymentBooking {
  if (!value || typeof value !== 'object') return false;
  const booking = value as Record<string, unknown>;
  return (
    typeof booking.id === 'string' &&
    booking.id.length > 0 &&
    isNullableString(booking.clientName) &&
    isNullableString(booking.clientEmail) &&
    isNullableString(booking.sessionDate) &&
    isNullableString(booking.sessionTime) &&
    isNullableString(booking.sessionType) &&
    isNullableString(booking.bookingStatus) &&
    isNullableString(booking.paymentStatus) &&
    isNullableNumber(booking.amountRupees) &&
    isNullableString(booking.currency) &&
    isNullableString(booking.razorpayOrderId) &&
    isNullableString(booking.razorpayPaymentId) &&
    isNullableString(booking.paidAtIso) &&
    isNullableString(booking.refundStatus) &&
    isNullableString(booking.refundId) &&
    isNullableNumber(booking.refundAmountPaise) &&
    isNullableString(booking.refundedAtIso)
  );
}

/**
 * A trace result, or nothing.
 *
 * Both branches carry `query`, so the screen can title the result with the id the
 * operator searched for even when nothing matched. On the `ok: true` branch the
 * two sides are independently nullable — a matched-nothing trace is `payment` and
 * `booking` both `null`, which is valid, not an error.
 */
function isTraceResult(value: unknown): value is AdminPaymentTraceResult {
  if (!value || typeof value !== 'object') return false;
  const trace = value as Record<string, unknown>;
  if (typeof trace.query !== 'string') return false;
  if (trace.ok === true) {
    return (
      (trace.payment === null || isPaymentDoc(trace.payment)) &&
      (trace.booking === null || isPaymentBooking(trace.booking)) &&
      isNullableString(trace.receiptNumber)
    );
  }
  if (trace.ok === false) {
    return typeof trace.reason === 'string' && trace.reason.trim().length > 0;
  }
  return false;
}

function isOrderRow(value: unknown): value is AdminPaymentOrderRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.orderId === 'string' &&
    row.orderId.length > 0 &&
    isNullableString(row.bookingId) &&
    isNullableString(row.status) &&
    isNullableNumber(row.amountRupees) &&
    isNullableString(row.currency) &&
    isNullableString(row.razorpayPaymentId) &&
    isNullableString(row.source) &&
    isNullableString(row.createdAtIso)
  );
}

/**
 * One scan, or an admitted failure. `atLeast` is required on success — it is what
 * stops a capped scan being read as the whole collection.
 */
function isPaymentScan(value: unknown): value is PaymentScan {
  if (!value || typeof value !== 'object') return false;
  const scan = value as Record<string, unknown>;
  if (scan.ok === true) {
    return (
      Array.isArray(scan.rows) && scan.rows.every(isOrderRow) && typeof scan.atLeast === 'boolean'
    );
  }
  if (scan.ok === false) {
    return typeof scan.reason === 'string' && scan.reason.trim().length > 0;
  }
  return false;
}

/**
 * `status` and the parsed body — not a `Response`, so the rules are assertable
 * without constructing HTTP. `body` is `null` for a response that was not JSON.
 */
export function interpretAdminPaymentsResponse(
  status: number,
  body: unknown
): AdminPaymentsInterpretation {
  if (status === 401 || status === 403) {
    return { ok: false, error: PAYMENTS_ACCESS_ERROR };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, error: messageIn(body) ?? GENERIC_PAYMENTS_ERROR };
  }

  if (!body || typeof body !== 'object') {
    return { ok: false, error: GENERIC_PAYMENTS_ERROR };
  }
  const candidate = body as Record<string, unknown>;

  if (candidate.success === false) {
    return { ok: false, error: messageIn(body) ?? GENERIC_PAYMENTS_ERROR };
  }

  if (
    typeof candidate.generatedAtIso !== 'string' ||
    typeof candidate.scanLimit !== 'number' ||
    !isPaymentScan(candidate.recent) ||
    !(candidate.trace === null || isTraceResult(candidate.trace))
  ) {
    return { ok: false, error: GENERIC_PAYMENTS_ERROR };
  }

  return {
    ok: true,
    payload: {
      generatedAtIso: candidate.generatedAtIso,
      trace: candidate.trace as AdminPaymentTraceResult | null,
      recent: candidate.recent as PaymentScan,
      scanLimit: candidate.scanLimit,
    },
  };
}
