import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignJWT } from 'jose';
import { verifySession } from './verifySession';
import { middleware } from '../../middleware';
import { NextRequest } from 'next/server';
import { requireAdmin, requireTherapist } from './requireRole';

const { mockGetUserDoc } = vi.hoisted(() => ({
  mockGetUserDoc: vi.fn(),
}));

vi.mock('../firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn().mockRejectedValue(new Error('Invalid token')),
  },
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: (...args: unknown[]) => mockGetUserDoc(...args),
      }),
    }),
  },
}));

describe('JWT Secret Security & Fail-Closed Behavior', () => {
  const originalEnv = process.env.JWT_SECRET;

  beforeEach(() => {
    vi.resetModules();
    mockGetUserDoc.mockReset();
    mockGetUserDoc.mockResolvedValue({
      exists: true,
      data: () => ({ role: 'admin' }),
    });
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.JWT_SECRET = originalEnv;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  it('A. Valid configured JWT_SECRET: session JWT can be signed and verified', async () => {
    process.env.JWT_SECRET = 'super-secret-production-key-12345';
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);

    const token = await new SignJWT({ uid: 'user_123', email: 'user@example.com', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5d')
      .sign(secret);

    // Test verifySession
    const dummyReq = new Request('https://saarthilife.com/api/test', {
      headers: { cookie: `__session=${token}` },
    });
    const sessionInfo = await verifySession(dummyReq);
    expect(sessionInfo).not.toBeNull();
    expect(sessionInfo?.uid).toBe('user_123');
    expect(sessionInfo?.role).toBe('admin');

    // Test middleware
    const nextReq = new NextRequest('https://saarthilife.com/admin', {
      headers: { cookie: `__session=${token}` },
    });
    const res = await middleware(nextReq);
    // Should allow through (no redirect)
    expect(res.headers.get('location')).toBeNull();
  });

  it('B. Missing JWT_SECRET: verification fails and middleware rejects access', async () => {
    delete process.env.JWT_SECRET;

    // Create a token signed with some random key
    const secret = new TextEncoder().encode('some-random-key');
    const token = await new SignJWT({ uid: 'user_123', email: 'user@example.com', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5d')
      .sign(secret);

    // Test verifySession fails
    const dummyReq = new Request('https://saarthilife.com/api/test', {
      headers: { cookie: `__session=${token}` },
    });
    const sessionInfo = await verifySession(dummyReq);
    expect(sessionInfo).toBeNull();

    // Test middleware redirects to login
    const nextReq = new NextRequest('https://saarthilife.com/admin', {
      headers: { cookie: `__session=${token}` },
    });
    const res = await middleware(nextReq);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('C. Known old fallback secret: JWT signed with fallback string is NOT accepted when JWT_SECRET is configured differently', async () => {
    process.env.JWT_SECRET = 'actual-configured-secret-key-999';

    // Attacker signs token with old known fallback secret
    const fallbackSecret = new TextEncoder().encode('fallback-dev-secret-do-not-use-in-prod');
    const forgedToken = await new SignJWT({ uid: 'attacker', email: 'attacker@evil.com', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5d')
      .sign(fallbackSecret);

    // Test verifySession rejects forged token
    const dummyReq = new Request('https://saarthilife.com/api/test', {
      headers: { cookie: `__session=${forgedToken}` },
    });
    const sessionInfo = await verifySession(dummyReq);
    expect(sessionInfo).toBeNull();

    // Test middleware rejects forged token
    const nextReq = new NextRequest('https://saarthilife.com/admin', {
      headers: { cookie: `__session=${forgedToken}` },
    });
    const res = await middleware(nextReq);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('D. Immediate Privilege Revocation: role downgrade from therapist -> client immediately blocks API access', async () => {
    process.env.JWT_SECRET = 'super-secret-production-key-12345';
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);

    // Token claims role 'therapist'
    const token = await new SignJWT({ uid: 'therapist_user', email: 'therapist@example.com', role: 'therapist' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5d')
      .sign(secret);

    // But Firestore now says role is 'client' (role downgraded/revoked)
    mockGetUserDoc.mockResolvedValueOnce({
      exists: true,
      data: () => ({ role: 'client' }),
    });

    const dummyReq = new Request('https://saarthilife.com/api/therapist/profile', {
      headers: { cookie: `__session=${token}` },
    });

    const authResult = await requireTherapist(dummyReq);
    expect(authResult).toBeInstanceOf(Response);
    if (authResult instanceof Response) {
      expect(authResult.status).toBe(403);
    }
  });

  it('E. Immediate Privilege Revocation: role downgrade from admin -> client immediately blocks admin API access', async () => {
    process.env.JWT_SECRET = 'super-secret-production-key-12345';
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);

    // Token claims role 'admin'
    const token = await new SignJWT({ uid: 'ex_admin_user', email: 'admin@example.com', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5d')
      .sign(secret);

    // But Firestore now says role is 'client'
    mockGetUserDoc.mockResolvedValueOnce({
      exists: true,
      data: () => ({ role: 'client' }),
    });

    const dummyReq = new Request('https://saarthilife.com/api/operations/dashboard', {
      headers: { cookie: `__session=${token}` },
    });

    const authResult = await requireAdmin(dummyReq);
    expect(authResult).toBeInstanceOf(Response);
    if (authResult instanceof Response) {
      expect(authResult.status).toBe(403);
    }
  });
});

/**
 * Signed-out navigation safety.
 *
 * Pressing Back after logout must never reveal protected content, and /login
 * must always be servable without a session — otherwise the guard that bounces
 * a protected URL to /login would bounce /login to itself and the user could
 * never get back to a public page.
 */
describe('middleware: signed-out navigation', () => {
  const PROTECTED = [
    '/dashboard',
    '/dashboard/bookings',
    '/admin/bookings/bk_20260915_3B221AE5',
    '/therapist/bookings/bk_20260915_3B221AE5',
  ];

  it('F. redirects every signed-out protected URL to /login, so Back exposes nothing', async () => {
    for (const path of PROTECTED) {
      const res = await middleware(new NextRequest(`https://saarthilife.com${path}`));
      expect(res.headers.get('location')).toContain('/login');
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
    }
  });

  it('G. serves /login without redirecting, so the escape route cannot loop', async () => {
    const res = await middleware(new NextRequest('https://saarthilife.com/login'));

    expect(res.headers.get('location')).toBeNull();
  });

  it('H. clears a stale session cookie on /login instead of bouncing the user', async () => {
    process.env.JWT_SECRET = 'super-secret-production-key-12345';

    const res = await middleware(
      new NextRequest('https://saarthilife.com/login', {
        headers: { cookie: '__session=not-a-valid-jwt' },
      })
    );

    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('set-cookie') ?? '').toContain('__session=');
  });
});

describe('Session kill-switch (sessionRevokeBefore)', () => {
  const originalEnv = process.env.JWT_SECRET;

  beforeEach(() => {
    vi.resetModules();
    mockGetUserDoc.mockReset();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.JWT_SECRET = originalEnv;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  async function makeToken() {
    process.env.JWT_SECRET = 'super-secret-production-key-12345';
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    return new SignJWT({ uid: 'user_123', email: 'user@example.com', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5d')
      .sign(secret);
  }

  const requestWith = (token: string) =>
    new Request('https://saarthilife.com/api/test', { headers: { cookie: `__session=${token}` } });

  it('rejects a session issued BEFORE the revocation mark (stolen cookie kill-switch)', async () => {
    const token = await makeToken();
    // Epoch seconds far in the future: every token issued now predates it.
    mockGetUserDoc.mockResolvedValue({
      exists: true,
      data: () => ({ role: 'admin', sessionRevokeBefore: 4_102_444_800 }), // 2100-01-01
    });

    expect(await verifySession(requestWith(token))).toBeNull();
  });

  it('accepts a session issued AFTER the revocation mark (user can sign back in)', async () => {
    const token = await makeToken();
    mockGetUserDoc.mockResolvedValue({
      exists: true,
      data: () => ({ role: 'admin', sessionRevokeBefore: 1_000 }), // epoch of 1970: already passed
    });

    const session = await verifySession(requestWith(token));
    expect(session).not.toBeNull();
    expect(session?.role).toBe('admin');
  });

  it('does not revoke when no revocation mark is set', async () => {
    const token = await makeToken();
    mockGetUserDoc.mockResolvedValue({ exists: true, data: () => ({ role: 'admin' }) });

    expect(await verifySession(requestWith(token))).not.toBeNull();
  });

  it('fails closed for tokens without an iat claim when a mark is set', async () => {
    process.env.JWT_SECRET = 'super-secret-production-key-12345';
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new SignJWT({ uid: 'user_123', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('5d')
      .sign(secret);
    mockGetUserDoc.mockResolvedValue({
      exists: true,
      data: () => ({ role: 'admin', sessionRevokeBefore: 4_102_444_800 }),
    });

    expect(await verifySession(requestWith(token))).toBeNull();
  });
});
