import { describe, it, expect } from 'vitest';
import {
  ACTION_BUTTONS,
  ACTION_LABELS,
  ACTION_ORDER,
  ACTION_TONE,
  BookingActionFacts,
  actionFactsFrom,
  canSubmit,
  consequencesFor,
  previewCancel,
  reasonProblem,
  sessionStartMs,
} from './bookingActionCopy';
import type { AdminBookingDetail } from '@/domains/booking/queries/adminBookingDetail';

/**
 * What the confirmation dialog tells an operator before they commit.
 *
 * There is no component test in this project — no jsdom, no
 * `@testing-library/react` — so this file is the only thing standing between a
 * reworded sentence and an operator confidently telling a client something the
 * platform did not do. Two claims are load-bearing above all others:
 *
 *  - a cancelled paid booking sends the client **no email**, and the dialog must
 *    say so, because the operator's next task depends on it;
 *  - a refund *percent* is not a refund, and the dialog must not imply one when
 *    no capture exists to refund.
 *
 * Assertions therefore match on the meaning-carrying phrase rather than whole
 * sentences: rewording is fine, dropping the fact is not.
 */

/** A paid, confirmed session on 2026-09-20 at 14:30 IST — 09:00Z. */
const SESSION_START = Date.parse('2026-09-20T09:00:00.000Z');

const PAID: BookingActionFacts = {
  status: 'confirmed',
  paymentStatus: 'paid',
  razorpayPaymentId: 'pay_ABC123',
  isMockPayment: false,
  date: '2026-09-20',
  time: '14:30',
  utcDateTimeIso: '2026-09-20T09:00:00.000Z',
  hasMeetingLink: true,
};

const HOURS = 60 * 60 * 1000;

describe('the action bar', () => {
  it('offers exactly the five actions the endpoint implements', () => {
    expect([...ACTION_ORDER].sort()).toEqual(
      ['cancel', 'complete', 'confirm', 'no_show', 'reschedule'].sort()
    );
  });

  it('puts the irreversible action last and marks only it as dangerous', () => {
    // Cancel beside Confirm is the mis-click that cannot be taken back.
    expect(ACTION_ORDER[ACTION_ORDER.length - 1]).toBe('cancel');
    const dangerous = ACTION_ORDER.filter((a) => ACTION_TONE[a] === 'danger');
    expect(dangerous).toEqual(['cancel']);
  });

  it('labels every action, so no button can render blank', () => {
    for (const action of ACTION_ORDER) {
      expect(ACTION_LABELS[action]?.length, action).toBeGreaterThan(0);
      expect(ACTION_BUTTONS[action]?.length, action).toBeGreaterThan(0);
    }
  });
});

describe('resolving the session start', () => {
  it('prefers the stored instant, as the cancel command does', () => {
    // Matching the server matters: a different answer here quotes a refund percent
    // the server will disagree with.
    expect(sessionStartMs(PAID)).toBe(SESSION_START);
  });

  it('falls back to the IST date and time when no instant was stored', () => {
    expect(sessionStartMs({ ...PAID, utcDateTimeIso: null })).toBe(SESSION_START);
  });

  it('ignores an unparseable instant rather than returning NaN', () => {
    // A stored garbage string must not poison the refund preview into 0%; the IST
    // fields are still good.
    expect(sessionStartMs({ ...PAID, utcDateTimeIso: 'not a date' })).toBe(SESSION_START);
  });

  it('reports an unresolvable start as null', () => {
    expect(sessionStartMs({ ...PAID, utcDateTimeIso: null, date: '2026-02-30', time: '14:30' })).toBeNull();
  });
});

describe('predicting a cancellation', () => {
  describe('the decline branch', () => {
    for (const status of ['pending', 'pending_approval', 'awaiting_payment']) {
      it(`treats '${status}' as a decline, which does email the client`, () => {
        const preview = previewCancel({ ...PAID, status, paymentStatus: null }, SESSION_START - 72 * HOURS);
        expect(preview.branch).toBe('decline');
        expect(preview.emailsClient).toBe(true);
        expect(preview.refundPercent).toBeNull();
      });
    }
  });

  describe('the cancel branch', () => {
    it('never claims the client is emailed', () => {
      // `BookingCancelled` cancels the calendar event and skips the reminder. It
      // sends no Saarthi email. An operator who assumes otherwise leaves a client
      // who paid ₹1,500 with no word at all.
      const preview = previewCancel(PAID, SESSION_START - 72 * HOURS);
      expect(preview.branch).toBe('cancel');
      expect(preview.emailsClient).toBe(false);
    });

    it('quotes the same percent the policy will decide', () => {
      expect(previewCancel(PAID, SESSION_START - 72 * HOURS).refundPercent).toBe(100);
      expect(previewCancel(PAID, SESSION_START - 30 * HOURS).refundPercent).toBe(50);
      expect(previewCancel(PAID, SESSION_START - 2 * HOURS).refundPercent).toBe(0);
    });

    it('holds the boundaries exactly where the policy holds them', () => {
      // Inclusive of the higher tier, per `computeRefundPercent`. Being one tier
      // out here promises a client 100% and pays them 50%.
      expect(previewCancel(PAID, SESSION_START - 48 * HOURS).refundPercent).toBe(100);
      expect(previewCancel(PAID, SESSION_START - 48 * HOURS + 1).refundPercent).toBe(50);
      expect(previewCancel(PAID, SESSION_START - 24 * HOURS).refundPercent).toBe(50);
      expect(previewCancel(PAID, SESSION_START - 24 * HOURS + 1).refundPercent).toBe(0);
    });
  });

  describe('why no refund can apply', () => {
    it('names an unpaid booking', () => {
      const preview = previewCancel({ ...PAID, paymentStatus: 'pending' }, SESSION_START - 72 * HOURS);
      expect(preview.refundPercent).toBeNull();
      expect(preview.refundBlockedBecause).toContain('not marked paid');
    });

    it('names a missing capture, which the percent alone would hide', () => {
      // The exact trap: policy says 100%, the command enqueues nothing, because
      // there is no `razorpayPaymentId` to refund against.
      const preview = previewCancel({ ...PAID, razorpayPaymentId: null }, SESSION_START - 72 * HOURS);
      expect(preview.refundPercent).toBeNull();
      expect(preview.refundBlockedBecause).toContain('Razorpay payment id');
    });

    it('names a seeded test payment', () => {
      const preview = previewCancel(
        { ...PAID, razorpayPaymentId: 'mock_pay_1', isMockPayment: true },
        SESSION_START - 72 * HOURS
      );
      expect(preview.refundPercent).toBeNull();
      expect(preview.refundBlockedBecause).toContain('test payment');
    });

    it('distinguishes a data problem from a policy decision', () => {
      // The server fails safe to 0% on an unresolvable start. Printing a bare "0%"
      // would read as the 24-hour rule and send an operator to explain a policy
      // that did not apply.
      const preview = previewCancel(
        { ...PAID, utcDateTimeIso: null, date: '2026-02-30' },
        SESSION_START - 72 * HOURS
      );
      expect(preview.refundPercent).toBe(0);
      expect(preview.refundBlockedBecause).toContain('cannot be read');
    });
  });
});

describe('what an operator is told before committing', () => {
  const NOW = SESSION_START - 72 * HOURS;
  const text = (action: Parameters<typeof consequencesFor>[0], facts = PAID, now = NOW) =>
    consequencesFor(action, facts, now).lines.join(' ');

  it('gives every action a title, a button and at least one consequence', () => {
    for (const action of ACTION_ORDER) {
      const c = consequencesFor(action, PAID, NOW);
      expect(c.title.length, action).toBeGreaterThan(0);
      expect(c.confirmLabel.length, action).toBeGreaterThan(0);
      expect(c.lines.length, action).toBeGreaterThan(0);
    }
  });

  it('marks only cancellation irreversible', () => {
    const irreversible = ACTION_ORDER.filter((a) => consequencesFor(a, PAID, NOW).irreversible);
    expect(irreversible).toEqual(['cancel']);
  });

  describe('confirm', () => {
    it('does not promise the email is sent the instant you click', () => {
      // It comes from the calendar sync, once the Meet event exists. Promising it
      // immediately sends an operator hunting a delivery failure that is really a
      // calendar failure.
      expect(text('confirm')).toContain('calendar sync');
      expect(text('confirm')).toContain('Meet');
    });

    it('mentions the reminder that gets scheduled', () => {
      expect(text('confirm')).toContain('30 minutes');
    });
  });

  describe('reschedule', () => {
    it('promises the Meet link survives only when an event exists to patch', () => {
      expect(text('reschedule', { ...PAID, hasMeetingLink: true })).toContain('stays the same');

      const noEvent = text('reschedule', { ...PAID, hasMeetingLink: false });
      expect(noEvent).not.toContain('stays the same');
      // `updateCalendarEvent` falls back to creating the event, which mints a new
      // link. An operator who has already told the client "same link" has caused a
      // missed session.
      expect(noEvent).toContain('have not seen before');
    });

    it('warns about the restarted hold only for a booking that has neither paid nor confirmed', () => {
      // `RescheduleBookingCommand`: `isConfirmed = status === 'confirmed' || paymentStatus === 'paid'`.
      expect(text('reschedule', PAID)).toContain('no new payment hold');
      expect(text('reschedule', { ...PAID, status: 'confirmed', paymentStatus: 'pending' })).toContain(
        'no new payment hold'
      );
      expect(text('reschedule', { ...PAID, status: 'awaiting_payment', paymentStatus: 'pending' })).toContain(
        '10-minute payment hold restarts'
      );
    });
  });

  describe('complete and no-show', () => {
    for (const action of ['complete', 'no_show'] as const) {
      it(`says ${action} sends no email and enqueues no refund`, () => {
        // Both emit events only the timeline and audit listeners consume. An
        // operator who believes a no-show refunds anything is wrong, and the
        // client will be told wrongly.
        const body = text(action);
        expect(body).toContain('No email');
        expect(body).toContain('No refund');
      });

      it(`says ${action} closes the booking to further changes`, () => {
        expect(text(action)).toContain('cannot then be cancelled or rescheduled');
      });
    }
  });

  describe('cancel', () => {
    it('leads with the fact that the client is not told', () => {
      const c = consequencesFor('cancel', PAID, NOW);
      expect(c.tone).toBe('danger');
      // First line, because it is the one thing that changes what the operator does
      // next and the one thing nothing else on the screen says.
      expect(c.lines[0]).toContain('does not email the client');
    });

    it('calls a decline a decline, and says that one does email', () => {
      const c = consequencesFor('cancel', { ...PAID, status: 'pending', paymentStatus: null }, NOW);
      expect(c.title).toContain('Decline');
      expect(c.confirmLabel).toContain('Decline');
      expect(c.lines.join(' ')).toContain('emailed that it was declined');
    });

    it('says the refund is queued rather than paid', () => {
      const body = text('cancel');
      expect(body).toContain('100%');
      expect(body).toContain('Enqueued is not paid');
    });

    it('says the percent is re-decided on commit', () => {
      // A dialog left open across the 48-hour cutoff quoted a figure that is no
      // longer true, and the server, not this preview, decides.
      expect(text('cancel')).toContain('re-decides');
    });

    it('does not quote a percent when nothing can be refunded', () => {
      const body = text('cancel', { ...PAID, razorpayPaymentId: null });
      expect(body).toContain('Razorpay payment id');
      expect(body).not.toContain('% refund will be enqueued');
    });

    it('attributes a 0% outcome to the notice, not to a data problem', () => {
      const body = text('cancel', PAID, SESSION_START - 2 * HOURS);
      expect(body).toContain('under 24 hours');
      expect(body).not.toContain('% refund will be enqueued');
    });

    it('always says the slot is released', () => {
      // The next operational question after any cancellation, and the answer is not
      // visible anywhere else on the screen.
      for (const facts of [PAID, { ...PAID, status: 'pending', paymentStatus: null }]) {
        expect(consequencesFor('cancel', facts, NOW).lines.join(' ')).toContain('bookable again');
      }
    });
  });
});

describe('reading the projection', () => {
  it('maps the fields the refund gate actually reads', () => {
    // `razorpayPaymentId` and `isMockPayment` live under `payment`, not at the top
    // level; reading the wrong one produces a confident, wrong refund figure with
    // nothing on screen to contradict it.
    const detail = {
      status: 'confirmed',
      paymentStatus: 'paid',
      payment: { razorpayPaymentId: 'pay_ABC123', isMockPayment: false },
      session: { date: '2026-09-20', time: '14:30', utcDateTime: '2026-09-20T09:00:00.000Z' },
      meeting: { url: 'https://meet.google.com/abc-defg-hij' },
    } as unknown as AdminBookingDetail;

    expect(actionFactsFrom(detail)).toEqual(PAID);
  });

  it('reads an absent Meet URL as no link rather than as a link', () => {
    const detail = {
      status: 'pending',
      paymentStatus: null,
      payment: { razorpayPaymentId: null, isMockPayment: false },
      session: { date: '2026-09-20', time: '14:30', utcDateTime: null },
      meeting: { url: null },
    } as unknown as AdminBookingDetail;

    expect(actionFactsFrom(detail).hasMeetingLink).toBe(false);
  });
});

describe('gating the submit button', () => {
  it('mirrors the endpoint bar for a cancellation reason', () => {
    // The server's own `min(3)` after trim. A dialog that lets a blank through
    // spends a round trip to be told what it already knew.
    expect(reasonProblem('', true)).toContain('required');
    expect(reasonProblem('   ', true)).toContain('required');
    expect(reasonProblem('ab', true)).toContain('3 characters');
    expect(reasonProblem('  Therapist unwell  ', true)).toBeNull();
    expect(reasonProblem('x'.repeat(501), true)).toContain('501');
  });

  it('lets a no-show reason be absent but not junk', () => {
    expect(reasonProblem('', false)).toBeNull();
    expect(reasonProblem('x', false)).toContain('3 characters');
  });

  it('requires a reason to cancel and a slot to reschedule', () => {
    expect(canSubmit('cancel', { reason: '', slot: null })).toBe(false);
    expect(canSubmit('cancel', { reason: 'Therapist unwell', slot: null })).toBe(true);
    expect(canSubmit('reschedule', { reason: '', slot: null })).toBe(false);
    expect(canSubmit('reschedule', { reason: '', slot: '2026-09-21T10:00' })).toBe(true);
  });

  it('lets confirm and complete through with an empty draft', () => {
    for (const action of ['confirm', 'complete', 'no_show'] as const) {
      expect(canSubmit(action, { reason: '', slot: null }), action).toBe(true);
    }
  });
});
