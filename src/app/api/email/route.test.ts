import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * Security contract of the email dispatch API (post-P1-2 remediation):
 *   - EVERY send type requires a therapist/admin session — there are no
 *     unauthenticated types;
 *   - only booking-confirmed / booking-declined are accepted at all (the other
 *     transactional emails are server-internal);
 *   - client-supplied bookingDetails are stripped before reaching the sender —
 *     the booking is resolved server-side;
 *   - the endpoint is rate-limited.
 */

vi.mock('./emailSender', () => ({ sendEmailAction: vi.fn().mockResolvedValue({ success: true }) }));

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }),
  },
}));

import { POST, GET } from './route';
import { sendEmailAction } from './emailSender';
import { verifySession } from '@/lib/auth/verifySession';
import { requireAdmin } from '@/lib/auth/requireRole';

let ipCounter = 0;

function post(body: unknown, ip?: string) {
  const uniqueIp = ip ?? `203.0.113.${++ipCounter}`;
  return POST(
    new Request('http://localhost/api/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // rightmost entry is the trusted edge value used as the bucket key
        'x-forwarded-for': `10.9.9.9, ${uniqueIp}`,
      },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendEmailAction).mockResolvedValue({ success: true } as never);
  vi.mocked(verifySession).mockResolvedValue(null);
  vi.mocked(requireAdmin).mockResolvedValue({ uid: 'admin_1', role: 'admin' } as never);
});

describe('POST /api/email — authentication', () => {
  it('401s an unauthenticated booking-confirmed request (no anonymous types remain)', async () => {
    const res = await post({ type: 'booking-confirmed', bookingId: 'bk_1', therapistId: 'th_1' });
    expect(res.status).toBe(401);
    expect(sendEmailAction).not.toHaveBeenCalled();
  });

  it('403s an authenticated client (non-therapist/admin role)', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'user_1', role: 'client' });
    const res = await post({ type: 'booking-confirmed', bookingId: 'bk_1', therapistId: 'th_1' });
    expect(res.status).toBe(403);
    expect(sendEmailAction).not.toHaveBeenCalled();
  });

  it('allows a therapist to resend booking-confirmed', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'th_user_1', role: 'therapist' });
    const res = await post({ type: 'booking-confirmed', bookingId: 'bk_1', therapistId: 'th_1' });
    expect(res.status).toBe(200);
    expect(sendEmailAction).toHaveBeenCalledTimes(1);
  });

  it('allows an admin to resend booking-declined', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'admin_1', role: 'admin' });
    const res = await post({ type: 'booking-declined', bookingId: 'bk_1', therapistId: 'th_1', declineReason: 'unavailable' });
    expect(res.status).toBe(200);
    expect(sendEmailAction).toHaveBeenCalledWith({ type: 'booking-declined', bookingId: 'bk_1', therapistId: 'th_1', declineReason: 'unavailable' });
  });
});

describe('POST /api/email — type allowlist', () => {
  it.each([
    'booking-received',
    'booking-rescheduled',
    'therapist-notification',
    'payment-receipt',
    'payment-failed',
    'session-reminder',
    'session-completed',
    'reconnect-request',
  ])('rejects %s even with a valid therapist session', async (type) => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'th_user_1', role: 'therapist' });
    const res = await post({ type, bookingId: 'bk_1', therapistId: 'th_1' });
    expect(res.status).toBe(400);
    expect(sendEmailAction).not.toHaveBeenCalled();
  });
});

describe('POST /api/email — no client-controlled email data', () => {
  it('strips client-supplied bookingDetails before the sender sees the payload', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'admin_1', role: 'admin' });
    const res = await post({
      type: 'booking-confirmed',
      bookingId: 'bk_1',
      therapistId: 'th_1',
      bookingDetails: { name: 'Evil', email: 'attacker@example.com', date: '2026-01-01', time: '10:00' },
    });
    expect(res.status).toBe(200);
    const forwarded = vi.mocked(sendEmailAction).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(forwarded.bookingDetails).toBeUndefined();
  });

  it('rejects a payload without a bookingId', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'admin_1', role: 'admin' });
    const res = await post({ type: 'booking-confirmed', therapistId: 'th_1' });
    expect(res.status).toBe(400);
    expect(sendEmailAction).not.toHaveBeenCalled();
  });
});

describe('POST /api/email — rate limiting', () => {
  it('429s after the configured burst from one IP', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'th_user_1', role: 'therapist' });
    const ip = `198.51.100.${++ipCounter}`;
    let lastRes: Response | undefined;
    for (let i = 0; i < 12; i++) {
      lastRes = await post({ type: 'booking-confirmed', bookingId: 'bk_1', therapistId: 'th_1' }, ip);
    }
    expect(lastRes!.status).toBe(429);
  });
});

describe('GET /api/email — admin-only logs', () => {
  it('refuses non-admin callers', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    const res = await GET(new Request('http://localhost/api/email'));
    expect(res.status).toBe(403);
  });

  it('returns email logs for an admin', async () => {
    const res = await GET(new Request('http://localhost/api/email'));
    expect(res.status).toBe(200);
  });
});
