import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifySessionMock } = vi.hoisted(() => ({ verifySessionMock: vi.fn() }));

vi.mock('@/lib/firebase/admin', () => ({ adminAuth: {}, adminDb: {} }));
vi.mock('@/lib/auth/verifySession', () => ({ verifySession: verifySessionMock }));
vi.mock('../../_lib/distributedRateLimit', () => ({ checkDistributedRateLimit: vi.fn() }));
vi.mock('../../_lib/rateLimit', () => ({ getClientIp: vi.fn().mockReturnValue('ip') }));

import { GET } from './route';

describe('GET /api/auth/session — role from the session cookie', () => {
  beforeEach(() => verifySessionMock.mockReset());

  it('returns uid and the live role for a valid cookie, never cached', async () => {
    verifySessionMock.mockResolvedValue({ uid: 'u1', role: 'therapist', email: 'a@b.com' });
    const res = await GET(new Request('https://saarthilife.com/api/auth/session'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uid: 'u1', role: 'therapist' });
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('is 401 without a valid session (client falls back to its own read)', async () => {
    verifySessionMock.mockResolvedValue(null);
    const res = await GET(new Request('https://saarthilife.com/api/auth/session'));
    expect(res.status).toBe(401);
  });
});
