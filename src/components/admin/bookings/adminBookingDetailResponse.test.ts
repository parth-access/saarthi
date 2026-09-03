import { describe, it, expect } from 'vitest';
import {
  BOOKINGS_ACCESS_ERROR,
  BOOKING_NOT_FOUND_ERROR,
  GENERIC_BOOKINGS_ERROR,
  describeTimelineGaps,
  interpretAdminBookingDetailResponse,
} from './adminBookingDetailResponse';

/**
 * The detail screen's two ways of misleading an operator: telling them a booking
 * is missing when the read failed (or the reverse), and rendering a partial
 * booking as though it were the whole state of it.
 */

const DETAIL = {
  id: 'bk_1',
  status: 'confirmed',
  statusGroup: 'confirmed',
  paymentStatus: 'paid',
  paymentGroup: 'paid',
  client: { name: 'Ananya', email: 'a@example.com', phone: '', userId: null, gender: null, age: null, hasNote: false },
  session: { therapistId: 'th_1', date: '2026-09-10', time: '09:00', utcDateTime: null, sessionType: 'Individual', sessionMode: null },
  payment: { amountRupees: 1500, currency: 'INR', razorpayOrderId: null, razorpayPaymentId: null, verifiedAtIso: null, isMockPayment: false },
  refund: { status: null, id: null, amountPaise: null, atIso: null },
  meeting: { url: null, calendarEventId: null, calendarStatus: null, calendarError: null, calendarCreatedAtIso: null },
  notifications: { emailStatus: null, emailAttempts: null, lastEmailError: null, reminderStatus: null, reminderSentAtIso: null, reminderError: null },
  outcome: { reason: null, customNote: null, declinedAtIso: null, declinedBy: null, noShowReason: null, reviewRating: null, reviewComment: null },
  reschedule: { originalDate: null, originalTime: null, lastAtIso: null, history: [] },
  access: { hasManageToken: false, manageTokenInvalidated: false, holdExpiresAtIso: null },
  createdAtIso: '2026-09-01T10:15:00.000Z',
  updatedAtIso: null,
};

const TIMELINE = { entries: [], gaps: [], truncated: false };

const ACTIONS = [
  { action: 'confirm', allowed: false, reason: 'Already confirmed.' },
  { action: 'cancel', allowed: true, reason: '' },
];

function ok(overrides: Record<string, unknown> = {}) {
  return { success: true, booking: DETAIL, timeline: TIMELINE, actions: ACTIONS, ...overrides };
}

describe('interpretAdminBookingDetailResponse', () => {
  it('accepts a well-formed detail response', () => {
    const result = interpretAdminBookingDetailResponse(200, ok());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.booking.id).toBe('bk_1');
    expect(result.payload.actions).toHaveLength(2);
    expect(result.payload.timeline.truncated).toBe(false);
  });

  it('distinguishes a booking that does not exist from a read that failed', () => {
    // These call for opposite actions from an operator — check the id you
    // followed, versus try again — so they cannot collapse into one message.
    const missing = interpretAdminBookingDetailResponse(404, {
      success: false,
      error: 'No booking exists with that id.',
    });
    expect(missing).toEqual({ ok: false, notFound: true, error: BOOKING_NOT_FOUND_ERROR });

    const failed = interpretAdminBookingDetailResponse(500, {
      success: false,
      error: GENERIC_BOOKINGS_ERROR,
    });
    expect(failed).toEqual({ ok: false, notFound: false, error: GENERIC_BOOKINGS_ERROR });
  });

  it('still reports notFound when a 404 carries no usable message', () => {
    expect(interpretAdminBookingDetailResponse(404, null)).toEqual({
      ok: false,
      notFound: true,
      error: BOOKING_NOT_FOUND_ERROR,
    });
  });

  it('shows a 400 in the words the route used', () => {
    // The route explains what was wrong with the id. Generic copy would leave an
    // operator retrying the same broken link.
    expect(
      interpretAdminBookingDetailResponse(400, {
        success: false,
        error: 'That is not a valid booking id.',
      })
    ).toEqual({ ok: false, notFound: false, error: 'That is not a valid booking id.' });
  });

  it('says an authorization failure is an authorization failure', () => {
    for (const status of [401, 403]) {
      expect(interpretAdminBookingDetailResponse(status, { error: 'Forbidden' }), String(status)).toEqual(
        { ok: false, notFound: false, error: BOOKINGS_ACCESS_ERROR }
      );
    }
  });

  it('treats a 200 that says it failed as a failure', () => {
    expect(interpretAdminBookingDetailResponse(200, { success: false, error: 'Nope' })).toEqual({
      ok: false,
      notFound: false,
      error: 'Nope',
    });
  });

  it('refuses a booking missing any group the screen reads unconditionally', () => {
    // Half a detail view is worse than none: an operator would act on a booking
    // whose payment or refund state simply is not on screen.
    for (const group of [
      'client',
      'session',
      'payment',
      'refund',
      'meeting',
      'notifications',
      'outcome',
      'reschedule',
      'access',
    ]) {
      const booking = { ...DETAIL, [group]: undefined };
      const result = interpretAdminBookingDetailResponse(200, ok({ booking }));
      expect(result, group).toEqual({ ok: false, notFound: false, error: GENERIC_BOOKINGS_ERROR });
    }
  });

  it('refuses a body that is not this endpoint at all', () => {
    for (const body of [
      null,
      'Bad Gateway',
      {},
      ok({ booking: undefined }),
      ok({ booking: { id: 'bk_1' } }),
      ok({ timeline: undefined }),
      ok({ timeline: { entries: [] } }),
      ok({ timeline: { entries: 'no', gaps: [], truncated: false } }),
      ok({ actions: undefined }),
      ok({ actions: 'no' }),
      ok({ actions: [{ action: 'confirm' }] }),
      ok({ actions: [{ action: 'confirm', allowed: 'yes', reason: '' }] }),
    ]) {
      const result = interpretAdminBookingDetailResponse(200, body);
      expect(result, JSON.stringify(body)).toEqual({
        ok: false,
        notFound: false,
        error: GENERIC_BOOKINGS_ERROR,
      });
    }
  });

  it('accepts an action verdict with an empty reason, which is what allowed looks like', () => {
    const result = interpretAdminBookingDetailResponse(
      200,
      ok({ actions: [{ action: 'cancel', allowed: true, reason: '' }] })
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a response with no actions at all rather than calling it malformed', () => {
    // A booking in a state that permits nothing is a real answer, not a broken one.
    const result = interpretAdminBookingDetailResponse(200, ok({ actions: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.actions).toEqual([]);
  });

  it('never returns an empty error string, which would render as a blank alert', () => {
    for (const body of [{ success: false, error: '' }, { success: false, error: '  ' }]) {
      expect(interpretAdminBookingDetailResponse(500, body)).toEqual({
        ok: false,
        notFound: false,
        error: GENERIC_BOOKINGS_ERROR,
      });
    }
  });
});

describe('describeTimelineGaps', () => {
  it('says nothing when the history is complete', () => {
    // A "history loaded fine" banner would be noise on every booking.
    expect(describeTimelineGaps({ entries: [], gaps: [], truncated: false })).toBeNull();
  });

  it('names which half of the history is missing', () => {
    const bookingGap = describeTimelineGaps({ entries: [], gaps: ['booking'], truncated: false });
    expect(bookingGap).toContain('Status and reschedule history');

    const systemGap = describeTimelineGaps({ entries: [], gaps: ['system'], truncated: false });
    expect(systemGap).toContain('Payment, slot and refund history');
  });

  it('says no history at all when both reads failed', () => {
    // Without this, four remaining events read as the complete history.
    const both = describeTimelineGaps({ entries: [], gaps: ['booking', 'system'], truncated: false });
    expect(both).toBe('No history could be read for this booking.');
  });

  it('warns that a truncated trail may not be the most recent events', () => {
    // The queries carry no orderBy, so the set returned is bounded but arbitrary.
    // Claiming these are "the latest 200" would be a fabrication.
    const note = describeTimelineGaps({ entries: [], gaps: [], truncated: true });
    expect(note).toContain('may not be the most recent');
  });

  it('states a gap and a truncation together when both apply', () => {
    const note = describeTimelineGaps({ entries: [], gaps: ['system'], truncated: true });
    expect(note).toContain('Payment, slot and refund history');
    expect(note).toContain('may not be the most recent');
  });
});
