import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);
const ok = (name: string) => async () => {
  calls.push(name);
  return new Response('{}', { status: 200 });
};

vi.mock('@/app/api/_lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../process-outbox/route', () => ({ GET: ok('process-outbox') }));
vi.mock('../session-reminders/route', () => ({ GET: ok('session-reminders') }));
vi.mock('../session-completion/route', () => ({ GET: ok('session-completion') }));
vi.mock('../retry-calendar/route', () => ({ GET: async () => { calls.push('retry-calendar'); return new Response('{}', { status: 500 }); } }));
vi.mock('../process-refunds/route', () => ({ GET: ok('process-refunds') }));

import { GET } from './route';

const req = (auth?: string) =>
  new Request('https://saarthilife.com/api/cron/all', { headers: auth ? { Authorization: auth } : {} });

describe('GET /api/cron/all (daily backup scheduler)', () => {
  beforeEach(() => {
    calls.length = 0;
    process.env.CRON_SECRET = 'test-secret';
    delete process.env.GITHUB_KEEPALIVE_TOKEN;
  });

  it('refuses callers without the cron secret and runs nothing', async () => {
    const res = await GET(req('Bearer wrong-secret'));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('runs every job in order and reports a partial failure as 207', async () => {
    const res = await GET(req('Bearer test-secret'));
    expect(calls).toEqual(['process-outbox', 'session-reminders', 'session-completion', 'retry-calendar', 'process-refunds']);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.results['retry-calendar']).toEqual({ ok: false, status: 500 });
    expect(body.githubSchedule).toMatch(/^skipped/);
  });
});
