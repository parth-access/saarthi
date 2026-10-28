import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('../../../_lib/rateLimit', () => ({
  getClientIp: () => '127.0.0.1',
  checkRateLimit: vi.fn(() => ({ success: true })),
}));

const handlers = vi.hoisted(() => ({
  outbox: vi.fn(),
  reminders: vi.fn(),
  completion: vi.fn(),
  calendar: vi.fn(),
  refunds: vi.fn(),
}));
vi.mock('../../../cron/process-outbox/route', () => ({ GET: handlers.outbox }));
vi.mock('../../../cron/session-reminders/route', () => ({ GET: handlers.reminders }));
vi.mock('../../../cron/session-completion/route', () => ({ GET: handlers.completion }));
vi.mock('../../../cron/retry-calendar/route', () => ({ GET: handlers.calendar }));
vi.mock('../../../cron/process-refunds/route', () => ({ GET: handlers.refunds }));

import { POST } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { checkRateLimit } from '../../../_lib/rateLimit';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/admin/jobs/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

const ADMIN = { uid: 'uid_admin', role: 'admin' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-cron-secret';
  vi.mocked(checkRateLimit).mockReturnValue({ success: true } as never);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('POST /api/admin/jobs/run', () => {
  it('refuses non-admins before touching any job', async () => {
    for (const status of [401, 403]) {
      vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'denied' }, { status }));
      const res = await post({ job: 'process-refunds' });
      expect(res.status).toBe(status);
    }
    expect(handlers.refunds).not.toHaveBeenCalled();
  });

  it('rejects a job outside the allow-list', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN);
    for (const job of ['all', '../payment/webhook', '', null, 42]) {
      const res = await post({ job });
      expect(res.status).toBe(400);
    }
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
  });

  it('runs the scheduler handler with the server-held secret and returns its counts', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN);
    handlers.refunds.mockResolvedValue(
      NextResponse.json({ success: true, scanned: 3, processed: 2, stillPending: 1, failed: 0 })
    );

    const res = await post({ job: 'process-refunds' });
    expect(res.status).toBe(200);

    const forwarded = handlers.refunds.mock.calls[0][0] as Request;
    expect(forwarded.headers.get('authorization')).toBe('Bearer test-cron-secret');
    expect(new URL(forwarded.url).pathname).toBe('/api/cron/process-refunds');

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ success: true, job: 'process-refunds', result: { processed: 2 } });
    // The secret is used, never echoed.
    expect(JSON.stringify(body)).not.toContain('test-cron-secret');
  });

  it('reports a job failure as a failure', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN);
    handlers.outbox.mockResolvedValue(NextResponse.json({ success: false, error: 'boom' }, { status: 500 }));
    const res = await post({ job: 'process-outbox' });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ success: false, error: 'boom' });
  });

  it('says so when the deployment has no cron secret', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN);
    delete process.env.CRON_SECRET;
    const res = await post({ job: 'session-reminders' });
    expect(res.status).toBe(503);
    expect(handlers.reminders).not.toHaveBeenCalled();
  });

  it('is rate limited', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN);
    vi.mocked(checkRateLimit).mockReturnValue({ success: false } as never);
    const res = await post({ job: 'retry-calendar' });
    expect(res.status).toBe(429);
    expect(handlers.calendar).not.toHaveBeenCalled();
  });
});
