/**
 * How a response from `GET /api/admin/refunds` becomes what the refunds page
 * shows — and what it refuses to show.
 *
 * This is a screen about money that has not arrived, so the failure that matters
 * is the one where an operator reads it and concludes nobody is owed anything:
 *
 *  - **A missing scan is not an empty scan.** The route returns two independently
 *    fallible readings. One that came back `{ ok: false }` is a gap the page must
 *    render as a gap; one that is *absent from the body* — an older deploy, a
 *    truncated response, a proxy that rewrote the JSON — would read as
 *    `undefined` and could render as "no refunds owed". So the payload is rejected
 *    unless both scans are present and well-formed.
 *  - **A row is either readable or the response is not from this build.** Every
 *    row the server sends is narrowed field by field by `toAdminRefundRow`, so a
 *    row that fails these checks did not come from this build's route. Such a row
 *    is never dropped from the list — silently removing one refund from a queue of
 *    refunds owed is the worst thing this file could do — the whole payload is
 *    rejected instead, and the operator gets an error they can act on.
 *  - **A 200 that says `success: false` is a failure.**
 *  - **The server's sentence wins on error.** The route composes its own copy and
 *    keeps raw Firestore and gateway errors in the server log, so whatever it
 *    sends is safe to display verbatim.
 *
 * Kept out of the hook so it can be tested: this project has no DOM test
 * environment, and these rules are the part of the fetch path that can put a
 * false reassurance about money in front of an operator.
 */
import type {
  AdminRefundBookingContext,
  AdminRefundRow,
  RefundCause,
} from '@/domains/admin/refundTriage';

export {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from '../bookings/adminBookingsResponse';

/** A bounded list of refunds, or a stated failure to read them. */
export type RefundScan =
  | { readonly ok: true; readonly rows: readonly AdminRefundRow[]; readonly atLeast: boolean }
  | { readonly ok: false; readonly reason: string };

export interface AdminRefundsPayload {
  readonly generatedAtIso: string;
  readonly outstanding: RefundScan;
  readonly settled: RefundScan;
  /** The per-scan document cap, so the UI can explain a truncated list. */
  readonly scanLimit: number;
}

export type AdminRefundsInterpretation =
  | { readonly ok: true; readonly payload: AdminRefundsPayload }
  | { readonly ok: false; readonly error: string };

export const GENERIC_REFUNDS_ERROR = 'We could not load refunds right now. Please try again.';

export const REFUNDS_ACCESS_ERROR =
  'Your session no longer has admin access. Sign in again to continue.';

export const REFUNDS_SESSION_ERROR = 'Your session has expired. Reload the page to sign in again.';

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

/**
 * The classified failure, or nothing.
 *
 * The kinds are checked exhaustively rather than by `typeof kind === 'string'`,
 * because the whole purpose of this union is that the browser never receives raw
 * error text. A body carrying `{ kind: 'FAILED_PRECONDITION: ...' }` would sail
 * through a loose check and render a Firestore error — with the project id and an
 * index-creation URL in it — as a cause.
 */
function isRefundCause(value: unknown): value is RefundCause {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const cause = value as Record<string, unknown>;
  switch (cause.kind) {
    case 'payment_unknown_at_gateway':
    case 'nothing_to_refund':
    case 'unclassified':
      return true;
    case 'payment_not_captured':
      return isNullableString(cause.gatewayStatus);
    default:
      return false;
  }
}

function isBookingContext(value: unknown): value is AdminRefundBookingContext {
  if (!value || typeof value !== 'object') return false;
  const booking = value as Record<string, unknown>;
  return (
    isNullableString(booking.clientName) &&
    isNullableString(booking.sessionDate) &&
    isNullableString(booking.sessionTime) &&
    isNullableString(booking.status) &&
    isNullableString(booking.paymentStatus) &&
    isNullableNumber(booking.paymentAmountRupees) &&
    isNullableString(booking.currency) &&
    isNullableString(booking.refundStatus)
  );
}

/**
 * One refund row, every field narrowed.
 *
 * `status` and `attempts` are required and typed, not defaulted: `refundStanding`
 * branches on `status` and prints `attempts` in a sentence, so an absent field
 * would surface as the word "undefined" beside a rupee figure.
 */
function isRefundRow(value: unknown): value is AdminRefundRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    typeof row.status === 'string' &&
    row.status.length > 0 &&
    typeof row.attempts === 'number' &&
    Number.isFinite(row.attempts) &&
    isNullableString(row.bookingId) &&
    isNullableString(row.razorpayPaymentId) &&
    isNullableString(row.razorpayOrderId) &&
    isNullableString(row.reason) &&
    isNullableNumber(row.refundPercent) &&
    isNullableString(row.refundId) &&
    isNullableNumber(row.amountRefundedPaise) &&
    isRefundCause(row.cause) &&
    isNullableString(row.requestedAtIso) &&
    isNullableString(row.updatedAtIso) &&
    (row.booking === null || isBookingContext(row.booking))
  );
}

/**
 * One scan, or an admitted failure.
 *
 * `atLeast` is required on the success branch, not optional: it is what stops a
 * capped scan being read as the whole queue, and a body that omitted it would
 * quietly turn "sixty or more refunds owed" into "sixty".
 */
function isRefundScan(value: unknown): value is RefundScan {
  if (!value || typeof value !== 'object') return false;
  const scan = value as Record<string, unknown>;
  if (scan.ok === true) {
    return (
      Array.isArray(scan.rows) && scan.rows.every(isRefundRow) && typeof scan.atLeast === 'boolean'
    );
  }
  if (scan.ok === false) {
    return typeof scan.reason === 'string' && scan.reason.trim().length > 0;
  }
  return false;
}

/**
 * `status` and the parsed body — deliberately not a `Response`, so the rules are
 * assertable without constructing HTTP.
 *
 * `body` is `null` for a response that was not JSON at all (a proxy error page,
 * say), which tells an operator nothing and becomes the generic message.
 */
export function interpretAdminRefundsResponse(
  status: number,
  body: unknown
): AdminRefundsInterpretation {
  if (status === 401 || status === 403) {
    return { ok: false, error: REFUNDS_ACCESS_ERROR };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, error: messageIn(body) ?? GENERIC_REFUNDS_ERROR };
  }

  if (!body || typeof body !== 'object') {
    return { ok: false, error: GENERIC_REFUNDS_ERROR };
  }
  const candidate = body as Record<string, unknown>;

  if (candidate.success === false) {
    return { ok: false, error: messageIn(body) ?? GENERIC_REFUNDS_ERROR };
  }

  if (
    typeof candidate.generatedAtIso !== 'string' ||
    typeof candidate.scanLimit !== 'number' ||
    !isRefundScan(candidate.outstanding) ||
    !isRefundScan(candidate.settled)
  ) {
    return { ok: false, error: GENERIC_REFUNDS_ERROR };
  }

  return {
    ok: true,
    payload: {
      generatedAtIso: candidate.generatedAtIso,
      outstanding: candidate.outstanding,
      settled: candidate.settled,
      scanLimit: candidate.scanLimit,
    },
  };
}

export interface RefundGaps {
  readonly labels: readonly string[];
  readonly sentence: string;
}

/**
 * What this page could not see, as one sentence — or `null` when it saw both
 * scans.
 *
 * Named at the top of the page and in the words "missing, not zero", because the
 * outstanding scan failing is precisely the case where the page would otherwise
 * look like good news.
 */
export function describeRefundGaps(payload: AdminRefundsPayload): RefundGaps | null {
  const labels: string[] = [];
  if (!payload.outstanding.ok) labels.push('Refunds owed');
  if (!payload.settled.ok) labels.push('Settled refunds');
  if (labels.length === 0) return null;

  const noun = labels.length === 1 ? 'list' : 'lists';
  return {
    labels,
    sentence:
      `${labels.length} ${noun} could not be loaded: ${labels.join(' and ')}. ` +
      'Those are missing, not empty.',
  };
}
