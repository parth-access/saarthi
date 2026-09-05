/**
 * The payments trace, put into words.
 *
 * `reconcilePayment` decides *what* is true — which records exist, whether money
 * was captured, how the two disagree — and carries concrete values without
 * formatting them. This module turns each of those into a sentence an operator
 * reads, and it is where the money units become rupees and the raw status strings
 * become words. Kept pure and tested because a mis-worded discrepancy is a way to
 * send someone chasing a payment that is fine, or to wave through one that is not.
 *
 * Two rules run through it, matching the rest of the console:
 *  - a value that is not known is said to be not known, never shown as zero or a
 *    blank;
 *  - the tone of a line comes from the reconciliation, not from this module — a
 *    danger stays a danger in the words as well as the colour.
 */
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import type {
  PaymentCaptureReading,
  PaymentDiscrepancy,
  PaymentPresence,
  PaymentTrace,
} from '@/domains/admin/paymentTrace';
import { formatAmount, humanizeStatus } from '../bookings/adminBookingPresentation';

/** Rupees for a discrepancy figure, which carries no currency of its own. */
function rupees(amount: number): string {
  return formatAmount(amount, null);
}

/** A status string as words, quoted, or a plain fallback when there is none. */
function statusWord(status: string | null): string {
  return status ? `“${humanizeStatus(status)}”` : 'none recorded';
}

export interface TraceHeadline {
  readonly label: string;
  readonly detail: string;
  readonly tone: AdminTone;
}

/**
 * What the two-sided lookup found, as a heading.
 *
 * `payment_only` is the one that is wrong on its own — a gateway order with no
 * booking to attach it to — and is the only presence that is a danger by itself.
 * `booking_only` is ordinary: most paid sessions have no `payments` document.
 */
export function describePresence(presence: PaymentPresence): TraceHeadline {
  switch (presence) {
    case 'both':
      return {
        label: 'Both records found',
        detail: 'A gateway document and a booking. The lines below are where they agree or do not.',
        tone: 'neutral',
      };
    case 'payment_only':
      return {
        label: 'Gateway order with no booking',
        detail:
          'A payment document exists with no booking attached. Money may have moved with nothing to sit against — this needs a person.',
        tone: 'danger',
      };
    case 'booking_only':
      return {
        label: 'Booking found, no gateway document',
        detail:
          'The booking is the record of payment. A link, mock or pre-gateway payment leaves no document in the payments collection, so this is expected.',
        tone: 'info',
      };
    case 'neither':
      return {
        label: 'Nothing matched',
        detail: 'No payment document and no booking were found for that id.',
        tone: 'neutral',
      };
  }
}

export interface CaptureLine {
  readonly label: string;
  readonly detail: string;
  readonly tone: AdminTone;
}

/**
 * The first question a trace answers: was the money taken? The verdict's source is
 * always named, so "captured" is never a silent guess — an operator can see it was
 * read from the booking (authoritative) rather than the gateway document.
 */
export function describeCapture(capture: PaymentCaptureReading): CaptureLine {
  const from =
    capture.source === 'booking'
      ? 'Read from the booking, which is the record of payment.'
      : capture.source === 'payment'
        ? 'Read from the gateway document; there is no booking to confirm it against.'
        : 'Neither a booking nor a gateway document was found to read this from.';

  if (capture.source === 'none') {
    return { label: 'No record of capture', detail: from, tone: capture.tone };
  }
  return {
    label: capture.captured ? 'Payment captured' : 'Not captured',
    detail: from,
    tone: capture.tone,
  };
}

export interface DiscrepancyLine {
  readonly tone: AdminTone;
  readonly text: string;
}

/**
 * One disagreement as a sentence, with its money in rupees and its statuses in
 * words. The tone is the reconciliation's, passed straight through.
 */
export function describeDiscrepancy(discrepancy: PaymentDiscrepancy): DiscrepancyLine {
  switch (discrepancy.kind) {
    case 'amount_mismatch':
      return {
        tone: discrepancy.tone,
        text: `Amounts differ: the gateway recorded ${rupees(discrepancy.paymentRupees)}, the booking records ${rupees(discrepancy.bookingRupees)}.`,
      };
    case 'status_mismatch':
      return {
        tone: discrepancy.tone,
        text: `Capture disagrees: the gateway status is ${statusWord(discrepancy.paymentStatus)} and the booking is ${statusWord(discrepancy.bookingStatus)} — one reads as captured and the other does not.`,
      };
    case 'payment_id_mismatch':
      return {
        tone: discrepancy.tone,
        text: `Payment id differs: ${discrepancy.onPayment} on the gateway document, ${discrepancy.onBooking} on the booking.`,
      };
    case 'order_id_mismatch':
      return {
        tone: discrepancy.tone,
        text: `Order id differs: ${discrepancy.onPayment} on the gateway document, ${discrepancy.onBooking} on the booking.`,
      };
    case 'payment_without_booking':
      return {
        tone: discrepancy.tone,
        text: 'This gateway order has no booking attached. Money may have moved with nothing to sit against.',
      };
    case 'paid_without_payment_doc':
      return {
        tone: discrepancy.tone,
        text: 'The booking is paid with no gateway document — expected for a link, mock or pre-gateway payment.',
      };
  }
}

export interface ReceiptLine {
  readonly available: boolean;
  readonly text: string;
}

/**
 * The receipt line. A receipt exists only for a captured booking, so an unpaid or
 * orphaned record says so plainly rather than showing a number that would imply
 * one was issued.
 */
export function describeReceipt(receipt: PaymentTrace['receipt']): ReceiptLine {
  if (receipt.available && receipt.number) {
    return { available: true, text: `Receipt ${receipt.number}` };
  }
  return {
    available: false,
    text: 'No receipt. One exists only for a captured booking.',
  };
}

/**
 * A refund's standing on the booking, or `null` when there is none. The money a
 * refund moved lives in the Refunds section, not here; this is only a pointer that
 * one exists so the trace does not read as a clean single payment when it is not.
 */
export function describeRefund(refund: PaymentTrace['refund']): string | null {
  if (!refund.present) return null;
  const status = refund.status ? humanizeStatus(refund.status) : 'recorded';
  return refund.reference
    ? `Refund ${status} (${refund.reference}). See Refunds for the amount and standing.`
    : `Refund ${status}. See Refunds for the amount and standing.`;
}
