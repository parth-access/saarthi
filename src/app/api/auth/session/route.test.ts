import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';

/**
 * The session-mint gate for disabled accounts. The console's disable action
 * sets `accountDisabled` plus a `sessionRevokeBefore` mark; this endpoint is
 * what stops the person simply signing in again afterwards.
 */
const { mockGetUserDoc } = vi.hoisted(() => ({
  mockGetUserDoc: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'user_123', email: 'p@example.com' }),
  },
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: (...args: unknown[]) => mockGetUserDoc(...args),
      }),
    }),
  },
}));

vi.mock('../../_lib/distributedRateLimit', () => ({
  checkDistributedRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 20, remaining: 19, reset: 0 }),
}));
vi.mock('../../_lib/rateLimit', () => ({ getClientIp: vi.fn().mockReturnValue('test-client-ip') }));

const originalEnv = process.env.JWT_SECRET;

beforeEach(() => {
  mockGetUserDoc.mockReset();
  mockGetUserDoc.mockResolvedValue({ exists: true, data: () => ({ role: 'client' }) });
});

afterEach(() => {
  if (originalEnv !== undefined) {
    process.env.JWT_SECRET = originalEnv;
  } else {
    delete process.env.JWT_SECRET;
  }
});

async function mintRequest() {
  process.env.JWT_SECRET = 'super-secret-production-key-12345';
  // A stand-in ID token: the route only hands it to verifyIdToken, which the
  // mock resolves, so any non-empty string works.
  return new Request('http://localhost/api/auth/session', {
    method: 'POST',
    body: JSON.stringify({ idToken: 'raw-firebase-id-token' }),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/auth/session', () => {
  it('mints a session cookie for an enabled account', async () => {
    const response = await POST(await mintRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie') ?? '').toContain('__session=');
  });

  it('refuses to mint a session for a disabled account', async () => {
    mockGetUserDoc.mockResolvedValue({
      exists: true,
      data: () => ({ role: 'client', accountDisabled: true }),
    });

    const response = await POST(await mintRequest());
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect((await response.json()).error).toContain('disabled');
  });

  it('answers a disabled account with the honest sentence, not a generic 500', async () => {
    mockGetUserDoc.mockResolvedValue({
      exists: true,
      data: () => ({ role: 'client', accountDisabled: true }),
    });

    const response = await POST(await mintRequest());
    expect((await response.json()).error).toContain('Contact the practice');
  });

  it('mints with the account\'s live role, whatever the token claims', async () => {
    mockGetUserDoc.mockResolvedValue({ exists: true, data: () => ({ role: 'admin' }) });

    const response = await POST(await mintRequest());
    const cookie = response.headers.get('set-cookie') ?? '';
    const token = cookie.match(/__session=([^;]+)/)?.[1] ?? '';
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
    const { jwtVerify } = await import('jose');
    const { payload } = await jwtVerify(token, secret);
    expect(payload.role).toBe('admin');
  });
});
