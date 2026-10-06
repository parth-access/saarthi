import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('./activitySources', () => ({
  UNREADABLE: 'Could not be read just now. Reload to try again.',
  planActivityQuery: vi.fn(),
  readActivityPage: vi.fn(),
}));

import { GET } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { planActivityQuery, readActivityPage } from './activitySources';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(planActivityQuery).mockReturnValue({ ok: true, filter: null, pageSize: 30 });
  vi.mocked(readActivityPage).mockResolvedValue({
    ok: true,
    page: { entries: [], hasMore: false, nextCursor: null },
  });
});

function get(url = 'http://localhost/api/admin/activity') {
  return GET(new Request(url) as never);
}

describe('GET /api/admin/activity', () => {
  it('blocks unauthenticated and non-admin callers', async () => {
    for (const status of [401, 403]) {
      vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'denied' }, { status }));
      const res = await get();
      expect(res.status).toBe(status);
      expect(readActivityPage).not.toHaveBeenCalled();
    }
  });

  it('serves a page for an admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect((body.activity as Record<string, unknown>).ok).toBe(true);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('carries the plan refusal as a 400 with the readable explanation', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(planActivityQuery).mockReturnValue({
      ok: false,
      code: 'UNSUPPORTED_COMBINATION',
      message: 'One filter at a time.',
    });
    const res = await get();
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('One filter at a time.');
    expect(readActivityPage).not.toHaveBeenCalled();
  });

  it('refuses a malformed cursor', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await get('http://localhost/api/admin/activity?cursor=junk');
    expect(res.status).toBe(400);
    expect(readActivityPage).not.toHaveBeenCalled();
  });

  it('delivers a failed read as data, never as an empty log', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(readActivityPage).mockResolvedValue({
      ok: false,
      reason: 'Could not be read just now. Reload to try again.',
    });
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { activity: { ok: boolean } };
    expect(body.activity.ok).toBe(false);
  });
});
