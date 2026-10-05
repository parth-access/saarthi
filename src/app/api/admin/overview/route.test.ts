import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { GET } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { firestoreRefundRepository } from '@/domains/payment/FirestoreRefundRepository';
import { logger } from '../../_lib/logger';
import { OVERVIEW_SCAN_LIMIT } from './overviewSources';
import type { AdminBookingQueryPlan } from '@/domains/booking/queries/adminBookingQuery';

/**
 * The overview endpoint.
 *
 * `overviewTriage.test.ts` proves the rules the browser applies to this payload.
 * These prove the server half, and specifically the four ways this endpoint could
 * lie to or leak on an operator:
 *
 *  - a source that failed must come back as a gap, never as a zero, and must never
 *    take the other five with it;
 *  - a raw Firestore error — which carries the project id and an index-creation
 *    URL — must reach the log and not the browser;
 *  - a scan that filled its limit must be reported as a floor, not a total;
 *  - the summary must not carry email bodies, outbox payloads or Meet links, none
 *    of which a landing page needs.
 */

const db = vi.hoisted(() => ({
  /** `collection` -> the docs that collection's status scan returns, or an Error. */
  answers: new Map<string, { id: string; data: Record<string, unknown> }[] | Error>(),
  queries: [] as { collection: string; field: string; op: string; value: unknown; limit: number }[],
}));

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));

vi.mock('@/domains/booking/repository/FirestoreBookingRepository', () => ({
  firestoreBookingRepository: {
    findAdminPage: vi.fn(),
    scanBookingsNeedingCalendarRetry: vi.fn(),
  },
}));

vi.mock('@/domains/payment/FirestoreRefundRepository', () => ({
  firestoreRefundRepository: { findRefundsNeedingProcessing: vi.fn() },
}));

vi.mock('../../_lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      where: (field: string, op: string, value: unknown) => ({
        limit: (n: number) => ({
          get: async () => {
            db.queries.push({ collection: name, field, op, value, limit: n });
            const key = `${name}:${JSON.stringify(value)}`;
            const answer = db.answers.get(key);
            if (answer instanceof Error) throw answer;
            const docs = (answer ?? []).slice(0, n);
            return {
              size: docs.length,
              docs: docs.map((doc) => ({ id: doc.id, data: () => doc.data })),
            };
          },
        }),
      }),
    }),
  },
}));

const ADMIN = { uid: 'uid_admin', email: 'ops@saarthi.com', role: 'admin' };

/** The fixed sentence a failed source is allowed to show. */
const UNREADABLE = 'Could not be read just now. Reload to try again.';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

type Row = Record<string, unknown> & { id: string };

function booking(overrides: Partial<Row> = {}): Row {
  return {
    id: 'bk_20260905_AAAA0001',
    status: 'confirmed',
    paymentStatus: 'paid',
    name: 'Client One',
    email: 'client.one@example.com',
    phone: '+919000000001',
    therapistId: 'th_1',
    date: '2026-09-05',
    time: '11:00',
    sessionType: 'individual',
    paymentAmount: 1500,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  };
}

/** Which of the three planned reads this is, judged by the plan's own filters. */
function planKind(plan: AdminBookingQueryPlan): 'today' | 'awaiting_approval' | 'lapsed_holds' {
  if (plan.where.some((clause) => clause.field === 'date')) return 'today';
  const statuses = plan.where.flatMap((clause) =>
    clause.field === 'status' ? [clause.value].flat() : []
  );
  return statuses.includes('pending_approval') ? 'awaiting_approval' : 'lapsed_holds';
}

type PageAnswer = { bookings: Row[]; hasMore?: boolean } | Error;

/** Answers the three `findAdminPage` calls independently. */
function pages(answers: Partial<Record<ReturnType<typeof planKind>, PageAnswer>>) {
  vi.mocked(firestoreBookingRepository.findAdminPage).mockImplementation(async (plan) => {
    const answer = answers[planKind(plan)] ?? { bookings: [] };
    if (answer instanceof Error) throw answer;
    // The real repository returns entities; only the projection's fields are read.
    return { bookings: answer.bookings as never, hasMore: answer.hasMore ?? false };
  });
}

function outboxDocs(count: number, data: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `evt_${index}`,
    data: { status: 'pending', createdAt: new Date(Date.now() - 60_000), ...data },
  }));
}

async function get() {
  const response = await GET(new Request('http://localhost/api/admin/overview'));
  return { response, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.answers.clear();
  db.queries.length = 0;
  vi.mocked(requireAdmin).mockResolvedValue(ADMIN as never);
  pages({});
  vi.mocked(firestoreBookingRepository.scanBookingsNeedingCalendarRetry).mockResolvedValue({
    bookings: [],
    scanFilled: false,
  });
  vi.mocked(firestoreRefundRepository.findRefundsNeedingProcessing).mockResolvedValue([]);
});

/* ------------------------------------------------------------------ *
 * Authorization
 * ------------------------------------------------------------------ */

describe('authorization', () => {
  it.each([401, 403])('returns the refusal from requireAdmin (%i) unchanged', async (status) => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: 'nope' }, { status }) as never
    );

    const { response } = await get();

    expect(response.status).toBe(status);
  });

  it('reads nothing at all for a caller who is not an admin', async () => {
    // The refusal has to happen before any query, not merely be reflected in what
    // the response contains. A screen that hides a number it already fetched has
    // still fetched it.
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: 'nope' }, { status: 403 }) as never
    );

    await get();

    expect(db.queries).toEqual([]);
    expect(firestoreBookingRepository.findAdminPage).not.toHaveBeenCalled();
    expect(
      firestoreBookingRepository.scanBookingsNeedingCalendarRetry
    ).not.toHaveBeenCalled();
    expect(firestoreRefundRepository.findRefundsNeedingProcessing).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * The six counts
 * ------------------------------------------------------------------ */

describe('the attention counts', () => {
  it('answers every queue and says what a scan limit means', async () => {
    pages({
      awaiting_approval: { bookings: [booking({ id: 'bk_a', status: 'pending_approval' })] },
    });
    vi.mocked(firestoreBookingRepository.scanBookingsNeedingCalendarRetry).mockResolvedValue({
      bookings: [booking({ id: 'bk_m' })] as never,
      scanFilled: false,
    });
    vi.mocked(firestoreRefundRepository.findRefundsNeedingProcessing).mockResolvedValue([
      { id: 'refund_pay_1' },
      { id: 'refund_pay_2' },
    ] as never);
    db.answers.set('outbox_events:"dead"', outboxDocs(3, { status: 'dead' }));
    db.answers.set('emails:"failed"', [{ id: 'email_1', data: { status: 'failed' } }]);

    const { response, body } = await get();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.attention).toEqual({
      awaiting_approval: { ok: true, count: 1, atLeast: false },
      lapsed_holds: { ok: true, count: 0, atLeast: false },
      missing_meet_link: { ok: true, count: 1, atLeast: false },
      refunds_outstanding: { ok: true, count: 2, atLeast: false },
      events_abandoned: { ok: true, count: 3, atLeast: false },
      emails_failed: { ok: true, count: 1, atLeast: false },
    });
    expect(body.scanLimit).toBe(OVERVIEW_SCAN_LIMIT);
  });

  it('asks each collection for one more document than it will report', async () => {
    // This is what makes `atLeast` possible. Asking for exactly the limit would
    // leave a full scan indistinguishable from an exact total.
    await get();

    for (const query of db.queries) {
      expect(query.limit, `${query.collection} asked for ${query.limit}`).toBe(
        OVERVIEW_SCAN_LIMIT + 1
      );
    }
    expect(firestoreRefundRepository.findRefundsNeedingProcessing).toHaveBeenCalledWith(
      OVERVIEW_SCAN_LIMIT + 1
    );
  });

  it('reports a full scan as a floor rather than a total', async () => {
    db.answers.set('outbox_events:"dead"', outboxDocs(OVERVIEW_SCAN_LIMIT + 1, { status: 'dead' }));
    vi.mocked(firestoreRefundRepository.findRefundsNeedingProcessing).mockResolvedValue(
      Array.from({ length: OVERVIEW_SCAN_LIMIT + 1 }, (_, i) => ({ id: `refund_${i}` })) as never
    );
    pages({ awaiting_approval: { bookings: [booking()], hasMore: true } });

    const { body } = await get();

    expect(body.attention.events_abandoned).toEqual({
      ok: true,
      count: OVERVIEW_SCAN_LIMIT,
      atLeast: true,
    });
    expect(body.attention.refunds_outstanding).toEqual({
      ok: true,
      count: OVERVIEW_SCAN_LIMIT,
      atLeast: true,
    });
    expect(body.attention.awaiting_approval.atLeast).toBe(true);
  });

  it('counts the calendar-retry set exactly as the cron defines it', async () => {
    // Not a fresh query: the same repository scan `/api/cron/retry-calendar` runs,
    // so the number an operator reads is the work that job will do.
    vi.mocked(firestoreBookingRepository.scanBookingsNeedingCalendarRetry).mockResolvedValue({
      bookings: [booking({ id: 'bk_1' }), booking({ id: 'bk_2' })] as never,
      scanFilled: true,
    });

    const { body } = await get();

    expect(body.attention.missing_meet_link).toEqual({ ok: true, count: 2, atLeast: true });
  });

  it('scans only the terminal statuses in the outbox and email log', async () => {
    await get();

    const outbox = db.queries.filter((query) => query.collection === 'outbox_events');
    expect(outbox.map((query) => query.value)).toEqual(['dead', ['pending', 'processing']]);
    expect(db.queries.filter((query) => query.collection === 'emails')).toMatchObject([
      { field: 'status', op: '==', value: 'failed' },
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Lapsed holds
 * ------------------------------------------------------------------ */

describe('lapsed payment holds', () => {
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
  const minutesAhead = (n: number) => new Date(Date.now() + n * 60_000);

  it('counts only the holds whose own deadline has passed', async () => {
    // The deadline is read from the document rather than recomputed, because the
    // write paths disagree: `BOOKING_LIFETIME_MS` is 15 minutes and
    // `RescheduleBookingCommand` sets 10.
    pages({
      lapsed_holds: {
        bookings: [
          booking({ id: 'bk_lapsed', status: 'awaiting_payment', holdExpiresAt: minutesAgo(9) }),
          booking({ id: 'bk_live', status: 'awaiting_payment', holdExpiresAt: minutesAhead(4) }),
          booking({ id: 'bk_no_deadline', status: 'awaiting_payment' }),
        ],
      },
    });

    const { body } = await get();

    expect(body.attention.lapsed_holds).toEqual({ ok: true, count: 1, atLeast: false });
  });

  it('says how long the oldest lapsed hold has been dead', async () => {
    pages({
      lapsed_holds: {
        bookings: [
          booking({ id: 'bk_new', status: 'awaiting_payment', holdExpiresAt: minutesAgo(4) }),
          booking({ id: 'bk_old', status: 'awaiting_payment', holdExpiresAt: minutesAgo(95) }),
        ],
      },
    });

    const { body } = await get();

    expect(body.attention.lapsed_holds.count).toBe(2);
    expect(body.notes.lapsed_holds).toBe('Hold lapsed 1 hr 35 min ago');
  });

  it('leaves the note empty when nothing has lapsed', async () => {
    pages({
      lapsed_holds: {
        bookings: [booking({ status: 'awaiting_payment', holdExpiresAt: minutesAhead(6) })],
      },
    });

    const { body } = await get();

    expect(body.attention.lapsed_holds.count).toBe(0);
    expect(body.notes.lapsed_holds).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Today
 * ------------------------------------------------------------------ */

describe("today's bookings", () => {
  it('queries the IST day and reports which day it read', async () => {
    const { body } = await get();

    expect(body.istDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const plans = vi.mocked(firestoreBookingRepository.findAdminPage).mock.calls.map(([p]) => p);
    const dayPlan = plans.find((plan) => plan.where.some((c) => c.field === 'date'));
    expect(dayPlan?.where).toEqual([{ field: 'date', op: '==', value: body.istDate }]);
  });

  it('separates the sessions from everything else on the same date without dropping a row', async () => {
    pages({
      today: {
        bookings: [
          booking({ id: 'bk_confirmed', status: 'confirmed' }),
          booking({ id: 'bk_rescheduled', status: 'rescheduled' }),
          booking({ id: 'bk_completed', status: 'completed' }),
          booking({ id: 'bk_cancelled', status: 'cancelled' }),
          booking({ id: 'bk_unpaid', status: 'awaiting_payment' }),
        ],
      },
    });

    const { body } = await get();

    expect(body.today.ok).toBe(true);
    expect(body.today.sessions.map((row: { id: string }) => row.id)).toEqual([
      'bk_confirmed',
      'bk_rescheduled',
      'bk_completed',
    ]);
    expect(body.today.other.map((row: { id: string }) => row.id)).toEqual([
      'bk_cancelled',
      'bk_unpaid',
    ]);
  });

  it('admits when the day itself was truncated', async () => {
    pages({ today: { bookings: [booking()], hasMore: true } });

    const { body } = await get();

    expect(body.today.atLeast).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Failure isolation
 * ------------------------------------------------------------------ */

describe('when a source fails', () => {
  const FIRESTORE_ERROR = new Error(
    '9 FAILED_PRECONDITION: The query requires an index. Create it here: ' +
      'https://console.firebase.google.com/project/saarthi-prod-42/firestore/indexes?create_composite=Ci9'
  );

  it('still answers 200 with the queues that did read', async () => {
    db.answers.set('emails:"failed"', FIRESTORE_ERROR);
    vi.mocked(firestoreRefundRepository.findRefundsNeedingProcessing).mockResolvedValue([
      { id: 'refund_pay_1' },
    ] as never);

    const { response, body } = await get();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.attention.emails_failed).toEqual({ ok: false, reason: UNREADABLE });
    expect(body.attention.refunds_outstanding).toEqual({ ok: true, count: 1, atLeast: false });
  });

  it('never reports a failed scan as zero', async () => {
    // The single most damaging thing this page could do: an operator reads
    // "nothing needs attention" and walks away from a real backlog.
    db.answers.set('outbox_events:"dead"', FIRESTORE_ERROR);

    const { body } = await get();

    expect(body.attention.events_abandoned).not.toHaveProperty('count');
    expect(body.attention.events_abandoned.ok).toBe(false);
  });

  it('keeps a raw Firestore error out of the response and puts it in the log', async () => {
    db.answers.set('emails:"failed"', FIRESTORE_ERROR);

    const { body } = await get();
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain('FAILED_PRECONDITION');
    expect(serialized).not.toContain('saarthi-prod-42');
    expect(serialized).not.toContain('console.firebase.google.com');
    expect(serialized).not.toContain('requires an index');
    expect(logger.error).toHaveBeenCalledWith(
      'SYSTEM',
      expect.stringContaining('emails_failed'),
      FIRESTORE_ERROR,
      expect.anything()
    );
  });

  it('does not let a failed queue take the day with it', async () => {
    db.answers.set('outbox_events:"dead"', FIRESTORE_ERROR);
    pages({ today: { bookings: [booking({ id: 'bk_today' })] } });

    const { body } = await get();

    expect(body.today.ok).toBe(true);
    expect(body.today.sessions).toHaveLength(1);
  });

  it('does not let a failed day read blank the queues', async () => {
    pages({
      today: FIRESTORE_ERROR,
      awaiting_approval: { bookings: [booking({ status: 'pending_approval' })] },
    });

    const { body } = await get();

    expect(body.today).toEqual({ ok: false, reason: UNREADABLE });
    expect(body.attention.awaiting_approval).toEqual({ ok: true, count: 1, atLeast: false });
  });

  it('degrades only the Meet-link queue when the calendar scan throws', async () => {
    vi.mocked(firestoreBookingRepository.scanBookingsNeedingCalendarRetry).mockRejectedValue(
      FIRESTORE_ERROR
    );
    db.answers.set('emails:"failed"', [{ id: 'email_1', data: { status: 'failed' } }]);

    const { body } = await get();

    expect(body.attention.missing_meet_link).toEqual({ ok: false, reason: UNREADABLE });
    expect(body.attention.emails_failed).toEqual({ ok: true, count: 1, atLeast: false });
  });

  it('keeps the dead-letter count when only the waiting scan fails', async () => {
    db.answers.set('outbox_events:"dead"', outboxDocs(2, { status: 'dead' }));
    db.answers.set('outbox_events:["pending","processing"]', FIRESTORE_ERROR);

    const { body } = await get();

    expect(body.machinery.dead).toEqual({ ok: true, count: 2, atLeast: false });
    expect(body.machinery.waiting).toEqual({ ok: false, reason: UNREADABLE });
    expect(body.machinery.sample).toEqual([]);
    // The queue tile reads the same count, so the two cannot disagree.
    expect(body.attention.events_abandoned).toEqual(body.machinery.dead);
  });

  it('returns a generic 500 if the assembly itself breaks', async () => {
    vi.resetModules();
    vi.doMock('./overviewSources', () => ({
      OVERVIEW_SCAN_LIMIT,
      readAdminOverview: vi.fn().mockRejectedValue(FIRESTORE_ERROR),
    }));

    const { GET: freshGet } = await import('./route');
    const response = await freshGet(new Request('http://localhost/api/admin/overview'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: 'We could not load the overview right now. Please try again.',
    });
    expect(JSON.stringify(body)).not.toContain('saarthi-prod-42');

    vi.doUnmock('./overviewSources');
    vi.resetModules();
  });
});

/* ------------------------------------------------------------------ *
 * What the summary refuses to carry
 * ------------------------------------------------------------------ */

describe('what the payload withholds', () => {
  it('sends no outbox payload, only the timing needed to judge a stall', async () => {
    db.answers.set('outbox_events:["pending","processing"]', [
      {
        id: 'evt_1',
        data: {
          status: 'pending',
          eventType: 'BookingConfirmed',
          createdAt: new Date('2026-09-05T09:00:00.000Z'),
          nextAttemptAt: new Date('2026-09-05T09:10:00.000Z'),
          payload: { email: 'private.client@example.com', name: 'Private Client' },
        },
      },
    ]);

    const { body } = await get();

    expect(body.machinery.sample).toEqual([
      {
        createdAtIso: '2026-09-05T09:00:00.000Z',
        nextAttemptAtIso: '2026-09-05T09:10:00.000Z',
        status: 'pending',
      },
    ]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('private.client@example.com');
    expect(serialized).not.toContain('Private Client');
  });

  it('never projects an email document, which holds the rendered body', async () => {
    db.answers.set('emails:"failed"', [
      {
        id: 'email_bk_1_booking-confirmed',
        data: {
          status: 'failed',
          to: 'leaky.client@example.com',
          html: '<p>Your session link: https://meet.google.com/abc-defg-hij</p>',
        },
      },
    ]);

    const { body } = await get();

    expect(body.attention.emails_failed).toEqual({ ok: true, count: 1, atLeast: false });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('leaky.client@example.com');
    expect(serialized).not.toContain('meet.google.com');
  });

  it('reports whether a session has a Meet link without sending the link', async () => {
    pages({
      today: {
        bookings: [
          booking({ id: 'bk_1', meetingUrl: 'https://meet.google.com/xyz-1234-abc' }),
        ],
      },
    });

    const { body } = await get();

    expect(body.today.sessions[0].hasMeetingLink).toBe(true);
    expect(JSON.stringify(body)).not.toContain('meet.google.com');
  });
});

/* ------------------------------------------------------------------ *
 * Caching
 * ------------------------------------------------------------------ */

describe('caching', () => {
  it('refuses to be cached', async () => {
    // An operations queue is wrong the moment it is stored, and the response is
    // scoped to one admin's session.
    const { response } = await get();

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
