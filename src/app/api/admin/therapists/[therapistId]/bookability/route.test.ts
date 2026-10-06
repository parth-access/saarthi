import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/app/api/_lib/rateLimit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ success: true, limit: 15, remaining: 14, reset: 0 }),
  getClientIp: vi.fn().mockReturnValue('test-client-ip'),
}));

const updateMock = vi.fn().mockResolvedValue(undefined);
const addMock = vi.fn().mockResolvedValue({ id: 'audit_1' });
const getMock = vi.fn();

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'therapists') {
        return {
          doc: vi.fn(() => ({ get: getMock, update: updateMock })),
        };
      }
      if (name === 'audit_logs') {
        return { add: addMock };
      }
      throw new Error(`unexpected collection ${name}`);
    }),
  },
}));

import { POST } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { checkRateLimit } from '@/app/api/_lib/rateLimit';

function post(body: unknown = { active: false }, therapistId = 'th_1') {
  return POST(
    new Request(`http://localhost/api/admin/therapists/${therapistId}/bookability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ therapistId }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockReturnValue({ success: true, limit: 15, remaining: 14, reset: 0 });
  getMock.mockResolvedValue({ exists: true, data: () => ({ active: true }) });
  updateMock.mockResolvedValue(undefined);
});

describe('POST /api/admin/therapists/[therapistId]/bookability', () => {
  it('blocks unauthenticated callers', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await post();
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('writes the flag and an audit row for an admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await post({ active: false });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
    expect(addMock).toHaveBeenCalledTimes(1);
    const audit = addMock.mock.calls[0][0] as Record<string, unknown>;
    expect(audit.eventType).toBe('THERAPIST_BOOKABILITY_CHANGED');
    expect(audit.before).toEqual({ active: true });
    expect(audit.after).toEqual({ active: false });
    expect(audit.userId).toBe('uid_admin');
    const body = (await res.json()) as { changed: boolean };
    expect(body.changed).toBe(true);
  });

  it('is a stated no-op when the state is already as requested', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    getMock.mockResolvedValue({ exists: true, data: () => ({ active: true }) });
    const res = await post({ active: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { changed: boolean; summary: string };
    expect(body.changed).toBe(false);
    expect(body.summary).toContain('already bookable');
    expect(updateMock).not.toHaveBeenCalled();
    expect(addMock).not.toHaveBeenCalled();
  });

  it('404s a therapist who does not exist', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    getMock.mockResolvedValue({ exists: false, data: () => ({}) });
    const res = await post({ active: false }, 'th_missing');
    expect(res.status).toBe(404);
  });

  it('refuses malformed bodies and ids', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    expect((await post({ active: 'yes' })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ active: true }, '../etc')).status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rate-limits after authorization', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(checkRateLimit).mockReturnValue({ success: false, limit: 15, remaining: 0, reset: 0 });
    const res = await post();
    expect(res.status).toBe(429);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
