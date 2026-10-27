import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as null | { uid: string; email?: string },
  userDoc: null as null | Record<string, unknown>,
  bookings: [] as Array<Record<string, unknown>>,
  set: vi.fn(),
  getUser: vi.fn(),
  listUserAccounts: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: async () => h.session }));
vi.mock('../../_lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/auth/betterAuth', () => ({ auth: { api: { listUserAccounts: h.listUserAccounts, updateUser: h.updateUser } } }));
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { getUser: h.getUser },
  adminDb: {
    collection: (name: string) =>
      name === 'users'
        ? { doc: () => ({ get: async () => ({ exists: h.userDoc !== null, data: () => h.userDoc }), set: h.set }) }
        : { where: () => ({ limit: () => ({ get: async () => ({ docs: h.bookings.map((d) => ({ data: () => d })) }) }) }) },
  },
}));

import { GET, PATCH } from './route';

const url = 'https://www.saarthilife.com/api/me/profile';
const patch = (body: unknown) => PATCH(new Request(url, { method: 'PATCH', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  h.session = { uid: 'u1' };
  h.userDoc = null;
  h.bookings = [];
  h.set.mockResolvedValue(undefined);
  h.getUser.mockResolvedValue({ providerData: [{ providerId: 'password' }] });
  h.listUserAccounts.mockResolvedValue([{ providerId: 'google' }]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/me/profile', () => {
  it('rejects a signed-out request', async () => {
    h.session = null;
    expect((await GET(new Request(url))).status).toBe(401);
  });

  it('returns the stored profile and whether the account uses a password', async () => {
    h.userDoc = { name: 'Asha', phone: '98', bio: 'hi', role: 'admin' };
    const body = await (await GET(new Request(url))).json();
    expect(body).toEqual({ name: 'Asha', phone: '98', bio: 'hi', usesPassword: true });
  });

  it('falls back to the latest booking under a verified email', async () => {
    h.session = { uid: 'u1', email: 'a@x.com' };
    h.bookings = [
      { name: 'Old', phone: '1', createdAt: { toMillis: () => 1 } },
      { name: 'New', phone: '2', createdAt: { toMillis: () => 2 } },
    ];
    const body = await (await GET(new Request(url))).json();
    expect(body).toMatchObject({ name: 'New', phone: '2' });
  });

  it('asks Better Auth for the sign-in methods when it is the provider', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_PROVIDER', 'better-auth');
    const body = await (await GET(new Request(url))).json();
    expect(body.usesPassword).toBe(false);
    expect(h.getUser).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/me/profile', () => {
  it('saves trimmed name, phone and bio, and nothing else', async () => {
    const res = await patch({ name: ' Asha ', phone: ' 98 ', bio: 'b', role: 'admin' });
    expect(res.status).toBe(200);
    expect(h.set).toHaveBeenCalledWith(expect.objectContaining({ name: 'Asha', phone: '98', bio: 'b' }), { merge: true });
    expect(h.set.mock.calls[0][0]).not.toHaveProperty('role');
  });

  it('refuses an over-long field', async () => {
    const res = await patch({ name: 'x'.repeat(101) });
    expect(res.status).toBe(400);
    expect(h.set).not.toHaveBeenCalled();
  });

  it('refuses a non-string field', async () => {
    expect((await patch({ phone: 12345 })).status).toBe(400);
  });

  it('keeps the Better Auth display name in step', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_PROVIDER', 'better-auth');
    await patch({ name: 'Asha R' });
    expect(h.updateUser).toHaveBeenCalledWith(expect.objectContaining({ body: { name: 'Asha R' } }));
  });
});
