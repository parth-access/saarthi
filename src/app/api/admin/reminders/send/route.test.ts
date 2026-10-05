import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * /api/admin/reminders/send must authorize through the CANONICAL admin source
 * (the users-collection role via requireAdmin), not Firebase custom claims.
 */

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/services/sessionReminderService', () => ({
  SessionReminderService: {
    sendSessionReminder: vi.fn().mockResolvedValue({ success: true, studentSent: true, therapistSent: true }),
  },
}));

import { POST } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { SessionReminderService } from '@/services/sessionReminderService';

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
});

describe('POST /api/admin/reminders/send — canonical admin authorization', () => {
  it('blocks unauthenticated callers', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await post();
    expect(res.status).toBe(401);
    expect(SessionReminderService.sendSessionReminder).not.toHaveBeenCalled();
  });

  it('blocks clients and therapists (users-collection role is the authority, not claims)', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Forbidden: Admin role required' }, { status: 403 }));
    const res = await post();
    expect(res.status).toBe(403);
    expect(SessionReminderService.sendSessionReminder).not.toHaveBeenCalled();
  });

  it('allows an admin and dispatches the reminder', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await post({ bookingId: 'bk_1', force: true });
    expect(res.status).toBe(200);
    expect(SessionReminderService.sendSessionReminder).toHaveBeenCalledWith('bk_1', { force: true });
  });

  it('requires a bookingId', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await post({});
    expect(res.status).toBe(400);
    expect(SessionReminderService.sendSessionReminder).not.toHaveBeenCalled();
  });
});
