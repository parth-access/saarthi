import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('./emailsSources', () => ({
  EMAIL_LIST_LIMIT: 100,
  listRecentEmailLogs: vi.fn(),
  findEmailLogsForBooking: vi.fn(),
}));

import { GET } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { listRecentEmailLogs, findEmailLogsForBooking } from './emailsSources';

const okScan = { ok: true as const, rows: [], atLeast: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listRecentEmailLogs).mockResolvedValue(okScan);
  vi.mocked(findEmailLogsForBooking).mockResolvedValue(okScan);
});

function get(url = 'http://localhost/api/admin/emails') {
  return GET(new Request(url) as never);
}

describe('GET /api/admin/emails', () => {
  it('blocks unauthenticated and non-admin callers', async () => {
    for (const status of [401, 403]) {
      vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'denied' }, { status }));
      const res = await get();
      expect(res.status).toBe(status);
      expect(listRecentEmailLogs).not.toHaveBeenCalled();
    }
  });

  it('reads the recent slice by default', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await get();
    expect(res.status).toBe(200);
    expect(listRecentEmailLogs).toHaveBeenCalledTimes(1);
    expect(findEmailLogsForBooking).not.toHaveBeenCalled();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.bookingId).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('reads one booking\'s emails when asked', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    await get('http://localhost/api/admin/emails?bookingId=bk_20260915_3B221AE5');
    expect(findEmailLogsForBooking).toHaveBeenCalledWith('bk_20260915_3B221AE5');
    expect(listRecentEmailLogs).not.toHaveBeenCalled();
  });

  it('refuses a malformed booking id instead of quietly listing everything', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await get('http://localhost/api/admin/emails?bookingId=../etc');
    expect(res.status).toBe(400);
    expect(findEmailLogsForBooking).not.toHaveBeenCalled();
    expect(listRecentEmailLogs).not.toHaveBeenCalled();
  });

  it('delivers a failed scan as data, not a 500', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(listRecentEmailLogs).mockResolvedValue({
      ok: false,
      reason: 'Could not be read just now. Reload to try again.',
    });
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { emails: { ok: boolean } };
    expect(body.emails.ok).toBe(false);
  });

  it('returns a fixed sentence when assembly itself breaks', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(listRecentEmailLogs).mockRejectedValue(new Error('boom'));
    const res = await get();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toContain('boom');
  });
});
