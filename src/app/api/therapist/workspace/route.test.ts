import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The therapist workspace's one opening read: the session's own profile and
 * bookings, never anyone else's, and never a client's manage token.
 */
const h = vi.hoisted(() => ({ session: vi.fn(), where: vi.fn(), bookings: vi.fn(), docs: [] as unknown[] }));

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: h.session }));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      where: (...args: unknown[]) => {
        h.where(...args);
        return { limit: () => ({ get: async () => ({ empty: h.docs.length === 0, docs: h.docs }) }) };
      },
    }),
  },
}));
vi.mock('@/server/services/BookingService', () => ({ BookingService: { getBookingsByTherapist: h.bookings } }));
vi.mock('@/app/api/_lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from './route';

const get = () => GET(new Request('http://localhost/api/therapist/workspace?therapistId=th_other'));

beforeEach(() => {
  vi.clearAllMocks();
  h.docs = [{ id: 'th_own', data: () => ({ name: 'Dravina', payoutPercent: 70, authId: 'u1' }) }];
  h.bookings.mockResolvedValue([{ id: 'bk_1', name: 'Client', bookingToken: 'secret', invalidToken: false }]);
});

describe('GET /api/therapist/workspace', () => {
  it('needs a session', async () => {
    h.session.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it('is for therapists only', async () => {
    h.session.mockResolvedValue({ uid: 'u1', role: 'client' });
    expect((await get()).status).toBe(403);
    expect(h.bookings).not.toHaveBeenCalled();
  });

  it("returns the session's own profile and bookings, ignoring any id in the URL", async () => {
    h.session.mockResolvedValue({ uid: 'u1', role: 'therapist' });
    const res = await get();
    const body = await res.json();
    expect(h.where).toHaveBeenCalledWith('authId', '==', 'u1');
    expect(h.bookings).toHaveBeenCalledWith('th_own');
    expect(body.therapist).toMatchObject({ id: 'th_own', name: 'Dravina', payoutPercent: 70 });
    expect(body.bookings).toEqual([{ id: 'bk_1', name: 'Client' }]);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('answers an unlinked account with no profile rather than an error', async () => {
    h.session.mockResolvedValue({ uid: 'u1', role: 'therapist' });
    h.docs = [];
    expect(await (await get()).json()).toEqual({ therapist: null, bookings: [] });
  });
});
