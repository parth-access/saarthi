import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * NEXT_PUBLIC_AUTH_PROVIDER=better-auth: verifySession, the page middleware and the
 * /api/auth/[...all] mount read Better Auth instead of Firebase.
 */
const { mockGetSession, mockGetUserDoc } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetUserDoc: vi.fn(),
}));

vi.mock('./betterAuth', () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock('../firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn().mockRejectedValue(new Error('not a Firebase token')) },
  adminDb: { collection: () => ({ doc: () => ({ get: mockGetUserDoc }) }) },
}));

import { verifySession } from './verifySession';
import { middleware } from '../../middleware';
import { GET as authRouteGet } from '../../app/api/auth/[...all]/route';

function sessionFor(user: Record<string, unknown>) {
  return { session: { id: 's1' }, user: { id: 'uid_1', email: 'a@example.com', emailVerified: true, role: 'client', banned: false, ...user } };
}

const req = (path = '/api/test') => new Request(`https://www.saarthilife.com${path}`, { headers: { cookie: 'better-auth.session_token=signed' } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'better-auth';
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_AUTH_PROVIDER;
});

describe('verifySession (better-auth)', () => {
  it('returns uid, verified email and live role', async () => {
    mockGetSession.mockResolvedValue(sessionFor({ role: 'therapist' }));
    expect(await verifySession(req())).toEqual({ uid: 'uid_1', email: 'a@example.com', role: 'therapist' });
  });

  it('bypasses the cookie cache so bans apply immediately', async () => {
    mockGetSession.mockResolvedValue(sessionFor({}));
    await verifySession(req());
    expect(mockGetSession).toHaveBeenCalledWith(expect.objectContaining({ query: { disableCookieCache: true } }));
  });

  it('withholds an unverified email', async () => {
    mockGetSession.mockResolvedValue(sessionFor({ emailVerified: false }));
    expect((await verifySession(req()))?.email).toBeUndefined();
  });

  it('defaults a missing role to client', async () => {
    mockGetSession.mockResolvedValue(sessionFor({ role: null }));
    expect((await verifySession(req()))?.role).toBe('client');
  });

  it('refuses no session, banned users, and lookup errors', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    expect(await verifySession(req())).toBeNull();
    mockGetSession.mockResolvedValueOnce(sessionFor({ banned: true }));
    expect(await verifySession(req())).toBeNull();
    mockGetSession.mockRejectedValueOnce(new Error('db down'));
    expect(await verifySession(req())).toBeNull();
  });

  it('never consults Firebase in this mode', async () => {
    mockGetSession.mockResolvedValue(null);
    await verifySession(new Request('https://x.test/api', { headers: { Authorization: 'Bearer firebase-id-token' } }));
    expect(mockGetUserDoc).not.toHaveBeenCalled();
  });
});

describe('middleware (better-auth)', () => {
  const nav = (path: string) => middleware(new NextRequest(`https://www.saarthilife.com${path}`));

  it('sends signed-out visitors to login with a return path', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await nav('/dashboard/bookings');
    expect(res.headers.get('location')).toContain('/login');
  });

  it('keeps clients out of admin and therapist pages', async () => {
    mockGetSession.mockResolvedValue(sessionFor({ role: 'client' }));
    expect(new URL((await nav('/admin'))!.headers.get('location')!).pathname).toBe('/dashboard');
    expect(new URL((await nav('/therapist'))!.headers.get('location')!).pathname).toBe('/dashboard');
  });

  it('lets admins and therapists through to their areas', async () => {
    mockGetSession.mockResolvedValue(sessionFor({ role: 'admin' }));
    expect((await nav('/admin')).headers.get('location')).toBeNull();
    mockGetSession.mockResolvedValue(sessionFor({ role: 'therapist' }));
    expect((await nav('/therapist')).headers.get('location')).toBeNull();
  });

  it('treats a banned user as signed out', async () => {
    mockGetSession.mockResolvedValue(sessionFor({ role: 'admin', banned: true }));
    expect((await nav('/admin')).headers.get('location')).toContain('/login');
  });

  it('leaves /login alone', async () => {
    expect((await nav('/login')).headers.get('location')).toBeNull();
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});

describe('/api/auth/[...all]', () => {
  it('answers 404 while Firebase is still the provider', async () => {
    delete process.env.NEXT_PUBLIC_AUTH_PROVIDER;
    const res = await authRouteGet(req('/api/auth/get-session'));
    expect(res.status).toBe(404);
  });
});
