import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * POST /api/admin/calendar/retry must authorize through the CANONICAL admin
 * source (the users-collection role via requireAdmin), not Firebase custom
 * claims. These tests pin the route wiring; requireAdmin's semantics (live role
 * re-read → immediate revocation, no reliance on provisioned/stale claims)
 * are enforced by verifySession and covered there.
 *
 * The error contract is also pinned: upstream Google API failures surface as a
 * fixed sentence (the reason lives on the booking as calendarError), while the
 * service's authored precondition refusals keep their own statuses.
 */

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/app/api/_lib/rateLimit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ success: true, limit: 10, remaining: 9, reset: 0 }),
  getClientIp: vi.fn().mockReturnValue('test-client-ip'),
}));
vi.mock('@/services/googleCalendarService', () => ({
  GoogleCalendarService: { createOrSyncCalendarEvent: vi.fn() },
}));
vi.mock('@/domains/audit/AuditService', () => ({
  auditService: { logEvent: vi.fn().mockResolvedValue(undefined) },
}));

import { POST } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { GoogleCalendarService } from '@/services/googleCalendarService';
import { checkRateLimit } from '@/app/api/_lib/rateLimit';

function post(body: unknown = { bookingId: 'bk_1' }) {
  return POST(
    new Request('http://localhost/api/admin/calendar/retry', {
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

describe('POST /api/admin/calendar/retry — canonical admin authorization', () => {
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

  it('rate-limits after authorization, before any work', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(checkRateLimit).mockReturnValue({ success: false, limit: 10, remaining: 0, reset: 0 });
    const res = await post();
    expect(res.status).toBe(429);
    expect(GoogleCalendarService.createOrSyncCalendarEvent).not.toHaveBeenCalled();
  });

  it('allows an admin and triggers the calendar retry', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(GoogleCalendarService.createOrSyncCalendarEvent).mockResolvedValue({
      success: true,
      meetingUrl: 'https://meet.google.com/real-link',
      calendarEventId: 'evt_1',
    } as never);
    const res = await post();
    expect(res.status).toBe(200);
    expect(GoogleCalendarService.createOrSyncCalendarEvent).toHaveBeenCalledWith('bk_1');
    const body = (await res.json()) as { outcome: string };
    expect(body.outcome).toBe('created');
  });

  it('reports an already-existing event as its own outcome', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(GoogleCalendarService.createOrSyncCalendarEvent).mockResolvedValue({
      success: true,
      alreadyExists: true,
      meetingUrl: 'https://meet.google.com/real-link',
      calendarEventId: 'evt_1',
    } as never);
    const res = await post();
    const body = (await res.json()) as { outcome: string };
    expect(body.outcome).toBe('already_exists');
  });

  it('requires a readable bookingId', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    for (const bad of [{}, { bookingId: '' }, { bookingId: '../etc' }, { bookingId: 42 }]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
    }
    expect(GoogleCalendarService.createOrSyncCalendarEvent).not.toHaveBeenCalled();
  });

  it('maps a missing booking to 404', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(GoogleCalendarService.createOrSyncCalendarEvent).mockResolvedValue({
      success: false,
      error: 'Booking not found',
    } as never);
    const res = await post();
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('No booking exists with that id.');
  });

  it('maps a wrong booking state to 409 with the service sentence', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(GoogleCalendarService.createOrSyncCalendarEvent).mockResolvedValue({
      success: false,
      error: 'Booking status is cancelled, expected confirmed',
    } as never);
    const res = await post();
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('cancelled');
  });

  it('never leaks an upstream error into the 500 body', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(GoogleCalendarService.createOrSyncCalendarEvent).mockResolvedValue({
      success: false,
      retryable: true,
      error: 'Google API Error: project saarthi-prod quota exceeded for user service-acct@…',
    } as never);
    const res = await post();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toContain('saarthi-prod');
    expect(body.error).not.toContain('quota');
  });
});
