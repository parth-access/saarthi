/**
 * Reconciling a payment: the `payments` document against the booking.
 *
 * Payment state is recorded in two places that can disagree. The `payments`
 * collection has a document only for the gateway-order flow
 * (`CreatePaymentOrderCommand` writes one keyed by the Razorpay order id); a
 * booking paid through a link, a mock, or before that collection carried a field
 * has none. The booking carries its own payment fields and is what the rest of
 * the platform — and the client's receipt — is built on, so the booking is the
 * record of whether a session was paid.
 *
 * The operator value of a payments trace is catching the *disagreement*: an
 * amount the gateway and the booking record differently, a status the booking
 * never advanced to, a payment id that belongs to another order. So this module
 * states, it does not smooth. `buildReceipt` (Receipt.ts) deliberately prefers
 * one source over another to produce a clean client document; this does the
 * opposite — it puts the two side by side and names every way they fail to line
 * up, because a trace that hid the conflict would be worse than no trace.
 *
 * Client-safe: it deals only in already-normalised ISO strings and numbers, so
 * both the admin route and the screen import it and cannot drift apart. The
 * receipt *number* is derived server-side (it needs `node:crypto`) and passed in;
 * this module only decides whether a receipt exists at all.
 */
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';

/**
 * Booking payment states that mean money was genuinely captured — mirrors
 * `PAID_STATES` in Receipt.ts. Kept as a local copy rather than imported because
 * Receipt.ts pulls in `node:crypto`, which cannot cross into the browser bundle.
 */
const CAPTURED_STATES: ReadonlySet<string> = new Set(['paid', 'success', 'refunded']);

function isCaptured(status: string | null): boolean {
  return !!status && CAPTURED_STATES.has(status);
}

/** The `payments` document, narrowed to what a trace reads. Amounts are rupees. */
export interface AdminPaymentDoc {
  /** Firestore doc id — the Razorpay order id in every document written today. */
  readonly orderId: string;
  readonly bookingId: string | null;
  /** A `PaymentStatus`, or free text if a document stored something off-union. */
  readonly status: string | null;
  readonly amountRupees: number | null;
  readonly currency: string | null;
  readonly razorpayOrderId: string | null;
  readonly razorpayPaymentId: string | null;
  readonly source: string | null;
  readonly createdAtIso: string | null;
  readonly verifiedAtIso: string | null;
  readonly refundedAtIso: string | null;
}

/** The booking's own payment view, narrowed. `amountRupees` is rupees. */
export interface AdminPaymentBooking {
  readonly id: string;
  readonly clientName: string | null;
  readonly clientEmail: string | null;
  readonly sessionDate: string | null;
  readonly sessionTime: string | null;
  readonly sessionType: string | null;
  readonly bookingStatus: string | null;
  readonly paymentStatus: string | null;
  readonly amountRupees: number | null;
  readonly currency: string | null;
  readonly razorpayOrderId: string | null;
  readonly razorpayPaymentId: string | null;
  readonly paidAtIso: string | null;
  readonly refundStatus: string | null;
  readonly refundId: string | null;
  /** Paise — the `refunds` collection's unit — not rupees. */
  readonly refundAmountPaise: number | null;
  readonly refundedAtIso: string | null;
}
/**
 * Which sides of the record exist. `payment_only` is an orphaned gateway order —
 * money may have moved with no booking to attach it to — and is the one to worry
 * about; `booking_only` is ordinary for a link/mock/legacy payment.
 */
export type PaymentPresence = 'both' | 'payment_only' | 'booking_only' | 'neither';

/**
 * A way the two records fail to agree. `tone` is `danger` for a conflict that
 * needs a person (money or identity differs) and `info` for an expected gap that
 * is worth stating but is not itself wrong. Concrete values are carried, not
 * pre-formatted, so the sentence — and its money units — are the presentation
 * layer's job, tested there.
 */
export type PaymentDiscrepancy =
  | { readonly kind: 'amount_mismatch'; readonly tone: AdminTone; readonly paymentRupees: number; readonly bookingRupees: number }
  | { readonly kind: 'status_mismatch'; readonly tone: AdminTone; readonly paymentStatus: string | null; readonly bookingStatus: string | null }
  | { readonly kind: 'payment_id_mismatch'; readonly tone: AdminTone; readonly onPayment: string; readonly onBooking: string }
  | { readonly kind: 'order_id_mismatch'; readonly tone: AdminTone; readonly onPayment: string; readonly onBooking: string }
  | { readonly kind: 'payment_without_booking'; readonly tone: AdminTone }
  | { readonly kind: 'paid_without_payment_doc'; readonly tone: AdminTone };

/** The single question a trace answers first: was the money taken? */
export interface PaymentCaptureReading {
  readonly captured: boolean;
  readonly tone: AdminTone;
  /** Which record this verdict is read from, so it is never a silent guess. */
  readonly source: 'booking' | 'payment' | 'none';
}

export interface PaymentTrace {
  readonly presence: PaymentPresence;
  readonly capture: PaymentCaptureReading;
  readonly discrepancies: readonly PaymentDiscrepancy[];
  /** Whether a receipt exists, and its derived number (computed server-side). */
  readonly receipt: { readonly available: boolean; readonly number: string | null };
  /** A refund's standing on the booking. Money lives in the Refunds section. */
  readonly refund: { readonly present: boolean; readonly status: string | null; readonly reference: string | null };
}

/**
 * The booking is authoritative for whether money was captured; the payment
 * document is only consulted when there is no booking (an orphaned order). This
 * ordering matters: the booking is what every other surface reads, so a trace
 * that called a session paid on the strength of a gateway document the booking
 * never caught up to would contradict the rest of the console.
 */
function readCapture(
  payment: AdminPaymentDoc | null,
  booking: AdminPaymentBooking | null
): PaymentCaptureReading {
  if (booking) {
    const captured = isCaptured(booking.paymentStatus);
    return { captured, tone: captured ? 'success' : 'warning', source: 'booking' };
  }
  if (payment) {
    const captured = isCaptured(payment.status);
    return { captured, tone: captured ? 'success' : 'warning', source: 'payment' };
  }
  return { captured: false, tone: 'neutral', source: 'none' };
}
/** Rupee amounts a hair apart are float noise, not a real mismatch. */
function amountsDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.005;
}

/**
 * Puts one payment document and one booking side by side.
 *
 * `receiptNumber` is the server-derived reference (or null when it could not be
 * computed); this function decides whether a receipt *exists* — only a captured
 * booking has one — and shows the number only when it does, so a stray number
 * can never imply a receipt for an unpaid booking.
 */
export function reconcilePayment(
  payment: AdminPaymentDoc | null,
  booking: AdminPaymentBooking | null,
  receiptNumber: string | null
): PaymentTrace {
  const presence: PaymentPresence = payment && booking
    ? 'both'
    : payment
      ? 'payment_only'
      : booking
        ? 'booking_only'
        : 'neither';

  const discrepancies: PaymentDiscrepancy[] = [];

  // Presence-level findings first: they frame everything below them.
  if (payment && !booking) {
    discrepancies.push({ kind: 'payment_without_booking', tone: 'danger' });
  }
  if (!payment && booking && isCaptured(booking.paymentStatus)) {
    discrepancies.push({ kind: 'paid_without_payment_doc', tone: 'info' });
  }

  if (payment && booking) {
    if (
      payment.amountRupees !== null &&
      booking.amountRupees !== null &&
      amountsDiffer(payment.amountRupees, booking.amountRupees)
    ) {
      discrepancies.push({
        kind: 'amount_mismatch',
        tone: 'danger',
        paymentRupees: payment.amountRupees,
        bookingRupees: booking.amountRupees,
      });
    }
    // Compared on captured-ness, not the raw string, so `success` vs `paid` — two
    // spellings of the same paid state — is never flagged as a conflict.
    if (
      payment.status !== null &&
      booking.paymentStatus !== null &&
      isCaptured(payment.status) !== isCaptured(booking.paymentStatus)
    ) {
      discrepancies.push({
        kind: 'status_mismatch',
        tone: 'danger',
        paymentStatus: payment.status,
        bookingStatus: booking.paymentStatus,
      });
    }
    if (
      payment.razorpayPaymentId &&
      booking.razorpayPaymentId &&
      payment.razorpayPaymentId !== booking.razorpayPaymentId
    ) {
      discrepancies.push({
        kind: 'payment_id_mismatch',
        tone: 'danger',
        onPayment: payment.razorpayPaymentId,
        onBooking: booking.razorpayPaymentId,
      });
    }
    if (
      payment.razorpayOrderId &&
      booking.razorpayOrderId &&
      payment.razorpayOrderId !== booking.razorpayOrderId
    ) {
      discrepancies.push({
        kind: 'order_id_mismatch',
        tone: 'danger',
        onPayment: payment.razorpayOrderId,
        onBooking: booking.razorpayOrderId,
      });
    }
  }

  const receiptAvailable = !!booking && isCaptured(booking.paymentStatus);
  const refundPresent =
    !!booking &&
    (!!booking.refundStatus ||
      !!booking.refundId ||
      !!booking.refundedAtIso ||
      (booking.refundAmountPaise !== null && booking.refundAmountPaise > 0));

  return {
    presence,
    capture: readCapture(payment, booking),
    discrepancies,
    receipt: {
      available: receiptAvailable,
      number: receiptAvailable ? receiptNumber : null,
    },
    refund: {
      present: refundPresent,
      status: booking?.refundStatus ?? null,
      reference: booking?.refundId ?? null,
    },
  };
}

