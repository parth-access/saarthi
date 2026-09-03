import { describe, it, expect } from 'vitest';
import {
  formatRefundAmount,
  formatTimelineKind,
  formatTimelineMoment,
  holdSummary,
  manageLinkSummary,
  timelineSourceLabel,
} from './adminBookingDetailPresentation';

/**
 * The detail screen's display traps. Each test below is a thing that would render
 * as a plausible sentence while being wrong.
 */

describe('formatRefundAmount', () => {
  it('reads the stored value as paise, not rupees', () => {
    // The whole reason this function exists. `RefundService` writes
    // `refundAmount` in paise while `paymentAmount` is stored in rupees, so a
    // ₹750 refund is stored as 75000. Through `formatAmount` it would render as
    // ₹75,000 — a hundredfold overstatement that looks entirely believable.
    expect(formatRefundAmount(75000)).toBe('₹750');
    expect(formatRefundAmount(150000)).toBe('₹1,500');
  });

  it('shows a part-rupee refund to the paisa instead of rounding it away', () => {
    // A refund is `floor(capturedPaise × percent / 100)`, so 50% of ₹1,499 is
    // 74950 paise. Rounding to ₹750 would hide the exact figure an operator has
    // to reconcile against Razorpay.
    expect(formatRefundAmount(74950)).toBe('₹749.50');
    expect(formatRefundAmount(1)).toBe('₹0.01');
  });

  it('says nothing rather than ₹0 when no refund is stored', () => {
    // `₹0` is a claim that a refund was processed for nothing.
    expect(formatRefundAmount(null)).toBe('—');
  });

  it('renders a zero-paise refund as ₹0, which is a real stored value', () => {
    // Distinct from null: a 0% refund band genuinely writes 0.
    expect(formatRefundAmount(0)).toBe('₹0');
  });
});

describe('formatTimelineKind', () => {
  it('turns the stored event kinds into readable labels', () => {
    expect(formatTimelineKind('PAYMENT_SUCCEEDED')).toBe('Payment succeeded');
    expect(formatTimelineKind('status_updated')).toBe('Status updated');
    expect(formatTimelineKind('SLOT_RESERVED')).toBe('Slot reserved');
  });

  it('shows an unrecognised kind rather than replacing it with "Unknown event"', () => {
    // The stored string is the only clue an operator has about an event written
    // by a path this build does not know about. Relabelling it destroys that.
    expect(formatTimelineKind('QUANTUM_FLUX_APPLIED')).toBe('Quantum flux applied');
  });
});

describe('timelineSourceLabel', () => {
  it('names where an entry was recorded', () => {
    expect(timelineSourceLabel('booking')).toBe('Booking record');
    expect(timelineSourceLabel('system')).toBe('System log');
  });
});

describe('formatTimelineMoment', () => {
  it('states an entry time in IST', () => {
    // 10:15 UTC is 15:45 IST. An audit trail rendered in the operator's own zone
    // would disagree with every session time on the same screen.
    expect(formatTimelineMoment('2026-09-01T10:15:00.000Z')).toBe('1 Sep 2026, 15:45');
  });

  it('says the time is not recorded rather than borrowing the entry above it', () => {
    // A `serverTimestamp()` that has not materialised reads as null. Hiding the
    // event or giving it a neighbour's time both misrepresent the history.
    expect(formatTimelineMoment(null)).toBe('Time not recorded');
  });
});

describe('holdSummary', () => {
  const now = Date.parse('2026-09-03T12:00:00.000Z');

  it('reports a hold that has not expired as still holding the slot', () => {
    const summary = holdSummary('2026-09-03T12:10:00.000Z', now);
    expect(summary.state).toBe('holding');
    expect(summary.detail).toContain('held until');
  });

  it('reports a lapsed hold as a fact about the slot, not the booking status', () => {
    // Nothing rewrites the booking when a hold expires, so an operator reading
    // `awaiting_payment` has no way to tell the slot is already free again.
    const summary = holdSummary('2026-09-03T11:59:00.000Z', now);
    expect(summary.state).toBe('lapsed');
    expect(summary.detail).toContain('no longer reserved');
  });

  it('treats the exact expiry instant as lapsed', () => {
    // The boundary decides whether an operator believes the slot is theirs to
    // confirm. `<=` matches how the reservation reads it.
    expect(holdSummary('2026-09-03T12:00:00.000Z', now).state).toBe('lapsed');
  });

  it('distinguishes no hold from an unreadable one', () => {
    expect(holdSummary(null, now)).toEqual({
      state: 'none',
      label: 'No hold recorded',
      detail: 'This booking has no slot-hold expiry stored.',
    });

    const unreadable = holdSummary('not a date', now);
    expect(unreadable.state).toBe('none');
    // Saying a stored value could not be read is not the same as saying there
    // isn't one; only the second is a reason to stop looking.
    expect(unreadable.label).toBe('Hold expiry unreadable');
  });
});

describe('manageLinkSummary', () => {
  it('states that a live link lets anyone act without signing in', () => {
    const text = manageLinkSummary({ hasManageToken: true, manageTokenInvalidated: false });
    expect(text).toContain('without signing in');
  });

  it('does not describe an invalidated link as live', () => {
    // Inverting this tells an operator a dead link still works, or that a live
    // credential is safely dead, right before they decide whether to reissue.
    const text = manageLinkSummary({ hasManageToken: true, manageTokenInvalidated: true });
    expect(text).toContain('no longer works');
  });

  it('distinguishes a never-issued link from an invalidated one', () => {
    const text = manageLinkSummary({ hasManageToken: false, manageTokenInvalidated: false });
    expect(text).toContain('was ever issued');
  });
});
