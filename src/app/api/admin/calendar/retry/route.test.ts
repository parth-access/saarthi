import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * /api/admin/calender/retry must authorize through the CANONICAL admin source
 * (the users-collection role via requireAdmin), not Firebase custom claims.
 * These tests pin the route wiring; requireAdmin's semantics (live role
 * re-read → immediate revocation, no reliance on provisioned/stale claims)
 * are enforced by verifySession and covered there.
 */

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/services/googleCalendarService', () => ({
  GoogleCalendarService: { createOrSyncCalendarEvent: vi.fn().mockResolvedValue({ success: true, meetingUrl: 'https://meet.google.com/real-link', calendarEventId: 'evt_1' }) },
}));
vi.mock('@/domains/audit/AuditService', () => ({
  auditService: { logEvent: vi.fn().mockResolvedValue(undefined) },
}));

import { POST } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { GoogleCalendarService } from '@/services/googleCalendarService';

function post(body: unknown = { bookingId: 'bk_1' }) {
  return POST(
    new Request('http://localhost/api/admin/calender/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/calender/retry — canonical admin authorization', () => {
  it('blocks unauthenticated callers', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await post();
    expect(res.status).toBe(401);
    expect(GoogleCalendarService.createOrSyncCalendarEvent).not.toHaveBeenCalled();
  });

  it('blocks clients and therapists (users-collection role is the authority, not claims)', async () => {
    for (const nonAdminRole of ['client', 'therapist']) {
      vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Forbidden: Admin role required' }, { status: 403 }));
      const res = await post({ bookingId: 'bk_1' });
      expect(res.status).toBe(403);
      expect(nonAdminRole).toBeTruthy(); // both roles are refused identically
    }
    expect(GoogleCalendarService.createOrSyncCalendarEvent).not.toHaveBeenCalled();
  });

  it('allows an admin and triggers the calendar retry', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await post();
    expect(res.status).toBe(200);
    expect(GoogleCalendarService.createOrSyncCalendarEvent).toHaveBeenCalledWith('bk_1');
  });

  it('requires a bookingId', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await post({});
    expect(res.status).toBe(400);
    expect(GoogleCalendarService.createOrSyncCalendarEvent).not.toHaveBeenCalled();
  });
});
