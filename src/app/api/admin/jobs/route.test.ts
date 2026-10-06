import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('./jobsSources', () => ({
  JOBS_SCAN_LIMIT: 60,
  readJobsOutbox: vi.fn(),
  readJobsEmails: vi.fn(),
}));

import { GET } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readJobsOutbox, readJobsEmails } from './jobsSources';

const okScan = { ok: true as const, rows: [], atLeast: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readJobsOutbox).mockResolvedValue({
    waiting: okScan,
    failed: okScan,
    dead: okScan,
  });
  vi.mocked(readJobsEmails).mockResolvedValue({ queued: okScan, failed: okScan });
});

function get() {
  return GET(new Request('http://localhost/api/admin/jobs') as never);
}

describe('GET /api/admin/jobs', () => {
  it('blocks unauthenticated and non-admin callers', async () => {
    for (const status of [401, 403]) {
      vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'denied' }, { status }));
      const res = await get();
      expect(res.status).toBe(status);
      expect(readJobsOutbox).not.toHaveBeenCalled();
    }
  });

  it('returns every slice for an admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.scanLimit).toBe(60);
    const outbox = body.outbox as Record<string, unknown>;
    const emails = body.emails as Record<string, unknown>;
    for (const slice of ['waiting', 'failed', 'dead']) {
      expect((outbox[slice] as Record<string, unknown>).ok).toBe(true);
    }
    for (const slice of ['queued', 'failed']) {
      expect((emails[slice] as Record<string, unknown>).ok).toBe(true);
    }
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('returns a fixed sentence when assembly itself breaks', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(readJobsOutbox).mockRejectedValue(new Error('boom'));
    const res = await get();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toContain('boom');
  });
});
