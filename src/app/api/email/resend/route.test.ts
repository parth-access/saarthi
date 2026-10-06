import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * POST /api/email/resend — manual resend of one stored email. Pins: canonical
 * admin auth, the bucket consumed only after auth, 404 for a missing log entry,
 * and a fixed 500 sentence so provider errors never reach a browser.
 */

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/app/api/_lib/rateLimit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ success: true, limit: 10, remaining: 9, reset: 0 }),
  getClientIp: vi.fn().mockReturnValue('test-client-ip'),
}));
vi.mock('../emailSender', () => ({
  resendSavedEmailAction: vi.fn().mockResolvedValue({ success: true }),
}));

import { POST } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { resendSavedEmailAction } from '../emailSender';
import { checkRateLimit } from '@/app/api/_lib/rateLimit';

function post(body: unknown = { emailId: 'email_bk_1_booking-confirmed' }) {
  return POST(
    new Request('http://localhost/api/email/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockReturnValue({ success: true, limit: 10, remaining: 9, reset: 0 });
});

describe('POST /api/email/resend', () => {
  it('blocks unauthenticated callers', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await post();
    expect(res.status).toBe(401);
    expect(resendSavedEmailAction).not.toHaveBeenCalled();
  });

  it('rate-limits after authorization', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(checkRateLimit).mockReturnValue({ success: false, limit: 10, remaining: 0, reset: 0 });
    const res = await post();
    expect(res.status).toBe(429);
    expect(resendSavedEmailAction).not.toHaveBeenCalled();
  });

  it('resends a stored email for an admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await post();
    expect(res.status).toBe(200);
    expect(resendSavedEmailAction).toHaveBeenCalledWith('email_bk_1_booking-confirmed');
  });

  it('requires a string emailId', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    for (const bad of [{}, { emailId: '' }, { emailId: 42 }]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
    }
    expect(resendSavedEmailAction).not.toHaveBeenCalled();
  });

  it('404s when the log entry does not exist', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(resendSavedEmailAction).mockRejectedValue(new Error('Email log not found'));
    const res = await post({ emailId: 'email_missing' });
    expect(res.status).toBe(404);
  });

  it('never leaks a provider error into the 500 body', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(resendSavedEmailAction).mockRejectedValue(new Error('resend: 422 domain disabled'));
    const res = await post();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toContain('422');
    expect(body.error).not.toContain('domain');
  });
});
