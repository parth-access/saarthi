import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { GET } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import type { Booking } from '@/domains/booking/entities/Booking';

/**
 * The HTTP edge of the admin bookings list.
 *
 * `adminBookingQuery.test.ts` proves the planning rules; these prove the route
 * applies them, and that the three ways this endpoint could quietly mislead an
 * operator are all closed:
 *
 *  - a refused filter combination must answer 400, not run a different query;
 *  - a stale or tampered cursor must answer 400, not silently restart at page one
 *    (an operator paging through hundreds of bookings would loop forever);
 *  - a Firestore failure must not put its message — which carries the project id
 *    and a console URL for a missing index — in front of the browser.
 */

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));

vi.mock('@/domains/booking/repository/FirestoreBookingRepository', () => ({
  firestoreBookingRepository: { findAdminPage: vi.fn(), lookupForAdmin: vi.fn() },
}));

const ADMIN = { uid: 'uid_admin', email: 'ops@saarthi.com', role: 'admin' };

function booking(overrides: Record<string, unknown> = {}): Booking {
  return {
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
    ...overrides,
  } as unknown as Booking;
}

function get(query = '') {
  return GET(new Request(`http://localhost/api/admin/bookings${query}`));
}

/** The plan the repository was asked to execute. */
function lastPlan() {
  return vi.mocked(firestoreBookingRepository.findAdminPage).mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(ADMIN as never);
  vi.mocked(firestoreBookingRepository.findAdminPage).mockResolvedValue({
    bookings: [booking()],
    hasMore: false,
  });
});

describe('authorization', () => {
  it('answers whatever requireAdmin decided, without querying', async () => {
    // The gate is server-side and total: a non-admin never reaches Firestore.
    for (const status of [401, 403]) {
      vi.mocked(requireAdmin).mockResolvedValue(
        NextResponse.json({ error: 'nope' }, { status }) as never
      );
      const res = await get();
      expect(res.status).toBe(status);
      expect(firestoreBookingRepository.findAdminPage).not.toHaveBeenCalled();
      expect(firestoreBookingRepository.lookupForAdmin).not.toHaveBeenCalled();
    }
  });

  it('checks authorization before validating anything', async () => {
    // Otherwise the 400s become an oracle a signed-out caller can probe.
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: 'nope' }, { status: 401 }) as never
    );
    const res = await get('?status=not_a_group&cursor=garbage');
    expect(res.status).toBe(401);
  });
});

describe('list mode', () => {
  it('returns a page of rows with the filters it applied', async () => {
    const res = await get('?status=confirmed');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.mode).toBe('list');
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].id).toBe('bk_20260903_ABCD1234');
    expect(body.appliedFilters).toEqual({
      status: 'confirmed',
      payment: null,
      therapistId: null,
      date: null,
    });
  });

  it('translates the status group into the query the index serves', async () => {
    await get('?status=closed');
    expect(lastPlan()?.where).toEqual([
      { field: 'status', op: 'in', value: ['cancelled', 'rejected', 'expired', 'no_show'] },
    ]);
    expect(lastPlan()?.index).toBe('bookings(status,createdAt DESC)');
  });

  it('offers a next page only when there is one', async () => {
    vi.mocked(firestoreBookingRepository.findAdminPage).mockResolvedValue({
      bookings: [booking({ id: 'bk_a' }), booking({ id: 'bk_b', createdAt: '2026-08-30T09:00:00.000Z' })],
      hasMore: true,
    });
    const withMore = await (await get()).json();
    expect(withMore.page.hasMore).toBe(true);
    // The cursor is built from the LAST row, so the next page continues from there.
    expect(withMore.page.nextCursor).toBe(`${Date.parse('2026-08-30T09:00:00.000Z')}.bk_b`);

    vi.mocked(firestoreBookingRepository.findAdminPage).mockResolvedValue({
      bookings: [booking()],
      hasMore: false,
    });
    const lastPage = await (await get()).json();
    expect(lastPage.page.hasMore).toBe(false);
    expect(lastPage.page.nextCursor).toBeNull();
  });

  it('withholds the next-page link when the last row cannot produce a cursor', async () => {
    // A row with no createdAt cannot be paged past; a button that reloads the same
    // page forever is worse than no button.
    vi.mocked(firestoreBookingRepository.findAdminPage).mockResolvedValue({
      bookings: [booking({ createdAt: undefined })],
      hasMore: true,
    });
    const body = await (await get()).json();
    expect(body.page.hasMore).toBe(true);
    expect(body.page.nextCursor).toBeNull();
  });

  it('continues from a cursor it previously issued', async () => {
    const cursor = `${Date.parse('2026-08-30T09:00:00.000Z')}.bk_b`;
    await get(`?cursor=${encodeURIComponent(cursor)}`);
    expect(lastPlan()?.startAfter).toEqual({
      createdAtMs: Date.parse('2026-08-30T09:00:00.000Z'),
      id: 'bk_b',
    });
  });

  it('returns an empty page rather than an error when nothing matches', async () => {
    vi.mocked(firestoreBookingRepository.findAdminPage).mockResolvedValue({
      bookings: [],
      hasMore: false,
    });
    const res = await get('?status=closed');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toEqual([]);
    expect(body.page.nextCursor).toBeNull();
  });

  it('sends only the columns the table shows', async () => {
    vi.mocked(firestoreBookingRepository.findAdminPage).mockResolvedValue({
      bookings: [
        booking({
          meetingUrl: 'https://meet.google.com/abc-defg-hij',
          message: 'I have been feeling anxious about work',
          razorpayPaymentId: 'pay_SECRET',
          bookingToken: 'tok_SECRET',
        }),
      ],
      hasMore: false,
    });
    const raw = await (await get()).text();
    expect(raw).toContain('"hasMeetingLink":true');
    expect(raw).not.toContain('meet.google.com');
    expect(raw).not.toContain('anxious');
    expect(raw).not.toContain('SECRET');
  });
});

describe('rejected input', () => {
  it('refuses a filter combination no index serves, and never runs a substitute', async () => {
    const res = await get('?status=confirmed&payment=paid');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('not indexed');
    expect(firestoreBookingRepository.findAdminPage).not.toHaveBeenCalled();
  });

  it('refuses an unknown status or payment group', async () => {
    for (const query of ['?status=teleported', '?payment=half']) {
      const res = await get(query);
      expect(res.status, query).toBe(400);
      expect(firestoreBookingRepository.findAdminPage).not.toHaveBeenCalled();
    }
  });

  it('refuses a page size that is not a plain number in range', async () => {
    for (const query of ['?pageSize=0', '?pageSize=101', '?pageSize=abc', '?pageSize=-5', '?pageSize=2.5']) {
      const res = await get(query);
      expect(res.status, query).toBe(400);
    }
    expect(firestoreBookingRepository.findAdminPage).not.toHaveBeenCalled();
  });

  it('honours a page size it accepts', async () => {
    await get('?pageSize=100');
    expect(lastPlan()?.pageSize).toBe(100);
    expect(lastPlan()?.limit).toBe(101);
  });

  it('refuses a tampered cursor instead of restarting at page one', async () => {
    // Silently starting over is the dangerous behaviour: the operator sees page one
    // again and concludes the remaining bookings do not exist.
    for (const query of ['?cursor=garbage', '?cursor=abc.bk_1', '?cursor=-1.bk_1', '?cursor=1757000000000.']) {
      const res = await get(query);
      expect(res.status, query).toBe(400);
      expect((await res.json()).error).toContain('no longer valid');
    }
    expect(firestoreBookingRepository.findAdminPage).not.toHaveBeenCalled();
  });

  it('refuses a malformed session date', async () => {
    const res = await get('?date=3-9-2026');
    expect(res.status).toBe(400);
    expect(firestoreBookingRepository.findAdminPage).not.toHaveBeenCalled();
  });

  it('treats blank filter values as absent rather than as a filter on empty string', async () => {
    // `?therapistId=` from a cleared select must not query for a therapist whose id
    // is the empty string, which would match nothing and look like "no bookings".
    await get('?therapistId=&date=&q=');
    expect(lastPlan()?.where).toEqual([]);
  });
});

describe('lookup mode', () => {
  beforeEach(() => {
    vi.mocked(firestoreBookingRepository.lookupForAdmin).mockResolvedValue([booking()]);
  });

  it('looks up an exact booking id', async () => {
    const res = await get('?q=bk_20260903_ABCD1234');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('lookup');
    expect(body.lookup.kind).toBe('bookingId');
    expect(firestoreBookingRepository.lookupForAdmin).toHaveBeenCalledWith(
      { kind: 'bookingId', values: ['bk_20260903_ABCD1234'] },
      25
    );
    expect(firestoreBookingRepository.findAdminPage).not.toHaveBeenCalled();
  });

  it('tells the operator what the search actually matched on', async () => {
    // "No results" from a case-sensitive prefix search means something different
    // from "no results" on an exact id, so the response says which one ran.
    const body = await (await get('?q=Ananya')).json();
    expect(body.lookup.kind).toBe('namePrefix');
    expect(body.lookup.matched).toContain('Case-sensitive');
  });

  it('ignores filters during a lookup rather than pretending to combine them', async () => {
    const body = await (await get('?q=ananya@example.com&status=closed')).json();
    expect(body.mode).toBe('lookup');
    expect(body).not.toHaveProperty('appliedFilters');
    expect(firestoreBookingRepository.lookupForAdmin).toHaveBeenCalledWith(
      { kind: 'email', values: ['ananya@example.com'] },
      25
    );
  });

  it('returns lookup results newest first', async () => {
    vi.mocked(firestoreBookingRepository.lookupForAdmin).mockResolvedValue([
      booking({ id: 'bk_old', createdAt: '2026-07-01T00:00:00.000Z' }),
      booking({ id: 'bk_new', createdAt: '2026-09-01T00:00:00.000Z' }),
    ]);
    const body = await (await get('?q=ananya@example.com')).json();
    expect(body.rows.map((r: { id: string }) => r.id)).toEqual(['bk_new', 'bk_old']);
  });

  it('says so when a lookup filled its limit', async () => {
    // A prefix search that returns 25 of an unknown total must not read as "these
    // are all of them".
    vi.mocked(firestoreBookingRepository.lookupForAdmin).mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => booking({ id: `bk_${i}` }))
    );
    const body = await (await get('?q=A')).json();
    expect(body.page.truncated).toBe(true);
    expect(body.page.nextCursor).toBeNull();
  });

  it('does not mark a short lookup as truncated', async () => {
    const body = await (await get('?q=bk_1')).json();
    expect(body.page.truncated).toBe(false);
  });

  it('falls back to the list when the term is only whitespace', async () => {
    const res = await get('?q=%20%20');
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe('list');
    expect(firestoreBookingRepository.lookupForAdmin).not.toHaveBeenCalled();
  });

  it('returns no rows, not an error, when a lookup finds nothing', async () => {
    vi.mocked(firestoreBookingRepository.lookupForAdmin).mockResolvedValue([]);
    const res = await get('?q=bk_does_not_exist');
    expect(res.status).toBe(200);
    expect((await res.json()).rows).toEqual([]);
  });
});

describe('failures and caching', () => {
  it('answers 500 without leaking the Firestore error', async () => {
    // The real shape of a missing-index failure: it names the project and links to
    // the console. That belongs in the server log, not the browser.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(firestoreBookingRepository.findAdminPage).mockRejectedValue(
      new Error(
        '9 FAILED_PRECONDITION: The query requires an index. You can create it here: ' +
          'https://console.firebase.google.com/project/saarthi-prod/firestore/indexes?create_composite=Ck'
      )
    );
    const res = await get('?status=confirmed');
    expect(res.status).toBe(500);
    const raw = await res.text();
    expect(raw).not.toContain('FAILED_PRECONDITION');
    expect(raw).not.toContain('saarthi-prod');
    expect(raw).not.toContain('console.firebase.google.com');
    expect(JSON.parse(raw)).toEqual({
      success: false,
      error: 'We could not load bookings right now. Please try again.',
    });
    // It is still recorded where an engineer can act on it.
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('answers 500 without leaking a failed lookup either', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(firestoreBookingRepository.lookupForAdmin).mockRejectedValue(
      new Error('Firestore backend unavailable for project saarthi-prod')
    );
    const res = await get('?q=bk_1');
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('saarthi-prod');
    consoleError.mockRestore();
  });

  it('never lets a shared cache hold a page of client details', async () => {
    for (const query of ['', '?q=bk_1']) {
      vi.mocked(firestoreBookingRepository.lookupForAdmin).mockResolvedValue([booking()]);
      const res = await get(query);
      expect(res.headers.get('Cache-Control'), query).toBe('private, no-store');
    }
  });
});

