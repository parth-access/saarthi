import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { POST } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { SessionLifecycleService } from '@/services/sessionLifecycleService';
import { checkRateLimit } from '../../../../_lib/rateLimit';
import { logger } from '../../../../_lib/logger';
import { GENERIC_ACTION_ERROR } from './adminBookingAction';

/**
 * The HTTP edge of the five booking operations.
 *
 * `adminBookingAction.test.ts` proves the schema, the copy and the error mapping.
 * These prove the route wires them to the real handlers and that the specific ways
 * this endpoint could do harm are closed:
 *
 *  - a non-admin must never reach a command handler;
 *  - the acting identity must come from the verified session, never from the body;
 *  - an idempotent no-op must not be reported as an operation;
 *  - a refusal the lifecycle service *returns* rather than throws must still map to
 *    its real status instead of a blanket 500;
 *  - a Firestore failure must not put its message in front of the browser, and must
 *    reach the log so someone can find out what happened;
 *  - the reschedule summary must state the slot the domain recorded, not the one
 *    this route was asked for.
 */

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  cancel: vi.fn(),
  reschedule: vi.fn(),
  confirmCommands: [] as unknown[],
  cancelCommands: [] as unknown[],
  rescheduleCommands: [] as unknown[],
}));

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));

vi.mock('@/domains/booking', () => ({
  AdminConfirmBookingCommand: class {
    constructor(readonly bookingId: string, readonly session: unknown) {
      mocks.confirmCommands.push(this);
    }
  },
  AdminConfirmBookingCommandHandler: class {
    execute = mocks.confirm;
  },
  CancelBookingCommand: class {
    constructor(
      readonly bookingId: string,
      readonly reason: string,
      readonly cancelledBy: string,
      readonly sessionRole?: string,
      readonly customNote?: string
    ) {
      mocks.cancelCommands.push(this);
    }
  },
  CancelBookingCommandHandler: class {
    execute = mocks.cancel;
  },
  RescheduleBookingCommand: class {
    constructor(
      readonly bookingId: string,
      readonly newDate: string,
      readonly newTime: string,
      readonly session: unknown
    ) {
      mocks.rescheduleCommands.push(this);
    }
  },
  RescheduleBookingCommandHandler: class {
    execute = mocks.reschedule;
  },
}));

vi.mock('@/services/sessionLifecycleService', () => ({
  SessionLifecycleService: { completeSession: vi.fn(), markNoShow: vi.fn() },
}));

vi.mock('../../../../_lib/rateLimit', () => ({ checkRateLimit: vi.fn() }));

vi.mock('../../../../_lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const ADMIN = { uid: 'uid_admin', email: 'ops@saarthi.com', role: 'admin' };
const BOOKING_ID = 'bk_20260903_ABCD1234';

function post(body: unknown, bookingId = BOOKING_ID, raw?: string) {
  const req = new Request(`http://localhost/api/admin/bookings/${bookingId}/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: raw ?? JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ bookingId }) });
}

function noHandlerRan() {
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.cancel).not.toHaveBeenCalled();
  expect(mocks.reschedule).not.toHaveBeenCalled();
  expect(SessionLifecycleService.completeSession).not.toHaveBeenCalled();
  expect(SessionLifecycleService.markNoShow).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirmCommands.length = 0;
  mocks.cancelCommands.length = 0;
  mocks.rescheduleCommands.length = 0;
  vi.mocked(requireAdmin).mockResolvedValue(ADMIN as never);
  vi.mocked(checkRateLimit).mockReturnValue({ success: true, limit: 30, remaining: 29, reset: 0 });
  mocks.confirm.mockResolvedValue({ success: true });
  mocks.cancel.mockResolvedValue({
    success: true,
    outcome: 'cancelled',
    refundPercent: 100,
    refundEnqueued: true,
    alreadySettled: false,
  });
  mocks.reschedule.mockResolvedValue({
    date: '2026-09-20',
    time: '14:30',
    rescheduleHistory: [{ previousDate: '2026-09-18', previousTime: '09:00' }],
  });
  vi.mocked(SessionLifecycleService.completeSession).mockResolvedValue({
    success: true,
    bookingId: BOOKING_ID,
    previousStatus: 'confirmed',
    newStatus: 'completed',
  });
  vi.mocked(SessionLifecycleService.markNoShow).mockResolvedValue({
    success: true,
    bookingId: BOOKING_ID,
    previousStatus: 'confirmed',
    newStatus: 'no_show',
  });
});

describe('authorization', () => {
  it('answers whatever requireAdmin decided, without running anything', async () => {
    for (const status of [401, 403]) {
      vi.clearAllMocks();
      vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'nope' }, { status }) as never);
      const res = await post({ action: 'confirm' });
      expect(res.status).toBe(status);
      noHandlerRan();
      // The limiter is keyed by IP, so consulting it before the gate would let
      // unauthenticated traffic exhaust the bucket a real operator needs.
      expect(checkRateLimit).not.toHaveBeenCalled();
    }
  });

  it('acts as the verified session, ignoring any identity in the body', async () => {
    // "Never trust the frontend" applied to the actor: the uid that lands in the
    // audit trail is the one the session cookie proved, and a body claiming
    // otherwise changes nothing.
    await post({ action: 'confirm', uid: 'uid_someone_else', role: 'superadmin', adminUid: 'uid_x' });
    expect(mocks.confirmCommands).toHaveLength(1);
    expect(mocks.confirmCommands[0]).toMatchObject({
      bookingId: BOOKING_ID,
      session: { uid: 'uid_admin', role: 'admin' },
    });
  });
});

describe('rate limiting', () => {
  it('refuses a flood with 429 and runs nothing', async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ success: false, limit: 30, remaining: 0, reset: 0 });
    const res = await post({ action: 'confirm' });
    expect(res.status).toBe(429);
    noHandlerRan();
  });

  it('allows an operator more headroom than the client-facing routes', async () => {
    // A morning's queue is many actions in a minute; the limiter exists to catch a
    // stuck retry loop, not to throttle someone doing their job.
    await post({ action: 'confirm' });
    expect(checkRateLimit).toHaveBeenCalledWith('203.0.113.9', 'admin_booking_action', 30, 60000);
  });
});

describe('request validation', () => {
  it('refuses an id that could be read as a Firestore path', async () => {
    for (const id of ['bookings/other/audit_logs/x', '__proto__', 'a'.repeat(129), 'bk 1234']) {
      vi.clearAllMocks();
      vi.mocked(requireAdmin).mockResolvedValue(ADMIN as never);
      vi.mocked(checkRateLimit).mockReturnValue({ success: true, limit: 30, remaining: 29, reset: 0 });
      const res = await post({ action: 'confirm' }, id);
      expect(res.status, id).toBe(400);
      noHandlerRan();
    }
  });

  it('refuses a body that is not JSON without a 500', async () => {
    const res = await post(undefined, BOOKING_ID, 'not json at all');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('valid JSON') });
    noHandlerRan();
  });

  it('refuses an action it does not implement', async () => {
    const res = await post({ action: 'refund' });
    expect(res.status).toBe(400);
    noHandlerRan();
  });

  it('returns the authored message for a bad field, not a nested error tree', async () => {
    const res = await post({ action: 'cancel', reason: ' ' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('the client sees it');
    expect(body.details).toBeUndefined();
    // The full issue list is a debugging aid and belongs in the log.
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('confirm', () => {
  it('reports a real confirmation as a change', async () => {
    const res = await post({ action: 'confirm' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, action: 'confirm', changed: true });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('reports an already-confirmed booking as 200 but unchanged', async () => {
    // Not an error: the handler is idempotent by design. But `changed: false` is
    // what stops the UI congratulating an operator for a no-op.
    mocks.confirm.mockResolvedValue({ success: true, alreadyConfirmed: true });
    const res = await post({ action: 'confirm' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, changed: false });
  });
});

describe('cancel', () => {
  it('passes the reason and note through and reports the real refund fields', async () => {
    mocks.cancel.mockResolvedValue({
      success: true,
      outcome: 'cancelled',
      refundPercent: 50,
      refundEnqueued: true,
      alreadySettled: false,
    });
    const res = await post({ action: 'cancel', reason: 'Therapist unwell', note: 'Called the client' });
    expect(res.status).toBe(200);

    expect(mocks.cancelCommands[0]).toMatchObject({
      bookingId: BOOKING_ID,
      reason: 'Therapist unwell',
      cancelledBy: 'uid_admin',
      sessionRole: 'admin',
      customNote: 'Called the client',
    });

    const body = await res.json();
    expect(body.details.join(' ')).toContain('50%');
  });

  it('does not send a blank note as an empty string', async () => {
    // It reaches the cancellation email and the outbox payload, and this project
    // never enables `ignoreUndefinedProperties`; a blank must be absent, not
    // stored empty.
    await post({ action: 'cancel', reason: 'Therapist unwell', note: '   ' });
    expect(mocks.cancelCommands[0]).toMatchObject({ customNote: undefined });
  });

  it('reports an already-settled booking as unchanged', async () => {
    mocks.cancel.mockResolvedValue({
      success: true,
      outcome: 'cancelled',
      refundPercent: 0,
      refundEnqueued: false,
      alreadySettled: true,
    });
    const res = await post({ action: 'cancel', reason: 'Duplicate booking' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ changed: false });
  });
});

describe('complete and no-show', () => {
  it('delegates to the shared lifecycle service as the verified admin', async () => {
    await post({ action: 'complete' });
    expect(SessionLifecycleService.completeSession).toHaveBeenCalledWith(BOOKING_ID, {
      uid: 'uid_admin',
      role: 'admin',
    });
  });

  it('passes a supplied no-show reason and omits an absent one', async () => {
    await post({ action: 'no_show', reason: 'Client did not join the Meet' });
    expect(SessionLifecycleService.markNoShow).toHaveBeenCalledWith(
      BOOKING_ID,
      { uid: 'uid_admin', role: 'admin' },
      'Client did not join the Meet'
    );

    vi.mocked(SessionLifecycleService.markNoShow).mockClear();
    await post({ action: 'no_show' });
    // `undefined` rather than '' so the service's own default reason applies.
    expect(SessionLifecycleService.markNoShow).toHaveBeenCalledWith(
      BOOKING_ID,
      { uid: 'uid_admin', role: 'admin' },
      undefined
    );
  });

  it('maps a returned refusal to its real status instead of a blanket 500', async () => {
    // This pair reports refusals by returning `{ success: false }` rather than by
    // throwing. A route that only classified thrown errors would answer 200 here.
    vi.mocked(SessionLifecycleService.completeSession).mockResolvedValue({
      success: false,
      bookingId: BOOKING_ID,
      error: "Cannot complete booking with status 'pending'. Only confirmed sessions can be completed.",
    });
    const res = await post({ action: 'complete' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ success: false });
    expect(body.error).toContain('Only a confirmed session');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps an infrastructure failure out of the response and puts it in the log', async () => {
    vi.mocked(SessionLifecycleService.markNoShow).mockResolvedValue({
      success: false,
      bookingId: BOOKING_ID,
      error: '5 NOT_FOUND: no entity to update: app: "s~saarthi-prod"',
    });
    const res = await post({ action: 'no_show' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(GENERIC_ACTION_ERROR);
    expect(body.error).not.toContain('saarthi-prod');
    expect(logger.error).toHaveBeenCalled();
  });

  it('reports the status it overwrote', async () => {
    const res = await post({ action: 'complete' });
    const body = await res.json();
    expect(body.details.join(' ')).toContain("from 'confirmed' to 'completed'");
  });
});

describe('reschedule', () => {
  it('passes the slot through and reports the previous one the domain recorded', async () => {
    const res = await post({ action: 'reschedule', date: '2026-09-20', time: '14:30' });
    expect(res.status).toBe(200);

    expect(mocks.rescheduleCommands[0]).toMatchObject({
      bookingId: BOOKING_ID,
      newDate: '2026-09-20',
      newTime: '14:30',
      session: { uid: 'uid_admin', email: 'ops@saarthi.com', role: 'admin' },
    });

    const body = await res.json();
    // Read back from `rescheduleHistory`, so the sentence describes what was
    // written rather than what this route was asked to write.
    expect(body.details.join(' ')).toContain('2026-09-18 at 09:00 IST');
  });

  it('still answers when the history is unexpectedly absent', async () => {
    // A booking written before `rescheduleHistory` existed. The operation
    // succeeded; refusing to describe it would be worse than a vague sentence.
    mocks.reschedule.mockResolvedValue({ date: '2026-09-20', time: '14:30' });
    const res = await post({ action: 'reschedule', date: '2026-09-20', time: '14:30' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ changed: true });
  });
});

describe('failures', () => {
  it('maps a thrown domain refusal and logs it as expected traffic', async () => {
    mocks.reschedule.mockRejectedValue(new Error('This new slot is already booked.'));
    const res = await post({ action: 'reschedule', date: '2026-09-20', time: '14:30' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('no longer free');
    // A slot lost to a race is normal operator traffic, not an incident.
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('never puts a Firestore message in front of the browser', async () => {
    mocks.cancel.mockRejectedValue(
      new Error(
        '9 FAILED_PRECONDITION: The query requires an index. You can create it here: ' +
          'https://console.firebase.google.com/v1/r/project/saarthi-prod/firestore/indexes?create_composite=Ck'
      )
    );
    const res = await post({ action: 'cancel', reason: 'Therapist unwell' });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain(GENERIC_ACTION_ERROR);
    expect(text).not.toContain('saarthi-prod');
    expect(text).not.toContain('console.firebase');
    expect(text).not.toContain('FAILED_PRECONDITION');
    // The only place the real cause now exists.
    expect(logger.error).toHaveBeenCalled();
  });

  it('does not report success when a handler throws', async () => {
    mocks.confirm.mockRejectedValue(new Error('Booking not found'));
    const res = await post({ action: 'confirm' });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false });
  });
});
