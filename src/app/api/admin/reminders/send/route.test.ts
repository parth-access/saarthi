import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * /api/admin/reminders/send must authorize through the CANONICAL admin source
 * (the users-collection role via requireAdmin), not Firebase custom claims.
 * The route preserves the reminder service's own semantics — skip reasons as
 * 200s, idempotency through reminderStatus — and adds the boundary hardening:
 * the readable-id guard, the bucket consumed only after auth, and a fixed 500
 * sentence instead of a raw error echo.
 */

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/app/api/_lib/rateLimit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ success: true, limit: 10, remaining: 9, reset: 0 }),
  getClientIp: vi.fn().mockReturnValue('test-client-ip'),
}));
vi.mock('@/services/sessionReminderService', () => ({
  SessionReminderService: {
    sendSessionReminder: vi.fn(),
  },
}));

import { POST } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { SessionReminderService } from '@/services/sessionReminderService';
import { checkRateLimit } from '@/app/api/_lib/rateLimit';

const sendMock = vi.mocked(SessionReminderService.sendSessionReminder);

function post(body: unknown = { bookingId: 'bk_1' }) {
  return POST(
    new Request('http://localhost/api/admin/reminders/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockReturnValue({ success: true, limit: 10, remaining: 9, reset: 0 });
  sendMock.mockResolvedValue({ success: true, studentSent: true, therapistSent: true } as never);
});

describe('POST /api/admin/reminders/send — canonical admin authorization', () => {
  it('blocks unauthenticated callers', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await post();
    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('blocks clients and therapists (users-collection role is the authority, not claims)', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Forbidden: Admin role required' }, { status: 403 }));
    const res = await post();
    expect(res.status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rate-limits after authorization, before any work', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(checkRateLimit).mockReturnValue({ success: false, limit: 10, remaining: 0, reset: 0 });
    const res = await post();
    expect(res.status).toBe(429);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('allows an admin and dispatches the reminder', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await post({ bookingId: 'bk_1', force: true });
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledWith('bk_1', { force: true });
  });

  it('requires a readable bookingId', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    for (const bad of [{}, { bookingId: '' }, { bookingId: '../etc' }, { bookingId: 42 }]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('reports a skip as a 200 with its reason, not an error', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    sendMock.mockResolvedValue({
      success: false,
      skippedReason: 'not_yet_due',
      error: 'not_yet_due',
    } as never);
    const res = await post();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; skippedReason: string | null };
    expect(body.success).toBe(false);
    expect(body.skippedReason).toBe('not_yet_due');
  });

  it('answers a hard failure with the fixed sentence, never the raw error', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    sendMock.mockRejectedValue(new Error('gmail smtp exploded with details'));
    const res = await post();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toContain('gmail');
    expect(body.error).not.toContain('exploded');
  });
});
