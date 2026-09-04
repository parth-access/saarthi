import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from './route';
import { verifySession } from '@/lib/auth/verifySession';
import { firestoreBookingRepository, Booking } from '@/domains/booking';

/**
 * Reschedule-availability regression tests. A booking being rescheduled (the
 * `excludeBookingId` caller) must not see its own reservation as somebody
 * else's `booked`/`locked` slot — but its own current date/time must NOT be
 * offered as a destination either: a session cannot be rescheduled to where it
 * already is. The booking here holds 2026-09-02 09:00, so on that day 09:00 is
 * excluded for the owner while every other slot stays offerable.
 *
 * They also pin the two rules that used to live outside this route: the IST
 * temporal partition (a slot is `past` / `beyondWindow`, not simply missing) and
 * the authorization on `excludeBookingId`.
 */

/** 2026-09-01 19:15 IST === 2026-09-01T13:45:00Z — the moment from the report. */
const SEP_1_1915_IST = new Date('2026-09-01T13:45:00.000Z');

type Doc = { id: string; data: Record<string, unknown> };

const h = vi.hoisted(() => ({
  state: {
    rules: [] as { id: string; data: Record<string, unknown> }[],
    overrides: [] as { id: string; data: Record<string, unknown> }[],
    lockedSlots: [] as { id: string; data: Record<string, unknown> }[],
    therapistDoc: { exists: false, data: () => ({}) as Record<string, unknown> },
    deletedLocks: [] as string[],
  },
}));

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: vi.fn() }));

vi.mock('@/domains/booking', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domains/booking')>();
  return {
    ...actual,
    firestoreBookingRepository: {
      findById: vi.fn(),
      findActiveBookingsByTherapistAndDate: vi.fn(),
    },
  };
});

vi.mock('@/lib/firebase/admin', () => {
  const snap = (docs: { id: string; data: Record<string, unknown> }[]) => ({
    docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
  });

  return {
    adminDb: {
      collection: (name: string) => {
        if (name === 'therapistAvailability') {
          return {
            doc: () => ({
              collection: (sub: string) => ({
                get: async () => snap(sub === 'recurringRules' ? h.state.rules : h.state.overrides),
              }),
            }),
          };
        }
        if (name === 'locked_slots') {
          return {
            where: () => ({ where: () => ({ get: async () => snap(h.state.lockedSlots) }) }),
            doc: (id: string) => ({
              delete: async () => {
                h.state.deletedLocks.push(id);
              },
            }),
          };
        }
        if (name === 'therapists') {
          return { doc: () => ({ get: async () => h.state.therapistDoc }) };
        }
        throw new Error(`unexpected collection: ${name}`);
      },
    },
  };
});

const THERAPIST = 'th_1';

/** The therapist's real production cadence: 45-minute steps, no cooldown. */
const rule = (dayOfWeek: number, startTime: string, endTime: string, breaks: unknown[] = []): Doc => ({
  id: `rule_${dayOfWeek}`,
  data: { therapistId: THERAPIST, dayOfWeek, isActive: true, startTime, endTime, slotDuration: 45, cooldownGap: 0, breaks },
});

const booking = (over: Partial<Booking> = {}) =>
  new Booking({
    id: 'bk_1',
    therapistId: THERAPIST,
    userId: 'client_1',
    email: 'client@example.com',
    date: '2026-09-02',
    time: '09:00',
    status: 'confirmed',
    ...over,
  });

const call = (params: Record<string, string>) =>
  GET(new Request(`http://localhost/api/availability?${new URLSearchParams(params).toString()}`));

const json = async (res: Response) => res.json();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SEP_1_1915_IST);
  h.state.rules = [];
  h.state.overrides = [];
  h.state.lockedSlots = [];
  h.state.therapistDoc = { exists: false, data: () => ({}) };
  h.state.deletedLocks = [];
  vi.mocked(firestoreBookingRepository.findActiveBookingsByTherapistAndDate).mockResolvedValue([]);
  vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(null);
  vi.mocked(verifySession).mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Exactly the grid the user reported seeing, plus the 09:00 that went missing. */
const FULL_WED_GRID = ['09:00', '09:45', '10:30', '13:00', '13:45', '14:30', '15:15', '16:00'];

describe('GET /api/availability — reschedule targets exclude the booking\'s current slot', () => {
  beforeEach(() => {
    // Wednesday 09:00-17:00 with a 11:30-13:00 break.
    h.state.rules = [rule(3, '09:00', '17:00', [{ startTime: '11:30', endTime: '13:00' }])];
  });

  it('reports a booking as booked to everyone else', async () => {
    vi.mocked(firestoreBookingRepository.findActiveBookingsByTherapistAndDate).mockResolvedValue([booking()]);

    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-02' }));

    expect(body.bookedTimes).toEqual(['09:00']);
    expect(body.availableSlots).not.toContain('09:00');
    expect(body.availableSlots).toEqual(FULL_WED_GRID.filter((t) => t !== '09:00'));
  });

  it("does not offer a booking's own current slot to itself as a reschedule target", async () => {
    // The booking being rescheduled holds 09:00 and pins it permanently, and is
    // returned by findActiveBookingsByTherapistAndDate because 'confirmed' is an
    // active status. For its own reschedule the booking must not count as a
    // competing booked/locked slot — but 09:00 is also not a valid destination.
    const own = booking();
    vi.mocked(firestoreBookingRepository.findActiveBookingsByTherapistAndDate).mockResolvedValue([own]);
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(own);
    vi.mocked(verifySession).mockResolvedValue({ uid: 'client_1', email: 'client@example.com', role: 'client' });
    h.state.lockedSlots = [
      { id: `${THERAPIST}_2026-09-02_09:00`, data: { time: '09:00', bookingId: 'bk_1', isPermanent: true, status: 'booked' } },
    ];

    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-02', excludeBookingId: 'bk_1' }));

    expect(body.availableSlots).not.toContain('09:00');
    expect(body.availableSlots).toEqual(FULL_WED_GRID.filter((t) => t !== '09:00'));
    // Its own reservation is not mislabelled as somebody else's either.
    expect(body.bookedTimes).toEqual([]);
    expect(body.lockedTimes).toEqual([]);
    expect(body.pastTimes).toEqual([]);
    expect(body.beyondWindowTimes).toEqual([]);
  });

  it('offers 09:00 as a reschedule target on days the booking does not occupy', async () => {
    // 2026-09-09 is the next Wednesday: the booking sits on 2026-09-02, so on
    // 09-09 the same wall-clock time is a perfectly valid new destination.
    const own = booking();
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(own);
    vi.mocked(verifySession).mockResolvedValue({ uid: 'client_1', email: 'client@example.com', role: 'client' });

    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-09', excludeBookingId: 'bk_1' }));

    expect(body.availableSlots).toContain('09:00');
    expect(body.availableSlots).toEqual(FULL_WED_GRID);
  });

  it('still blocks a DIFFERENT booking while excluding this one', async () => {
    const own = booking();
    vi.mocked(firestoreBookingRepository.findActiveBookingsByTherapistAndDate).mockResolvedValue([
      own,
      booking({ id: 'bk_other', userId: 'client_2', time: '13:00' }),
    ]);
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(own);
    vi.mocked(verifySession).mockResolvedValue({ uid: 'client_1', email: 'client@example.com', role: 'client' });

    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-02', excludeBookingId: 'bk_1' }));

    expect(body.bookedTimes).toEqual(['13:00']);
    expect(body.availableSlots).not.toContain('09:00');
    expect(body.availableSlots).not.toContain('13:00');
  });
});

describe('IST temporal partition (server-side, not per-component)', () => {
  beforeEach(() => {
    // Tuesday 09:00-21:00. 2026-09-01 and 2026-09-15 are both Tuesdays, so the
    // same rule exercises the same-day rule and the window edge.
    h.state.rules = [rule(2, '09:00', '21:00')];
  });

  it('excludes same-day slots that have already started and keeps the later ones', async () => {
    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-01' }));

    // now = 19:15 IST: 18:45 has started, 19:30 has not.
    expect(body.pastTimes).toContain('09:00');
    expect(body.pastTimes).toContain('18:45');
    expect(body.pastTimes).not.toContain('19:30');
    expect(body.availableSlots).toEqual(['19:30', '20:15']);
  });

  it('applies the booking window as a rolling instant, not a whole calendar day', async () => {
    // now + 14d = 2026-09-15 19:15 IST, so the late slots on the final day fall
    // outside the window even though the day itself is offered.
    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-15' }));

    expect(body.beyondWindowTimes).toEqual(['19:30', '20:15']);
    expect(body.availableSlots).toContain('09:00');
    expect(body.availableSlots).toContain('18:45');
    expect(body.availableSlots).not.toContain('19:30');
  });

  it('offers nothing beyond the window', async () => {
    h.state.rules = [rule(3, '09:00', '17:00')];
    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-16' }));

    expect(body.availableSlots).toEqual([]);
    expect(body.beyondWindowTimes.length).toBeGreaterThan(0);
  });

  it('offers nothing for an impossible calendar date that passes the shape check', async () => {
    // '2026-13-45' matches /^\d{4}-\d{2}-\d{2}$/ but is not a real day; the IST
    // conversion refuses it, so every generated start is unofferable rather than
    // silently rolling into 2027-01-14.
    const body = await json(await call({ therapistId: THERAPIST, date: '2026-13-45' }));
    expect(body.availableSlots).toEqual([]);
  });
});

describe('excludeBookingId authorization', () => {
  const DENIED = 'You are not allowed to view availability for this session.';

  beforeEach(() => {
    h.state.rules = [rule(3, '09:00', '17:00')];
  });

  it('lists availability anonymously when no exclusion is requested', async () => {
    // The public booking wizard must keep working without a session.
    const res = await call({ therapistId: THERAPIST, date: '2026-09-02' });
    expect(res.status).toBe(200);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('requires a session to exclude a booking', async () => {
    const res = await call({ therapistId: THERAPIST, date: '2026-09-02', excludeBookingId: 'bk_1' });
    expect(res.status).toBe(401);
  });

  it('returns the same 403 for an unknown id and an unowned id (no existence oracle)', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'client_9', email: 'nine@example.com', role: 'client' });

    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(null);
    const unknown = await call({ therapistId: THERAPIST, date: '2026-09-02', excludeBookingId: 'bk_missing' });

    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking());
    const unowned = await call({ therapistId: THERAPIST, date: '2026-09-02', excludeBookingId: 'bk_1' });

    expect(unknown.status).toBe(403);
    expect(unowned.status).toBe(403);
    expect((await json(unknown)).error).toBe(DENIED);
    expect((await json(unowned)).error).toBe(DENIED);
  });

  it('allows the owner identified by verified email alone', async () => {
    // Bookings created before sign-in carry an email but no uid.
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking({ userId: undefined }));
    vi.mocked(verifySession).mockResolvedValue({ uid: 'other_uid', email: 'CLIENT@example.com', role: 'client' });

    const res = await call({ therapistId: THERAPIST, date: '2026-09-02', excludeBookingId: 'bk_1' });
    expect(res.status).toBe(200);
  });

  it('allows an admin', async () => {
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking());
    vi.mocked(verifySession).mockResolvedValue({ uid: 'admin_1', email: 'ops@saarthi.com', role: 'admin' });

    const res = await call({ therapistId: THERAPIST, date: '2026-09-02', excludeBookingId: 'bk_1' });
    expect(res.status).toBe(200);
  });

  it('allows the assigned therapist and refuses any other therapist', async () => {
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking());
    vi.mocked(verifySession).mockResolvedValue({ uid: 'th_auth_1', email: 't@saarthi.com', role: 'therapist' });

    h.state.therapistDoc = { exists: true, data: () => ({ authId: 'th_auth_1' }) };
    expect((await call({ therapistId: THERAPIST, date: '2026-09-02', excludeBookingId: 'bk_1' })).status).toBe(200);

    h.state.therapistDoc = { exists: true, data: () => ({ authId: 'someone_else' }) };
    expect((await call({ therapistId: THERAPIST, date: '2026-09-02', excludeBookingId: 'bk_1' })).status).toBe(403);
  });
});

describe('locks, overrides and input validation', () => {
  const future = { toMillis: () => SEP_1_1915_IST.getTime() + 5 * 60_000 };
  const stale = { toMillis: () => SEP_1_1915_IST.getTime() - 60_000 };

  beforeEach(() => {
    h.state.rules = [rule(3, '09:00', '17:00')];
  });

  it("reports someone else's live checkout as locked", async () => {
    h.state.lockedSlots = [{ id: 'l1', data: { time: '09:45', expiresAt: future } }];

    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-02' }));

    expect(body.lockedTimes).toEqual(['09:45']);
    expect(body.availableSlots).not.toContain('09:45');
  });

  it('cleans up an expired lock instead of blocking on it', async () => {
    h.state.lockedSlots = [
      { id: 'l_stale', data: { time: '09:45', expiresAt: stale } },
      { id: 'l_orphan', data: { time: '10:30' } }, // no expiresAt at all
    ];

    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-02' }));

    expect(body.lockedTimes).toEqual([]);
    expect(body.availableSlots).toContain('09:45');
    expect(body.availableSlots).toContain('10:30');
    expect(h.state.deletedLocks).toEqual(['l_stale', 'l_orphan']);
  });

  it('does not double-count a permanent pin as both booked and locked', async () => {
    vi.mocked(firestoreBookingRepository.findActiveBookingsByTherapistAndDate).mockResolvedValue([booking()]);
    h.state.lockedSlots = [{ id: 'l1', data: { time: '09:00', isPermanent: true, bookingId: 'bk_1' } }];

    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-02' }));

    expect(body.bookedTimes).toEqual(['09:00']);
    expect(body.lockedTimes).toEqual([]);
    expect(h.state.deletedLocks).toEqual([]);
  });

  it('offers nothing on a blocked day but still reports what is taken', async () => {
    h.state.overrides = [{ id: 'o1', data: { date: '2026-09-02', type: 'blocked' } }];
    vi.mocked(firestoreBookingRepository.findActiveBookingsByTherapistAndDate).mockResolvedValue([booking()]);

    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-02' }));

    expect(body.availableSlots).toEqual([]);
    expect(body.bookedTimes).toEqual(['09:00']);
  });

  it('uses an availability override in place of the recurring rule', async () => {
    h.state.overrides = [
      { id: 'o1', data: { date: '2026-09-02', type: 'available', startTime: '18:00', endTime: '20:00', slotDuration: 60, cooldownGap: 0 } },
    ];

    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-02' }));

    expect(body.availableSlots).toEqual(['18:00', '19:00']);
  });

  it('rejects a missing or malformed date', async () => {
    expect((await call({ therapistId: THERAPIST })).status).toBe(400);
    expect((await call({ date: '2026-09-02' })).status).toBe(400);
    expect((await call({ therapistId: THERAPIST, date: '2026-9-2' })).status).toBe(400);
    expect((await call({ therapistId: THERAPIST, date: '02-09-2026' })).status).toBe(400);
  });

  it('treats a therapist with no configured rules as having no slots', async () => {
    h.state.rules = [];
    const body = await json(await call({ therapistId: THERAPIST, date: '2026-09-02' }));
    expect(body.availableSlots).toEqual([]);
  });
});
