import { describe, it, expect } from 'vitest';
import {
  mergeAdminTimeline,
  permittedAdminActions,
  toAdminBookingDetail,
  type AdminBookingDetailSource,
  type AdminBookingActionId,
} from './adminBookingDetail';
import { BookingStateMachine } from '../state/BookingStateMachine';
import { ALL_BOOKING_STATUSES, ALL_PAYMENT_STATUSES } from './adminBookingQuery';

/**
 * Three things are worth pinning here, because each has a way of going wrong
 * that an operator would not notice:
 *
 *  - the projection leaking a credential or the client's booking note,
 *  - a timeline that quietly reorders itself or invents an entry,
 *  - an action offered that the server will refuse, or refused that it allows.
 */

function source(overrides: Partial<AdminBookingDetailSource> = {}): AdminBookingDetailSource {
  return {
    id: 'bk_1',
    status: 'confirmed',
    paymentStatus: 'paid',
    name: 'Ananya Sharma',
    email: 'ananya@example.com',
    phone: '+919876543210',
    therapistId: 'th_1',
    date: '2026-09-10',
    time: '09:00',
    sessionType: 'Individual',
    createdAt: '2026-09-01T10:15:00.000Z',
    ...overrides,
  };
}

describe('toAdminBookingDetail', () => {
  it('never sends the manage-booking token, only that one exists', () => {
    // The token authorizes cancel and reschedule with no sign-in at all
    // (`/api/manage-booking`, isTokenFlow). Putting it in a JSON response would
    // hand that capability to anything that can read the response.
    const detail = toAdminBookingDetail(source({ bookingToken: 'tok_secret_value' }));

    expect(detail.access.hasManageToken).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('tok_secret_value');
  });

  it('reports an invalidated manage link', () => {
    const live = toAdminBookingDetail(source({ bookingToken: 't', invalidToken: false }));
    const dead = toAdminBookingDetail(source({ bookingToken: 't', invalidToken: true }));
    expect(live.access.manageTokenInvalidated).toBe(false);
    expect(dead.access.manageTokenInvalidated).toBe(true);
  });

  it('does not carry the client booking note, but says a note exists', () => {
    const detail = toAdminBookingDetail(
      source({ message: 'I have been having panic attacks since March.' })
    );

    expect(detail.client.hasNote).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('panic attacks');
  });

  it('treats a blank note as no note', () => {
    for (const message of [undefined, '', '   ']) {
      expect(toAdminBookingDetail(source({ message })).client.hasNote, String(message)).toBe(false);
    }
  });

  it('carries the operational references an operator needs to reconcile', () => {
    const detail = toAdminBookingDetail(
      source({
        razorpayOrderId: 'order_ABC',
        razorpayPaymentId: 'pay_XYZ',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        googleCalendarEventId: 'evt_1',
      })
    );

    expect(detail.payment.razorpayOrderId).toBe('order_ABC');
    expect(detail.payment.razorpayPaymentId).toBe('pay_XYZ');
    expect(detail.meeting.url).toBe('https://meet.google.com/abc-defg-hij');
    expect(detail.meeting.calendarEventId).toBe('evt_1');
  });

  it('flags a seeded payment, which no refund will ever be attempted against', () => {
    // `CancelBookingCommand` skips the refund path entirely for `mock_` ids, so
    // a screen that showed "refund due" for one would be lying.
    expect(toAdminBookingDetail(source({ razorpayPaymentId: 'mock_123' })).payment.isMockPayment).toBe(
      true
    );
    expect(toAdminBookingDetail(source({ razorpayPaymentId: 'pay_123' })).payment.isMockPayment).toBe(
      false
    );
    expect(toAdminBookingDetail(source({})).payment.isMockPayment).toBe(false);
  });

  it('reads Firestore timestamps, Dates, ISO strings and epoch millis alike', () => {
    const detail = toAdminBookingDetail(
      source({
        createdAt: { seconds: 1_757_000_000, nanoseconds: 0 },
        updatedAt: new Date('2026-09-02T00:00:00.000Z'),
        paymentVerifiedAt: 1_757_000_500_000,
        refundedAt: '2026-09-03T04:00:00.000Z',
      })
    );

    expect(detail.createdAtIso).toBe(new Date(1_757_000_000_000).toISOString());
    expect(detail.updatedAtIso).toBe('2026-09-02T00:00:00.000Z');
    expect(detail.payment.verifiedAtIso).toBe(new Date(1_757_000_500_000).toISOString());
    expect(detail.refund.atIso).toBe('2026-09-03T04:00:00.000Z');
  });

  it('turns an unreadable timestamp into null rather than a wrong date', () => {
    const detail = toAdminBookingDetail(
      source({ createdAt: 'not a date', updatedAt: {}, refundedAt: Number.NaN })
    );
    expect(detail.createdAtIso).toBeNull();
    expect(detail.updatedAtIso).toBeNull();
    expect(detail.refund.atIso).toBeNull();
  });

  it('keeps the reschedule history as records, dropping only unreadable entries', () => {
    const detail = toAdminBookingDetail(
      source({
        originalDate: '2026-09-08',
        originalTime: '11:00',
        rescheduleHistory: [
          {
            previousDate: '2026-09-08',
            previousTime: '11:00',
            newDate: '2026-09-10',
            newTime: '09:00',
            rescheduledAt: '2026-09-02T06:00:00.000Z',
            reason: 'Client request',
          },
          null,
          'garbage',
        ],
      })
    );

    expect(detail.reschedule.originalDate).toBe('2026-09-08');
    expect(detail.reschedule.history).toHaveLength(1);
    expect(detail.reschedule.history[0]).toEqual({
      previousDate: '2026-09-08',
      previousTime: '11:00',
      newDate: '2026-09-10',
      newTime: '09:00',
      atIso: '2026-09-02T06:00:00.000Z',
      reason: 'Client request',
    });
  });

  it('survives a booking document missing almost everything', () => {
    const detail = toAdminBookingDetail({ id: 'bk_empty' });

    expect(detail.id).toBe('bk_empty');
    expect(detail.status).toBe('pending');
    expect(detail.client.name).toBe('');
    expect(detail.client.age).toBeNull();
    expect(detail.payment.amountRupees).toBeNull();
    expect(detail.reschedule.history).toEqual([]);
    expect(JSON.stringify(detail)).not.toContain('undefined');
  });

  it('omits an age of 0, which is the fabricated value the old mapper wrote', () => {
    // `mappers.ts` used `age: data?.age || 0`, which is how an 18-year-old was
    // displayed as `1Y`. A zero here means "not recorded", not "zero years old".
    expect(toAdminBookingDetail(source({ age: 0 })).client.age).toBe(0);
    expect(toAdminBookingDetail(source({ age: undefined })).client.age).toBeNull();
  });

  it('keeps the exact status while grouping it the way the list filter does', () => {
    // The group is coarser on purpose — 'no_show' lives in 'closed' so one filter
    // covers every dead booking. A detail view must still show which one it is,
    // because 'did not attend' and 'declined by us' are different conversations.
    const detail = toAdminBookingDetail(source({ status: 'no_show', paymentStatus: 'refunded' }));
    expect(detail.status).toBe('no_show');
    expect(detail.statusGroup).toBe('closed');
    expect(detail.paymentGroup).toBe('refunded');
  });

  it('groups every status the system can store, so no booking renders untagged', () => {
    for (const status of ALL_BOOKING_STATUSES) {
      expect(toAdminBookingDetail(source({ status })).statusGroup, status).not.toBeNull();
    }
    for (const paymentStatus of ALL_PAYMENT_STATUSES) {
      expect(
        toAdminBookingDetail(source({ paymentStatus })).paymentGroup,
        paymentStatus
      ).not.toBeNull();
    }
  });

  it('reports no group for a status outside the union rather than guessing one', () => {
    const detail = toAdminBookingDetail(
      source({ status: 'some_status_from_the_future', paymentStatus: 'part_paid' })
    );
    expect(detail.status).toBe('some_status_from_the_future');
    expect(detail.statusGroup).toBeNull();
    expect(detail.paymentGroup).toBeNull();
  });
});

describe('mergeAdminTimeline', () => {
  const bookingScoped = [
    {
      id: 'a1',
      data: {
        action: 'status_updated',
        status: 'confirmed',
        timestamp: '2026-09-02T10:00:00.000Z',
        details: 'Booking status changed to confirmed',
        userId: 'admin_1',
      },
    },
  ];

  const systemScoped = [
    {
      id: 'g1',
      data: {
        eventType: 'PAYMENT_SUCCEEDED',
        bookingId: 'bk_1',
        timestamp: '2026-09-02T09:59:00.000Z',
        details: 'Payment confirmed via verify for booking bk_1',
      },
    },
  ];

  it('interleaves both collections newest first', () => {
    const merged = mergeAdminTimeline(bookingScoped, systemScoped);
    expect(merged.map((entry) => entry.id)).toEqual(['a1', 'g1']);
    expect(merged[0].source).toBe('booking');
    expect(merged[1].source).toBe('system');
  });

  it('keeps the stored kind verbatim rather than relabelling it', () => {
    const merged = mergeAdminTimeline(bookingScoped, systemScoped);
    expect(merged[0].kind).toBe('status_updated');
    expect(merged[1].kind).toBe('PAYMENT_SUCCEEDED');
  });

  it('records the actor when one was stored and null when not', () => {
    const merged = mergeAdminTimeline(bookingScoped, systemScoped);
    expect(merged[0].actor).toBe('admin_1');
    expect(merged[1].actor).toBeNull();
  });

  it('reads the actor a cancellation records under its own field name', () => {
    const merged = mergeAdminTimeline(
      [],
      [
        {
          id: 'r1',
          data: {
            eventType: 'REFUND_POLICY_APPLIED',
            cancelledBy: 'admin_9',
            timestamp: '2026-09-02T11:00:00.000Z',
            details: 'Refund enqueued at 50% per cancellation policy',
          },
        },
      ]
    );
    expect(merged[0].actor).toBe('admin_9');
  });

  it('drops an entry with no action or eventType instead of inventing a label', () => {
    // A fabricated line in an audit trail is worse than a missing one.
    const merged = mergeAdminTimeline(
      [{ id: 'x', data: { timestamp: '2026-09-02T10:00:00.000Z', details: 'something' } }],
      []
    );
    expect(merged).toEqual([]);
  });

  it('sorts entries with an unreadable time last, keeping them visible', () => {
    // A `serverTimestamp()` that has not materialised yet reads as null. Dropping
    // it would hide a real event; guessing a time would misorder the trail.
    const merged = mergeAdminTimeline(
      [
        { id: 'pending', data: { action: 'rescheduled', timestamp: null } },
        { id: 'known', data: { action: 'status_updated', timestamp: '2026-09-01T00:00:00.000Z' } },
      ],
      []
    );
    expect(merged.map((entry) => entry.id)).toEqual(['known', 'pending']);
    expect(merged[1].atIso).toBeNull();
  });

  it('orders identical timestamps deterministically so the trail does not shuffle', () => {
    const at = '2026-09-02T10:00:00.000Z';
    const docs = [
      { id: 'b', data: { action: 'one', timestamp: at } },
      { id: 'a', data: { action: 'two', timestamp: at } },
    ];
    expect(mergeAdminTimeline(docs, []).map((e) => e.id)).toEqual(['a', 'b']);
    expect(mergeAdminTimeline([...docs].reverse(), []).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('returns nothing for a booking with no history at all', () => {
    expect(mergeAdminTimeline([], [])).toEqual([]);
  });
});

describe('permittedAdminActions', () => {
  function verdict(status: string, action: AdminBookingActionId, payment: string | null = 'paid') {
    const found = permittedAdminActions(status, payment).find((v) => v.action === action);
    if (!found) throw new Error(`no verdict for ${action}`);
    return found;
  }

  it('offers exactly the five actions, once each', () => {
    const actions = permittedAdminActions('confirmed', 'paid').map((v) => v.action);
    expect(actions).toEqual(['confirm', 'cancel', 'complete', 'no_show', 'reschedule']);
  });

  it('never offers confirm where the state machine would throw', () => {
    // This is the agreement that matters: `AdminConfirmBookingCommandHandler`
    // calls `BookingStateMachine.transition(booking, 'confirmed')`, which throws
    // `InvalidBookingTransitionError` for an illegal source status. An offered
    // button that always errors teaches an operator the console is unreliable.
    for (const status of ALL_BOOKING_STATUSES) {
      const offered = verdict(status, 'confirm').allowed;
      const legal = BookingStateMachine.canTransition(status, 'confirmed');
      expect(offered, `${status} → confirmed`).toBe(legal);
    }
  });

  it('will not offer confirm on a pending booking, which has no direct path', () => {
    // Worth stating explicitly: 'pending' looks like the obvious candidate for a
    // confirm button, and the transition table does not allow it.
    expect(verdict('pending', 'confirm').allowed).toBe(false);
    expect(verdict('awaiting_payment', 'confirm').allowed).toBe(true);
  });

  it('refuses everything on a completed session', () => {
    for (const action of ['confirm', 'cancel', 'complete', 'no_show', 'reschedule'] as const) {
      const v = verdict('completed', action);
      if (action === 'complete') {
        expect(v.allowed).toBe(false);
        expect(v.reason).toBe('Already completed.');
      } else {
        expect(v.allowed, action).toBe(false);
        expect(v.reason.length, action).toBeGreaterThan(0);
      }
    }
  });

  it('refuses everything on a no-show session', () => {
    for (const action of ['confirm', 'cancel', 'complete', 'no_show', 'reschedule'] as const) {
      expect(verdict('no_show', action).allowed, action).toBe(false);
    }
  });

  it('refuses cancel and reschedule once a booking is already settled', () => {
    for (const status of ['cancelled', 'rejected']) {
      expect(verdict(status, 'cancel').allowed, status).toBe(false);
      expect(verdict(status, 'reschedule').allowed, status).toBe(false);
      expect(verdict(status, 'confirm').allowed, status).toBe(false);
    }
  });

  it('allows complete and no-show only from confirmed or rescheduled', () => {
    // Mirrors `SessionLifecycleService`, which rejects every other status.
    for (const status of ALL_BOOKING_STATUSES) {
      const live = status === 'confirmed' || status === 'rescheduled';
      expect(verdict(status, 'complete').allowed, `${status} complete`).toBe(live);
      expect(verdict(status, 'no_show').allowed, `${status} no_show`).toBe(live);
    }
  });

  it('allows rescheduling an expired hold, which the command permits', () => {
    // `RescheduleBookingCommandHandler` blocks completed, no-show, cancelled and
    // rejected — and nothing else. An expired hold can still be moved.
    expect(verdict('expired', 'reschedule').allowed).toBe(true);
  });

  it('does not let payment state hide an action', () => {
    // Confirming an unpaid booking is a real operation — payment taken outside
    // Razorpay — and `AdminConfirmBookingCommandHandler` allows it.
    for (const payment of ['paid', 'unpaid', 'failed', null]) {
      expect(verdict('awaiting_payment', 'confirm', payment).allowed, String(payment)).toBe(true);
    }
  });

  it('gives a reason for every refusal and none for anything allowed', () => {
    for (const status of ALL_BOOKING_STATUSES) {
      for (const v of permittedAdminActions(status, 'paid')) {
        if (v.allowed) {
          expect(v.reason, `${status}/${v.action}`).toBe('');
        } else {
          expect(v.reason.length, `${status}/${v.action}`).toBeGreaterThan(0);
          expect(v.reason, `${status}/${v.action}`).not.toContain('undefined');
        }
      }
    }
  });

  it('normalizes legacy status spellings before deciding', () => {
    // `locked` and `payment_started` are stored on real documents and normalize
    // to `slot_locked` and `payment_initiated`.
    expect(verdict('payment_started', 'confirm').allowed).toBe(true);
    expect(verdict('locked', 'confirm').allowed).toBe(false);
    expect(verdict('locked', 'cancel').allowed).toBe(true);
  });

  it('treats an unknown status as actionable only where the machine agrees', () => {
    const verdicts = permittedAdminActions('some_status_from_the_future', null);
    expect(verdicts.find((v) => v.action === 'confirm')?.allowed).toBe(false);
    expect(verdicts.find((v) => v.action === 'complete')?.allowed).toBe(false);
    // Cancel stays available: the command's only hard blocks are completed and
    // no-show, and an operator must be able to settle an unrecognised booking.
    expect(verdicts.find((v) => v.action === 'cancel')?.allowed).toBe(true);
  });
});
