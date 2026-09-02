import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore } from '@/shared/firestore/testing/fakeFirestore';
import { CancelBookingCommand, CancelBookingCommandHandler } from './CancelBookingCommand';
import { OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';

/**
 * The cancellation matrix, end to end against an in-memory Firestore that
 * enforces the rules the live one does (see `fakeFirestore.ts`).
 *
 * Two things this file is deliberately NOT: it does not mock the refund policy,
 * and it does not mock the transaction. `computeRefundPercent`,
 * `BookingDomainService`, `SlotReservationService`, `BookingMapper` and the outbox
 * writer all run for real, so a test asserting "no refund inside 24 hours" is
 * asserting the rule a client actually gets rather than a stub someone can retune.
 *
 * The refund rule is the one the brief said must not be bypassed. It lives here,
 * server-side, in the transaction's read phase; the dashboard copy ("this session
 * is within 24 hours and is not eligible for a refund") only mirrors it. Before
 * this file the whole matrix rested on a single test that declined a pending
 * booking.
 */

const h = vi.hoisted(() => ({ db: null as unknown as FakeFirestore }));

vi.mock('@/lib/firebase/admin', () => ({
  // Delegating rather than returning the instance: each test installs a fresh
  // database, and the module-level binding is captured once at import.
  adminDb: {
    collection: (name: string) => h.db.collection(name),
    runTransaction: (fn: Parameters<FakeFirestore['runTransaction']>[0]) => h.db.runTransaction(fn),
    getAll: (...refs: Parameters<FakeFirestore['getAll']>) => h.db.getAll(...refs),
  },
  adminAuth: {},
}));

vi.mock('@/app/api/email/emailSender', () => ({
  sendEmailAction: vi.fn().mockResolvedValue({ success: true }),
}));

/** 2026-09-02 17:30 IST. Every fixture below is relative to this instant. */
const NOW = new Date('2026-09-02T12:00:00.000Z');
const THERAPIST_AUTH = 'therapist_auth_abc';
const SLOT_PATH = 'locked_slots/th_1_2026-09-05_09:00';

const isoHoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

function bookingDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    therapistId: 'th_1',
    name: 'Ananya Sharma',
    email: 'ananya@example.com',
    userId: 'uid_ananya',
    phone: '9999999999',
    gender: 'female',
    age: 24,
    date: '2026-09-05',
    time: '09:00',
    sessionType: 'Individual therapy',
    sessionMode: 'online',
    message: 'stress management',
    status: 'confirmed',
    paymentStatus: 'paid',
    razorpayPaymentId: 'pay_XYZ789',
    razorpayOrderId: 'order_ABC123',
    paymentAmount: 1500,
    paymentCurrency: 'INR',
    /** 72h out: comfortably inside the 100% tier unless a test overrides it. */
    utcDateTime: isoHoursFromNow(72),
    createdAt: Timestamp.fromDate(new Date('2026-08-30T10:00:00.000Z')),
    ...overrides,
  };
}

/** A booking missing one field entirely, rather than holding `undefined`. */
function bookingWithout(key: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const doc = bookingDoc(overrides);
  delete doc[key];
  return doc;
}

function install(booking: Record<string, unknown> = bookingDoc(), extra: Record<string, Record<string, unknown>> = {}) {
  h.db = new FakeFirestore(
    {
      'bookings/bk_1': booking,
      'therapists/th_1': { authId: THERAPIST_AUTH, name: 'Dr Priya Menon' },
      [SLOT_PATH]: { bookingId: 'bk_1', status: 'booked', therapistId: 'th_1' },
      ...extra,
    },
    NOW
  );
  return h.db;
}

/** The client self-service call, exactly as `/api/bookings/cancel-self` makes it. */
function clientCancel(uid = 'uid_ananya', email = 'ananya@example.com') {
  return new CancelBookingCommand('bk_1', 'Cancelled by client', uid, 'user', undefined, false, email);
}

const handler = new CancelBookingCommandHandler();
const run = (command: CancelBookingCommand) => handler.execute(command);

const bookingState = () => h.db.docs.get('bookings/bk_1') as Record<string, unknown>;
const audits = (eventType: string) => h.db.writesTo('audit_logs').filter((w) => w.data.eventType === eventType);
const refundDoc = () => h.db.docs.get('refunds/refund_pay_XYZ789') as Record<string, unknown> | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(OutboxProcessor, 'processEvent').mockResolvedValue(undefined as never);
  install();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('transaction discipline', () => {
  it('performs every read before every write, in one transaction', async () => {
    // The production 500 was `Transaction.get` reaching `releasePinInTransaction`
    // after the cancellation writes. The fake enforces the same rule the live
    // client does, so this test fails with that exact message if the phases are
    // ever mixed again — the runtime half of what `runPlannedTransaction`
    // guarantees at compile time.
    const db = h.db;
    await run(clientCancel());

    expect(db.transactionAttempts).toBe(1);
    expect(db.reads).toEqual(['bookings/bk_1', 'refunds/refund_pay_XYZ789', SLOT_PATH]);
    expect(db.writes.map((w) => `${w.op} ${w.path}`)).toEqual([
      'set refunds/refund_pay_XYZ789',
      'set bookings/bk_1',
      `create outbox_events/${generateDeterministicEventId('booking', 'bk_1', 'cancelled')}`,
      'set audit_logs/auto_1',
      `delete ${SLOT_PATH}`,
      'set audit_logs/auto_2',
    ]);
  });

  it('commits the outbox event atomically with the cancellation', async () => {
    // The dashboard's "cancelled" state and the client's cancellation email must
    // not be able to disagree: one transaction carries both.
    const db = h.db;
    await run(clientCancel());

    const eventId = generateDeterministicEventId('booking', 'bk_1', 'cancelled');
    const event = db.docs.get(`outbox_events/${eventId}`) as Record<string, unknown>;
    expect(event).toMatchObject({
      name: 'BookingCancelled',
      aggregateType: 'booking',
      aggregateId: 'bk_1',
      status: 'pending',
      attempts: 0,
    });
    expect(event.payload).toMatchObject({ bookingId: 'bk_1', previousStatus: 'confirmed', targetStatus: 'cancelled' });
    expect(bookingState().status).toBe('cancelled');
  });

  it('stamps updatedAt with a resolved server timestamp', async () => {
    await run(clientCancel());
    expect((bookingState().updatedAt as Timestamp).toDate().toISOString()).toBe(NOW.toISOString());
  });

  it('still reports success when the post-commit outbox nudge fails', async () => {
    // The row is already committed, so the process-outbox cron will deliver it.
    // A failed nudge must not turn a completed cancellation into an error.
    vi.mocked(OutboxProcessor.processEvent).mockRejectedValue(new Error('outbox offline'));
    await expect(run(clientCancel())).resolves.toMatchObject({ success: true, outcome: 'cancelled' });
    expect(bookingState().status).toBe('cancelled');
  });
});

describe('refund policy', () => {
  it.each([
    ['72h out', 72, 100],
    ['exactly 48h out', 48, 100],
    ['just inside 48h', 47.9, 50],
    ['36h out', 36, 50],
    ['exactly 24h out', 24, 50],
    ['just inside 24h', 23.9, 0],
    ['12h out', 12, 0],
    ['already started', -1, 0],
  ])('gives %s a %s%% refund', async (_label, hoursOut, expectedPercent) => {
    install(bookingDoc({ utcDateTime: isoHoursFromNow(hoursOut as number) }));
    const result = await run(clientCancel());

    expect(result.refundPercent).toBe(expectedPercent);
    expect(result.refundEnqueued).toBe(expectedPercent > 0);
    expect(result.outcome).toBe('cancelled');
  });

  it('writes no refund request at all inside 24 hours', async () => {
    // The rule the brief said must not be bypassed. It is enforced here, in the
    // transaction, not by the dashboard copy that mirrors it.
    install(bookingDoc({ utcDateTime: isoHoursFromNow(12) }));
    const result = await run(clientCancel());

    expect(result).toMatchObject({ refundPercent: 0, refundEnqueued: false, outcome: 'cancelled' });
    expect(refundDoc()).toBeUndefined();
    expect(h.db.writesTo('refunds')).toHaveLength(0);
    // The decision is still recorded, so an admin can explain it to a client.
    expect(audits('REFUND_POLICY_APPLIED')).toHaveLength(1);
    expect(audits('REFUND_POLICY_APPLIED')[0].data).toMatchObject({
      bookingId: 'bk_1',
      refundPercent: 0,
      details: 'No refund per cancellation policy (<24h to session start)',
    });
    // Cancelling still works — the client is not blocked, only the refund is.
    expect(bookingState().status).toBe('cancelled');
  });

  it('enqueues a PENDING refund request for the amount the policy allows', async () => {
    const result = await run(clientCancel());

    expect(result).toMatchObject({ refundPercent: 100, refundEnqueued: true });
    expect(refundDoc()).toMatchObject({
      bookingId: 'bk_1',
      razorpayPaymentId: 'pay_XYZ789',
      razorpayOrderId: 'order_ABC123',
      refundPercent: 100,
      reason: 'cancellation',
      status: 'PENDING',
      attempts: 0,
    });
    expect(audits('REFUND_POLICY_APPLIED')[0].data.details).toBe(
      'Refund enqueued at 100% per cancellation policy'
    );
  });
});

describe('refund eligibility gates', () => {
  // Each of these must not merely skip the refund — it must not write a
  // REFUND_POLICY_APPLIED audit either, because there was no policy decision to
  // record. That distinguishes "policy said 0%" from "never eligible".
  it.each([
    ['an unpaid booking', { paymentStatus: 'pending' }],
    ['a booking paid with a mock payment id', { razorpayPaymentId: 'mock_pay_local_1' }],
  ])('enqueues nothing for %s', async (_label, overrides) => {
    install(bookingDoc(overrides));
    const result = await run(clientCancel());

    expect(result).toMatchObject({ refundPercent: 0, refundEnqueued: false, outcome: 'cancelled' });
    expect(h.db.writesTo('refunds')).toHaveLength(0);
    expect(audits('REFUND_POLICY_APPLIED')).toHaveLength(0);
    expect(bookingState().status).toBe('cancelled');
  });

  it('enqueues nothing when a paid booking carries no payment id to refund', async () => {
    install(bookingWithout('razorpayPaymentId'));
    const result = await run(clientCancel());

    expect(result).toMatchObject({ refundPercent: 0, refundEnqueued: false });
    expect(h.db.writesTo('refunds')).toHaveLength(0);
    expect(audits('REFUND_POLICY_APPLIED')).toHaveLength(0);
  });

  it('does not overwrite a refund request that already exists', async () => {
    // Idempotency across a double-cancel or a retried request: the refund row is
    // keyed by payment id, and an in-flight or completed refund must never be
    // reset to PENDING with attempts 0.
    install(bookingDoc(), {
      'refunds/refund_pay_XYZ789': {
        bookingId: 'bk_1',
        razorpayPaymentId: 'pay_XYZ789',
        refundPercent: 50,
        status: 'PROCESSED',
        attempts: 2,
        refundId: 'rfnd_EXISTING',
      },
    });

    const result = await run(clientCancel());

    // The policy still reports what the client is owed, but nothing is enqueued.
    expect(result).toMatchObject({ refundPercent: 100, refundEnqueued: false, outcome: 'cancelled' });
    expect(h.db.writesTo('refunds')).toHaveLength(0);
    expect(refundDoc()).toMatchObject({ status: 'PROCESSED', attempts: 2, refundId: 'rfnd_EXISTING', refundPercent: 50 });
  });
});

describe('refund policy resolves the session start in IST', () => {
  it('reads a stored wall-clock date/time as IST, not as UTC', async () => {
    // Bookings created before `utcDateTime` existed carry only date + time, which
    // are IST wall-clock values. At NOW (2026-09-02 17:30 IST) a session on
    // 2026-09-03 at 14:30 IST is 21h away → no refund. Misreading those fields as
    // UTC puts the session 26.5h away → 50%, so this test fails the moment the
    // 24-hour rule is computed in any zone but IST.
    install(bookingWithout('utcDateTime', { date: '2026-09-03', time: '14:30' }));
    const result = await run(clientCancel());

    expect(result).toMatchObject({ refundPercent: 0, refundEnqueued: false, outcome: 'cancelled' });
    expect(h.db.writesTo('refunds')).toHaveLength(0);
  });

  it('prefers the stored utcDateTime over the wall-clock fields when they disagree', async () => {
    // utcDateTime is authoritative: a reschedule updates it, and a stale
    // date/time pair must not silently re-open a refund window.
    install(bookingDoc({ utcDateTime: isoHoursFromNow(72), date: '2026-09-03', time: '14:30' }));
    const result = await run(clientCancel());

    expect(result.refundPercent).toBe(100);
  });

  it('fails safe to 0% when the session start cannot be parsed at all', async () => {
    // Never over-refund on corrupt data. The audit line is the generic policy
    // copy, which is accurate in effect if not in cause.
    install(bookingWithout('utcDateTime', { date: 'unknown', time: 'sometime' }));
    const result = await run(clientCancel());

    expect(result).toMatchObject({ refundPercent: 0, refundEnqueued: false, outcome: 'cancelled' });
    expect(h.db.writesTo('refunds')).toHaveLength(0);
    expect(audits('REFUND_POLICY_APPLIED')).toHaveLength(1);
  });
});

describe('idempotency', () => {
  it.each([
    ['cancelled', 'cancelled'],
    ['rejected', 'rejected'],
  ])('treats an already-%s booking as settled and writes nothing', async (status, expectedOutcome) => {
    install(bookingDoc({ status }));
    const result = await run(clientCancel());

    expect(result).toEqual({
      success: true,
      outcome: expectedOutcome,
      refundPercent: 0,
      refundEnqueued: false,
      alreadySettled: true,
    });
    expect(h.db.writes).toHaveLength(0);
    expect(h.db.staged).toHaveLength(0);
    // No second cancellation email, and no outbox row to re-deliver.
    expect(OutboxProcessor.processEvent).not.toHaveBeenCalled();
  });

  it('is a clean no-op the second time the same cancel is submitted', async () => {
    // The double-click case. The outbox event id is deterministic
    // (`outbox_booking_bk_1_cancelled`), so a second pass that reached
    // `transaction.create` would abort with 6 ALREADY_EXISTS. It must not get
    // there: the status guard settles it during the read phase.
    const first = await run(clientCancel());
    const writesAfterFirst = h.db.writes.length;

    const second = await run(clientCancel());

    expect(first).toMatchObject({ alreadySettled: false, refundEnqueued: true });
    expect(second).toMatchObject({ alreadySettled: true, refundEnqueued: false, refundPercent: 0 });
    expect(h.db.writes).toHaveLength(writesAfterFirst);
    expect(h.db.transactionAttempts).toBe(2);
    expect(OutboxProcessor.processEvent).toHaveBeenCalledTimes(1);
  });

  it('does not release the slot pin again once settled', async () => {
    install(bookingDoc({ status: 'cancelled' }));
    await run(clientCancel());

    expect(h.db.docs.has(SLOT_PATH)).toBe(true);
    expect(audits('SLOT_RELEASED_TX')).toHaveLength(0);
  });
});

describe('status guards', () => {
  it.each(['completed', 'no_show'])('refuses to cancel a %s booking', async (status) => {
    install(bookingDoc({ status }));

    await expect(run(clientCancel())).rejects.toThrow('Cannot cancel or decline a completed or no-show booking');
    // Rejected in the read phase, so not one write was even staged.
    expect(h.db.staged).toHaveLength(0);
    expect(bookingState().status).toBe(status);
    expect(h.db.docs.has(SLOT_PATH)).toBe(true);
  });

  it('reports a missing booking rather than writing a phantom cancellation', async () => {
    h.db = new FakeFirestore({}, NOW);

    await expect(run(clientCancel())).rejects.toThrow('Booking not found');
    expect(h.db.staged).toHaveLength(0);
  });
});

describe('decline path (unpaid bookings are rejected, not cancelled)', () => {
  it.each(['pending', 'pending_approval', 'awaiting_payment'])(
    'declines a %s booking and enqueues no refund',
    async (status) => {
      install(bookingDoc({ status, paymentStatus: 'pending' }));
      const result = await run(clientCancel());

      expect(result).toMatchObject({
        success: true,
        outcome: 'rejected',
        refundPercent: 0,
        refundEnqueued: false,
        alreadySettled: false,
      });
      expect(bookingState().status).toBe('rejected');
      expect(h.db.writesTo('refunds')).toHaveLength(0);
      expect(audits('REFUND_POLICY_APPLIED')).toHaveLength(0);
    }
  );

  it('records a decline against the rejected event id, with a concrete declinedAt', async () => {
    install(bookingDoc({ status: 'pending', paymentStatus: 'pending' }));
    await run(clientCancel());

    const eventId = generateDeterministicEventId('booking', 'bk_1', 'rejected');
    const event = h.db.docs.get(`outbox_events/${eventId}`) as Record<string, unknown>;
    expect(event).toMatchObject({ name: 'BookingRejected', status: 'pending' });
    // The route passes no custom note; the payload must still be a legal document.
    expect((event.payload as Record<string, unknown>).customNote).toBeUndefined();
    // `declinedAt` is top-level on the booking, so the sentinel resolves here.
    expect((bookingState().declinedAt as Timestamp).toDate().toISOString()).toBe(NOW.toISOString());
    expect(OutboxProcessor.processEvent).toHaveBeenCalledWith(eventId);
  });

  it('declines even when a paid deposit exists, without enqueuing a refund', async () => {
    // A paid+awaiting_payment booking is a data inconsistency, not a refund case:
    // the decline branch is chosen by status, so no refund is enqueued here. The
    // payment is left for an admin to settle deliberately.
    install(bookingDoc({ status: 'awaiting_payment', paymentStatus: 'paid' }));
    const result = await run(clientCancel());

    expect(result).toMatchObject({ outcome: 'rejected', refundEnqueued: false });
    expect(h.db.writesTo('refunds')).toHaveLength(0);
  });
});

describe('authorization', () => {
  /** Every rejection must happen before any write is staged, not after. */
  const expectNothingWritten = () => {
    expect(h.db.staged).toHaveLength(0);
    expect(bookingState().status).toBe('confirmed');
    expect(h.db.docs.has(SLOT_PATH)).toBe(true);
  };

  it('refuses a signed-in user who does not own the booking', async () => {
    await expect(run(clientCancel('uid_someone_else', 'someone@example.com'))).rejects.toThrow(
      'Unauthorized: Client ownership mismatch'
    );
    expectNothingWritten();
  });

  it('refuses a request carrying no session and no token context', async () => {
    const command = new CancelBookingCommand('bk_1', 'Cancelled by client', '', 'user', undefined, false, undefined);
    await expect(run(command)).rejects.toThrow(
      'Unauthorized: Cancel request requires a valid session or token context.'
    );
    expectNothingWritten();
  });

  it.each([
    ['the booking userId', 'uid_ananya', undefined],
    ['a legacy email-as-uid', 'ananya@example.com', undefined],
    ['a verified session email in a different case', '', 'ANANYA@Example.COM'],
  ])('accepts a client identified by %s', async (_label, uid, email) => {
    const command = new CancelBookingCommand('bk_1', 'Cancelled by client', uid, 'user', undefined, false, email);
    await expect(run(command)).resolves.toMatchObject({ success: true, outcome: 'cancelled' });
    expect(bookingState().status).toBe('cancelled');
  });

  it('accepts the therapist the booking belongs to', async () => {
    const command = new CancelBookingCommand('bk_1', 'Therapist unavailable', THERAPIST_AUTH, 'therapist');
    await expect(run(command)).resolves.toMatchObject({ success: true, refundPercent: 100 });
    expect(bookingState().status).toBe('cancelled');
  });

  it('refuses a therapist cancelling another therapist’s booking', async () => {
    const command = new CancelBookingCommand('bk_1', 'nope', 'therapist_auth_someone_else', 'therapist');
    await expect(run(command)).rejects.toThrow('Unauthorized to modify this booking');
    expectNothingWritten();
  });

  it('refuses a therapist whose profile document is missing', async () => {
    // Fails closed: an unresolvable therapist identity is not an authorization.
    h.db.docs.delete('therapists/th_1');
    const command = new CancelBookingCommand('bk_1', 'nope', THERAPIST_AUTH, 'therapist');
    await expect(run(command)).rejects.toThrow('Unauthorized to modify this booking');
    expectNothingWritten();
  });

  it('accepts an admin cancelling on a client’s behalf', async () => {
    // The admin route funnels through this same handler, which is why the
    // read/write phase split fixed both production 500s at once.
    const command = new CancelBookingCommand('bk_1', 'Cancelled by admin', 'admin_uid', 'admin');
    await expect(run(command)).resolves.toMatchObject({ success: true, outcome: 'cancelled', refundEnqueued: true });
  });

  it('accepts a valid emailed-token cancellation', async () => {
    const command = new CancelBookingCommand('bk_1', 'Cancelled via link', 'token_bearer', undefined, undefined, true);
    await expect(run(command)).resolves.toMatchObject({ success: true, outcome: 'cancelled' });
  });

  it('refuses a token that has already been invalidated', async () => {
    install(bookingDoc({ invalidToken: true }));
    const command = new CancelBookingCommand('bk_1', 'Cancelled via link', 'token_bearer', undefined, undefined, true);
    await expect(run(command)).rejects.toThrow('Unauthorized: Booking token is invalidated');
    expectNothingWritten();
  });
});

describe('slot pin release', () => {
  it('frees the slot it owns, and audits it', async () => {
    await run(clientCancel());

    expect(h.db.docs.has(SLOT_PATH)).toBe(false);
    expect(audits('SLOT_RELEASED_TX')).toHaveLength(1);
    expect(audits('SLOT_RELEASED_TX')[0].data).toMatchObject({
      therapistId: 'th_1',
      date: '2026-09-05',
      time: '09:00',
      bookingId: 'bk_1',
    });
  });

  it('never deletes a pin held by a different booking', async () => {
    // A blind delete here would hand a confirmed client's slot away. Ownership is
    // decided in the read phase, so the write phase cannot get this wrong.
    install(bookingDoc(), { [SLOT_PATH]: { bookingId: 'bk_someone_else', status: 'booked', therapistId: 'th_1' } });

    await expect(run(clientCancel())).resolves.toMatchObject({ success: true, outcome: 'cancelled' });
    expect(h.db.docs.get(SLOT_PATH)).toMatchObject({ bookingId: 'bk_someone_else' });
    expect(audits('SLOT_RELEASED_TX')).toHaveLength(0);
  });

  it('cancels successfully when the pin is already gone', async () => {
    h.db.docs.delete(SLOT_PATH);

    await expect(run(clientCancel())).resolves.toMatchObject({ success: true, outcome: 'cancelled' });
    expect(bookingState().status).toBe('cancelled');
    expect(audits('SLOT_RELEASED_TX')).toHaveLength(0);
  });

  it('resolves the pin from the therapist, date and time on the booking', async () => {
    // The pin id is derived, not stored, so a booking on a different slot must
    // release that slot — and only that one.
    const other = 'locked_slots/th_1_2026-09-07_15:30';
    install(bookingDoc({ date: '2026-09-07', time: '15:30' }), {
      [other]: { bookingId: 'bk_1', status: 'booked', therapistId: 'th_1' },
    });

    await run(clientCancel());

    expect(h.db.docs.has(other)).toBe(false);
    expect(h.db.docs.has(SLOT_PATH)).toBe(true);
  });
});
