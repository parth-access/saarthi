import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as null | { uid: string; email?: string; role?: string },
  byField: {} as Record<string, Array<{ id: string; data: Record<string, unknown> }>>,
  therapists: {} as Record<string, Record<string, unknown>>,
  where: vi.fn(),
}));

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: async () => h.session }));
vi.mock('../../_lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/firebase/admin', () => {
  const docs = (rows: Array<{ id: string; data: Record<string, unknown> }>) => ({ docs: rows.map((r) => ({ id: r.id, data: () => r.data })) });
  return {
    adminDb: {
      collection: (name: string) => ({
        where: (field: string, _op: string, value: string) => {
          h.where(name, field, value);
          return { limit: () => ({ get: async () => docs(h.byField[`${field}=${value}`] ?? []) }) };
        },
        doc: (id: string) => ({ id }),
      }),
      getAll: async (...refs: Array<{ id: string }>) =>
        refs.map((r) => ({ id: r.id, exists: r.id in h.therapists, data: () => h.therapists[r.id] })),
    },
  };
});

import { GET } from './route';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

beforeEach(() => {
  vi.clearAllMocks();
  h.session = { uid: 'u1', role: 'client' };
  h.byField = {};
  h.therapists = {};
});

const get = () => GET(new Request('https://www.saarthilife.com/api/me/bookings'));

describe('GET /api/me/bookings', () => {
  it('rejects a signed-out request', async () => {
    h.session = null;
    expect((await get()).status).toBe(401);
  });

  it("returns the account's bookings, newest first, with their therapists", async () => {
    h.byField['userId=u1'] = [
      { id: 'b1', data: { date: '2026-10-01', therapistId: 't1', status: 'completed', createdAt: ts('2026-09-30T10:00:00Z') } },
      { id: 'b2', data: { date: '2026-11-05', therapistId: 't1', status: 'confirmed' } },
    ];
    h.therapists = { t1: { name: 'Dr. Rao' } };
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = await res.json();
    expect(body.bookings.map((b: { id: string }) => b.id)).toEqual(['b2', 'b1']);
    expect(body.bookings[1].createdAt).toBe('2026-09-30T10:00:00.000Z');
    expect(body.therapists).toEqual({ t1: { id: 't1', name: 'Dr. Rao' } });
  });

  it('only matches by email when the session carries a verified email', async () => {
    await get();
    expect(h.where).toHaveBeenCalledTimes(1);
    expect(h.where).toHaveBeenCalledWith('bookings', 'userId', 'u1');
  });

  it('merges bookings found by uid and by verified email without duplicates', async () => {
    h.session = { uid: 'u1', email: 'Asha@X.com' };
    h.byField['userId=u1'] = [{ id: 'b1', data: { date: '2026-10-01' } }];
    h.byField['email=asha@x.com'] = [{ id: 'b1', data: { date: '2026-10-01' } }, { id: 'guest', data: { date: '2026-09-01' } }];
    const body = await (await get()).json();
    expect(body.bookings.map((b: { id: string }) => b.id)).toEqual(['b1', 'guest']);
  });
});
