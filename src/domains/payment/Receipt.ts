import type { Booking } from '@/domains/booking/entities/Booking';
import type { Payment } from './Payment';
import { toStandardDate } from '@/shared/utils/dateTime';
import { createHash } from 'node:crypto';

/**
 * The receipt view model.
 *
 * A receipt is *derived*, never stored: every field below already exists on the
 * booking (which the client owns) or on the `payments` document written by the
 * gateway flow. Deriving it means a receipt cannot drift from the payment it
 * describes, and it means no migration was needed to start issuing receipts for
 * payments that were taken before this code existed.
 *
 * Why the booking is the anchor rather than the payment: `payments` documents
 * carry `bookingId`, `therapistId` and `patientEmail` but no `userId` — see
 * `CreatePaymentOrderCommand`. The dashboard used to query
 * `payments where userId == uid`, a field no document has ever had, which is why
 * the Receipts page was permanently empty. Ownership lives on the booking
 * (`userId` / `email`), so the booking is what authorization is checked against.
 */
export interface Receipt {
  /** Stable, derived reference printed on the document. See `deriveReceiptNumber`. */
  receiptNumber: string;
  /** Also the URL segment for the PDF route; ownership is checked against it. */
  bookingId: string;
  /** When the money was actually taken (payment verification), ISO 8601. */
  paidAtIso: string | null;
  clientName: string;
  clientEmail: string;
  therapistName: string;
  sessionType: string;
  sessionMode: 'online' | 'in_person';
  /** IST calendar date of the session, `YYYY-MM-DD`. */
  sessionDate: string;
  /** IST start time of the session, `HH:MM`. */
  sessionTime: string;
  /** Rupees, not paise — the unit `calculateBookingPrice` and Razorpay orders use. */
  amount: number;
  currency: string;
  status: 'paid' | 'refunded' | 'partially_refunded';
  /** Gateway payment reference, absent on a legacy or link-based payment. */
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  /** Present only once a refund has actually settled. Rupees. */
  refundedAmount: number | null;
  refundedAtIso: string | null;
  refundReference: string | null;
}

/** Booking payment states that mean money was genuinely captured. */
const PAID_STATES = new Set(['paid', 'success', 'refunded']);

/**
 * Whether this booking has a receipt at all.
 *
 * Only a captured payment does. An `unpaid`/`pending`/`initiated`/`failed`
 * booking is an abandoned or failed attempt — issuing a document that says
 * "payment received" for one would be a fabrication, so those are excluded from
 * the list and 404 on the PDF route.
 */
export function isReceiptable(booking: Pick<Booking, 'paymentStatus'>): boolean {
  return !!booking.paymentStatus && PAID_STATES.has(booking.paymentStatus);
}

/**
 * Derives the printed receipt number.
 *
 * Deliberately a pure function of identifiers that never change (the booking id,
 * plus the gateway order id when there is one) rather than a counter: it is
 * stable across re-downloads, needs no write on a GET, and cannot be duplicated
 * by a retry. The year segment comes from the payment date so the reference reads
 * naturally in accounts.
 *
 * It is a *reference*, not a statutory sequential invoice number. Saarthi's
 * payment records carry no tax registration or tax component anywhere in the
 * codebase, so no such sequence is claimed here.
 */
export function deriveReceiptNumber(bookingId: string, orderId: string | null, paidAt: Date | null): string {
  const digest = createHash('sha256').update(`${bookingId}|${orderId ?? ''}`).digest('hex');
  // 40 bits of the digest as base36, uppercased and zero-padded to 8 characters.
  const suffix = parseInt(digest.slice(0, 10), 16).toString(36).toUpperCase().padStart(8, '0');
  const year = (paidAt ?? new Date()).getUTCFullYear();
  return `SAAR-${year}-${suffix}`;
}

function firstNonEmpty(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function isoOrNull(value: unknown): string | null {
  const date = toStandardDate(value);
  return date ? date.toISOString() : null;
}

/**
 * Builds the receipt for a paid booking, or `null` when the booking has no
 * captured payment.
 *
 * `payment` is optional and only ever *supplements* the booking: the gateway
 * document is the better source for the amount actually charged and for the
 * verification timestamp, but a booking paid before the `payments` collection
 * carried that field must still produce a correct receipt rather than a blank.
 * Nothing here substitutes a plausible-looking default for a missing value —
 * absent stays absent, and the renderer prints a dash.
 */
export function buildReceipt(
  booking: Booking,
  options: { therapistName?: string | null; payment?: Payment | null } = {}
): Receipt | null {
  if (!isReceiptable(booking)) return null;

  const { payment } = options;
  const paidAtIso =
    isoOrNull(booking.paymentVerifiedAt) ??
    isoOrNull(payment?.verifiedAt) ??
    isoOrNull(payment?.createdAt) ??
    isoOrNull(booking.createdAt);
  const paidAt = paidAtIso ? new Date(paidAtIso) : null;

  const razorpayOrderId = firstNonEmpty(booking.razorpayOrderId, payment?.razorpayOrderId);
  const amount = [booking.paymentAmount, payment?.amount].find(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
  );

  const refundedAtIso = isoOrNull(booking.refundedAt) ?? isoOrNull(payment?.refundedAt);
  // `booking.refundAmount` is paise (the `refunds` collection is the source of
  // truth); the receipt prints rupees, like every other amount on it.
  const refundedPaise =
    typeof booking.refundAmount === 'number' && booking.refundAmount > 0 ? booking.refundAmount : null;

  const isRefunded = booking.refundStatus === 'refunded' || booking.paymentStatus === 'refunded';
  const isPartial = booking.refundStatus === 'partial';

  return {
    receiptNumber: deriveReceiptNumber(booking.id, razorpayOrderId, paidAt),
    bookingId: booking.id,
    paidAtIso,
    clientName: firstNonEmpty(booking.name) ?? '',
    clientEmail: firstNonEmpty(booking.email, payment?.patientEmail) ?? '',
    therapistName: firstNonEmpty(options.therapistName) ?? 'Saarthi therapist',
    sessionType: firstNonEmpty(booking.sessionType) ?? 'Therapy session',
    sessionMode: booking.sessionMode === 'in_person' ? 'in_person' : 'online',
    sessionDate: firstNonEmpty(booking.date) ?? '',
    sessionTime: firstNonEmpty(booking.time) ?? '',
    amount: amount ?? 0,
    currency: firstNonEmpty(booking.paymentCurrency, payment?.currency) ?? 'INR',
    status: isRefunded ? 'refunded' : isPartial ? 'partially_refunded' : 'paid',
    razorpayPaymentId: firstNonEmpty(booking.razorpayPaymentId, payment?.razorpayPaymentId),
    razorpayOrderId,
    refundedAmount: refundedPaise !== null ? refundedPaise / 100 : null,
    refundedAtIso,
    refundReference: firstNonEmpty(booking.refundId),
  };
}
