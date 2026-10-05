/**
 * The detail view's own display rules — the ones the list never needed.
 *
 * Badges, amounts in rupees, IST dates and session kind all come from
 * `adminBookingPresentation`, which the detail view now shares rather than
 * reimplementing. What is here is the handful of decisions that only exist on
 * this screen, and each one is here because getting it wrong is invisible:
 *
 *  - **the refund amount is stored in paise**, while `paymentAmount` is stored in
 *    rupees. Running a refund through `formatAmount` would show a ₹750 refund as
 *    ₹75,000 and read as perfectly plausible.
 *  - an audit entry with **no recorded time** must say so, not borrow the time of
 *    the entry above it.
 *  - a **lapsed hold** and a live one look identical unless the expiry is compared
 *    against a clock, and the difference decides whether the slot is still held.
 */
import type { AdminTimelineSource } from '@/domains/booking/queries/adminBookingDetail';
import { formatCreatedAt, humanizeStatus } from './adminBookingPresentation';

/**
 * `PAYMENT_SUCCEEDED` → `Payment succeeded`, `status_updated` → `Status updated`.
 *
 * An unrecognised kind is humanized the same way rather than replaced: the stored
 * value is the only clue an operator has about an event written by a path this
 * build does not know about, and "Unknown event" would throw that away.
 */
export function formatTimelineKind(kind: string): string {
  return humanizeStatus(kind);
}

/** Where an entry was recorded, in terms an operator can act on. */
export function timelineSourceLabel(source: AdminTimelineSource): string {
  return source === 'booking' ? 'Booking record' : 'System log';
}

/**
 * When an entry happened, in IST, or a statement that the time is not recorded.
 *
 * A `serverTimestamp()` that has not materialised yet reads as null here. Saying
 * so is the honest rendering; the alternatives are hiding a real event or giving
 * it a time it does not have.
 */
export function formatTimelineMoment(iso: string | null): string {
  return iso === null ? 'Time not recorded' : formatCreatedAt(iso);
}

/**
 * Paise → `₹750`. `RefundService` writes `refundAmount` in paise, computed as
 * `floor(capturedPaise × percent / 100)`.
 *
 * A fractional rupee is shown to two places rather than rounded away, because a
 * refund that does not reconcile against Razorpay to the paisa is exactly the
 * thing an operator is on this screen to notice.
 */
export function formatRefundAmount(amountPaise: number | null): string {
  if (amountPaise === null) return '—';
  const rupees = amountPaise / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export type HoldState = 'none' | 'holding' | 'lapsed';

export interface HoldSummary {
  readonly state: HoldState;
  readonly label: string;
  readonly detail: string;
}

/**
 * Whether an unpaid booking's slot is still held.
 *
 * `nowMs` is a parameter, not `Date.now()`, so the boundary is assertable and so
 * the server and browser renders of one page cannot disagree about it.
 *
 * A lapsed hold is stated as a fact about the slot, not as a booking status: the
 * booking document itself is untouched until something expires it, so an operator
 * reading `awaiting_payment` needs to be told separately that the slot behind it
 * is no longer reserved.
 */
export function holdSummary(holdExpiresAtIso: string | null, nowMs: number): HoldSummary {
  if (holdExpiresAtIso === null) {
    return {
      state: 'none',
      label: 'No hold recorded',
      detail: 'This booking has no slot-hold expiry stored.',
    };
  }
  const expiresMs = Date.parse(holdExpiresAtIso);
  if (!Number.isFinite(expiresMs)) {
    return {
      state: 'none',
      label: 'Hold expiry unreadable',
      detail: 'A hold expiry is stored but could not be read as a time.',
    };
  }
  const when = formatCreatedAt(holdExpiresAtIso);
  return expiresMs <= nowMs
    ? {
        state: 'lapsed',
        label: 'Hold lapsed',
        detail: `The slot hold expired at ${when} IST and the slot is no longer reserved.`,
      }
    : {
        state: 'holding',
        label: 'Slot held',
        detail: `The slot is held until ${when} IST.`,
      };
}

/**
 * What to say about the manage-booking link.
 *
 * The token itself is never sent to the browser — it authorizes cancel and
 * reschedule with no sign-in — so this describes a capability that exists without
 * handing it over. Getting the sense inverted would tell an operator a live link
 * is dead, or the reverse, right before they decide whether to reissue one.
 */
export function manageLinkSummary(access: {
  readonly hasManageToken: boolean;
  readonly manageTokenInvalidated: boolean;
}): string {
  if (!access.hasManageToken) {
    return 'No manage link was ever issued for this booking.';
  }
  return access.manageTokenInvalidated
    ? 'A manage link was issued and has been invalidated. It no longer works.'
    : 'A live manage link exists. Anyone holding it can reschedule or cancel without signing in.';
}
