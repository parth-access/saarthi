import { describe, it, expect } from 'vitest';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatAmount,
  formatCreatedAt,
  formatSessionDay,
  formatSessionDayLong,
  formatSessionKind,
  humanizeStatus,
  meetIndicator,
  paymentBadge,
  rowFlags,
  statusBadge,
  toneClasses,
} from './adminBookingPresentation';
import {
  ALL_BOOKING_STATUSES,
  ALL_PAYMENT_STATUSES,
  toAdminBookingRow,
  type AdminBookingRow,
} from '@/domains/booking/queries/adminBookingQuery';

/**
 * What a row *says*, asserted without a DOM.
 *
 * The load-bearing ones: no cell may ever render `Invalid Date`, `undefined`,
 * `NaN` or a bare `0` for a value that is simply absent; times are IST because
 * every stored session time is IST; and the Meet column only warns when a
 * confirmed session really is missing its link.
 */

function row(overrides: Partial<AdminBookingRow> = {}): AdminBookingRow {
  return {
    ...toAdminBookingRow({
      id: 'bk_20260903_ABCD1234',
      status: 'confirmed',
      paymentStatus: 'paid',
      name: 'Ananya Sharma',
      email: 'ananya@example.com',
      phone: '+91 98765 43210',
      therapistId: 'th_priya',
      date: '2026-09-10',
      time: '09:00',
      sessionType: 'Individual therapy',
      paymentAmount: 1500,
      paymentCurrency: 'INR',
      createdAt: '2026-09-01T10:15:00.000Z',
    }),
    ...overrides,
  };
}

describe('humanizeStatus', () => {
  it('turns a stored status into words', () => {
    expect(humanizeStatus('awaiting_payment')).toBe('Awaiting payment');
    expect(humanizeStatus('no_show')).toBe('No show');
    expect(humanizeStatus('pending_approval')).toBe('Pending approval');
  });

  it('passes an unrecognised value through instead of hiding it', () => {
    // The raw value is the operator's only clue about a document written by
    // something this build does not know about.
    expect(humanizeStatus('quantum_state')).toBe('Quantum state');
  });

  it('renders an absent value as a dash, never as empty', () => {
    for (const absent of [null, undefined, '', '   ', '_']) {
      expect(humanizeStatus(absent)).toBe('—');
    }
  });

  it('never returns a string containing undefined or NaN', () => {
    for (const status of [...ALL_BOOKING_STATUSES, ...ALL_PAYMENT_STATUSES]) {
      const label = humanizeStatus(status);
      expect(label, status).not.toMatch(/undefined|NaN|\[object/);
      expect(label.length, status).toBeGreaterThan(0);
    }
  });
});

describe('statusBadge', () => {
  it('labels the row with the exact stored status, not the filter group', () => {
    // `no_show` and `cancelled` share a group and call for different
    // conversations, so the row must not flatten them into one label.
    expect(statusBadge(row({ status: 'no_show' })).label).toBe('No show');
    expect(statusBadge(row({ status: 'cancelled' })).label).toBe('Cancelled');
  });

  it('takes its colour from the group the status belongs to', () => {
    expect(statusBadge(row({ status: 'confirmed' })).tone).toBe('success');
    expect(statusBadge(row({ status: 'rescheduled' })).tone).toBe('success');
    expect(statusBadge(row({ status: 'pending' })).tone).toBe('warning');
    expect(statusBadge(row({ status: 'cancelled' })).tone).toBe('danger');
    expect(statusBadge(row({ status: 'awaiting_payment' })).tone).toBe('info');
  });

  it('explains the group in the badge title', () => {
    expect(statusBadge(row({ status: 'pending' })).title).toContain('Awaiting approval');
    expect(statusBadge(row({ status: 'pending' })).title).toContain('not yet accepted');
  });

  it('says plainly when it cannot classify a stored status', () => {
    const badge = statusBadge(row({ status: 'quantum_state', statusGroup: null }));
    expect(badge.tone).toBe('neutral');
    expect(badge.title).toContain('not one this console knows about');
    expect(badge.title).toContain('quantum_state');
  });

  it('has a tone with real classes for every status the domain defines', () => {
    for (const status of ALL_BOOKING_STATUSES) {
      const badge = statusBadge(row({ status }));
      expect(toneClasses(badge.tone), status).toMatch(/bg-|text-/);
    }
  });
});

describe('paymentBadge', () => {
  it('is absent when no payment status is stored, rather than claiming unpaid', () => {
    expect(paymentBadge(row({ paymentStatus: null }))).toBeNull();
  });

  it('reads the stored value and colours it by group', () => {
    expect(paymentBadge(row({ paymentStatus: 'paid' }))).toMatchObject({
      label: 'Paid',
      tone: 'success',
    });
    expect(paymentBadge(row({ paymentStatus: 'failed' }))?.tone).toBe('danger');
    expect(paymentBadge(row({ paymentStatus: 'refunded' }))?.tone).toBe('info');
    expect(paymentBadge(row({ paymentStatus: 'unpaid' }))?.tone).toBe('warning');
  });

  it('flags a payment status it cannot classify', () => {
    expect(paymentBadge(row({ paymentStatus: 'partially_settled' }))?.title).toContain(
      'not one this console knows about'
    );
  });
});

describe('formatAmount', () => {
  it('formats rupees in Indian digit grouping', () => {
    expect(formatAmount(1500, 'INR')).toBe('₹1,500');
    expect(formatAmount(150000, 'INR')).toBe('₹1,50,000');
  });

  it('keeps paise only when there are any', () => {
    expect(formatAmount(1500.5, 'INR')).toBe('₹1,500.50');
    expect(formatAmount(1500, 'INR')).not.toContain('.');
  });

  it('shows a dash for an unset amount rather than ₹0', () => {
    // `₹0` would be a claim that the session is free.
    expect(formatAmount(null, 'INR')).toBe('—');
    expect(formatAmount(null, null)).toBe('—');
  });

  it('still prints a real zero when zero is what is stored', () => {
    expect(formatAmount(0, 'INR')).toBe('₹0');
  });

  it('assumes rupees when no currency is stored, since that is what the platform charges', () => {
    expect(formatAmount(1500, null)).toBe('₹1,500');
  });

  it('survives a currency code it cannot format', () => {
    const formatted = formatAmount(1500, 'NOT_A_CODE');
    expect(formatted).toContain('1,500');
    expect(formatted).not.toMatch(/undefined|NaN/);
  });
});

describe('dates and times', () => {
  it('formats a session day densely and in full', () => {
    expect(formatSessionDay('2026-09-10')).toBe('Thu 10 Sep');
    expect(formatSessionDayLong('2026-09-10')).toBe('Thu 10 Sep 2026');
  });

  it('states the creation time in IST, which is what every stored time means', () => {
    // 10:15 UTC is 15:45 IST. Showing the operator's local zone would put two
    // clocks in one table.
    expect(formatCreatedAt('2026-09-01T10:15:00.000Z')).toBe('1 Sep 2026, 15:45');
    expect(DISPLAY_TIME_ZONE_LABEL).toBe('IST');
  });

  it('rolls into the next IST day when UTC has not got there yet', () => {
    expect(formatCreatedAt('2026-09-01T19:30:00.000Z')).toBe('2 Sep 2026, 01:00');
  });

  it('pads a single-digit hour and minute', () => {
    expect(formatCreatedAt('2026-09-01T01:04:00.000Z')).toBe('1 Sep 2026, 06:34');
  });

  it('never renders Invalid Date', () => {
    for (const bad of [null, '', 'not a date', '2026-13-45T00:00:00Z']) {
      expect(formatCreatedAt(bad), String(bad)).toBe('—');
    }
  });

  it('shows a stored day it cannot parse as stored, rather than guessing', () => {
    // Displaying the raw value keeps a malformed document diagnosable.
    expect(formatSessionDay('3-9-2026')).toBe('3-9-2026');
    expect(formatSessionDay('2026-02-31')).toBe('2026-02-31');
    expect(formatSessionDay('')).toBe('—');
  });
});

describe('meetIndicator', () => {
  it('reports a link when one exists', () => {
    expect(meetIndicator(row({ hasMeetingLink: true })).presence).toBe('ready');
  });

  it('warns only when a confirmed session has no link', () => {
    // The client has paid and has nothing to join. That is the actionable case.
    const missing = meetIndicator(row({ status: 'confirmed', hasMeetingLink: false }));
    expect(missing.presence).toBe('missing');
    expect(missing.label).toBe('No link');
  });

  it('names the calendar status when one was recorded', () => {
    expect(
      meetIndicator(row({ status: 'confirmed', hasMeetingLink: false, calendarStatus: 'FAILED' }))
        .title
    ).toContain('FAILED');
    expect(
      meetIndicator(row({ status: 'confirmed', hasMeetingLink: false, calendarStatus: null })).title
    ).toContain('no calendar status');
  });

  it('stays quiet for a session that has no link by design', () => {
    // Flagging these would train an operator to ignore the column.
    for (const status of ['pending', 'awaiting_payment', 'cancelled', 'draft', 'completed']) {
      const indicator = meetIndicator(row({ status, hasMeetingLink: false }));
      expect(indicator.presence, status).toBe('not-applicable');
      expect(indicator.label, status).toBe('—');
    }
  });

  it('treats a rescheduled session as confirmed, because it is', () => {
    expect(meetIndicator(row({ status: 'rescheduled', hasMeetingLink: false })).presence).toBe(
      'missing'
    );
  });
});

describe('rowFlags', () => {
  it('shows nothing for an ordinary booking', () => {
    // There is no "looks fine" badge: a flag has to mean something.
    expect(rowFlags(row())).toEqual([]);
  });

  it('counts reschedules, singular and plural', () => {
    expect(rowFlags(row({ rescheduleCount: 1 }))[0].label).toBe('Rescheduled');
    expect(rowFlags(row({ rescheduleCount: 3 }))[0].label).toBe('Rescheduled ×3');
  });

  it('surfaces a refund status and reddens the failed ones', () => {
    expect(rowFlags(row({ refundStatus: 'processed' }))[0]).toMatchObject({
      label: 'Refund: Processed',
      tone: 'info',
    });
    expect(rowFlags(row({ refundStatus: 'failed' }))[0].tone).toBe('danger');
  });

  it('shows both flags when both apply', () => {
    expect(rowFlags(row({ rescheduleCount: 2, refundStatus: 'pending' }))).toHaveLength(2);
  });
});

describe('formatSessionKind', () => {
  it('joins what is stored and omits what is not', () => {
    expect(formatSessionKind(row({ sessionType: 'Individual therapy', sessionMode: 'video' }))).toBe(
      'Individual therapy · Video'
    );
    expect(formatSessionKind(row({ sessionType: 'Individual therapy', sessionMode: null }))).toBe(
      'Individual therapy'
    );
    expect(formatSessionKind(row({ sessionType: '', sessionMode: null }))).toBe('—');
  });
});
