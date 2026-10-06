import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * GET /api/admin/calendar — the read side of the Calendar & Meet screen.
 * Pins the wiring: canonical admin authorization, the scan failing as data
 * rather than a 500, and the fixed assembly-failure sentence.
 */

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('./calendarSources', () => ({
  CALENDAR_SCAN_LIMIT: 60,
  readCalendarProblems: vi.fn(),
}));

import { GET } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readCalendarProblems } from './calendarSources';

function get() {
  return GET(new Request('http://localhost/api/admin/calendar') as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/calendar', () => {
  it('blocks unauthenticated and non-admin callers', async () => {
    for (const status of [401, 403]) {
      vi.mocked(requireAdmin).mockResolvedValue(
        NextResponse.json({ error: 'denied' }, { status })
      );
      const res = await get();
      expect(res.status).toBe(status);
      expect(readCalendarProblems).not.toHaveBeenCalled();
    }
  });

  it('returns the scan as data for an admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(readCalendarProblems).mockResolvedValue({ ok: true, rows: [], atLeast: false });

    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.scanLimit).toBe(60);
    expect(typeof body.generatedAtIso).toBe('string');
    expect((body.problems as Record<string, unknown>).ok).toBe(true);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('delivers a failed scan as data, not a 500', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(readCalendarProblems).mockResolvedValue({
      ok: false,
      reason: 'Could not be read just now. Reload to try again.',
    });

    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { problems: { ok: boolean } };
    expect(body.problems.ok).toBe(false);
  });

  it('returns a fixed sentence when assembly itself breaks', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(readCalendarProblems).mockRejectedValue(new Error('boom'));

    const res = await get();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toContain('boom');
  });
});
