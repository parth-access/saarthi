import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('../emailsSources', () => ({
  readEmailLogDetail: vi.fn(),
  EMAIL_LIST_LIMIT: 100,
}));

import { GET } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readEmailLogDetail } from '../emailsSources';

function detail() {
  return {
    id: 'email_bk_1_booking-confirmed',
    bookingId: 'bk_1',
    type: 'booking-confirmed',
    recipient: 'c@x.com',
    subject: 'S',
    status: 'sent',
    attemptCount: 1,
    lastError: null,
    createdAtIso: null,
    updatedAtIso: null,
    text: 'plaintext body',
    attempts: [],
  };
}

function get(emailId = 'email_bk_1_booking-confirmed') {
  return GET(new Request(`http://localhost/api/admin/emails/${emailId}`) as never, {
    params: Promise.resolve({ emailId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/emails/[emailId]', () => {
  it('blocks unauthenticated callers', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await get();
    expect(res.status).toBe(401);
    expect(readEmailLogDetail).not.toHaveBeenCalled();
  });

  it('returns one email with its plaintext backup', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(readEmailLogDetail).mockResolvedValue({ ok: true, detail: detail() });
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: { text: string | null; html?: string } };
    expect(body.email.text).toBe('plaintext body');
    expect(body.email.html).toBeUndefined();
  });

  it('refuses a malformed id', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await get('../etc/passwd');
    expect(res.status).toBe(400);
    expect(readEmailLogDetail).not.toHaveBeenCalled();
  });

  it('answers a missing email with 404, not a fabrication', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(readEmailLogDetail).mockResolvedValue({
      ok: false,
      reason: 'Could not be read just now. Reload to try again.',
    });
    const res = await get('email_missing');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });
});
