import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/app/api/_lib/rateLimit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ success: true, limit: 30, remaining: 29, reset: 0 }),
  getClientIp: vi.fn().mockReturnValue('test-client-ip'),
}));
vi.mock('./contactsSources', () => ({
  updateContactStatus: vi.fn().mockResolvedValue({ ok: true }),
  deleteContact: vi.fn().mockResolvedValue({ ok: true }),
}));

import { PATCH, DELETE } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { updateContactStatus, deleteContact } from './contactsSources';
import { checkRateLimit } from '@/app/api/_lib/rateLimit';

function patch(body: unknown, contactId = 'contact_1') {
  return PATCH(
    new Request(`http://localhost/api/admin/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ contactId }) }
  );
}

function del(contactId = 'contact_1') {
  return DELETE(new Request(`http://localhost/api/admin/contacts/${contactId}`, { method: 'DELETE' }) as never, {
    params: Promise.resolve({ contactId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockReturnValue({ success: true, limit: 30, remaining: 29, reset: 0 });
});

describe('PATCH /api/admin/contacts/[contactId]', () => {
  it('blocks unauthenticated callers', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await patch({ status: 'resolved' });
    expect(res.status).toBe(401);
    expect(updateContactStatus).not.toHaveBeenCalled();
  });

  it('updates a status inside the settable vocabulary', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    for (const status of ['unread', 'resolved', 'spam']) {
      const res = await patch({ status });
      expect(res.status).toBe(200);
    }
    expect(updateContactStatus).toHaveBeenCalledTimes(3);
  });

  it('refuses statuses outside the vocabulary before touching Firestore', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    for (const bad of [{ status: 'in-progress' }, { status: 'important' }, { status: '' }]) {
      const res = await patch(bad);
      expect(res.status).toBe(400);
    }
    expect(updateContactStatus).not.toHaveBeenCalled();
  });

  it('refuses malformed ids', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await patch({ status: 'resolved' }, '../etc');
    expect(res.status).toBe(400);
  });

  it('rate-limits after authorization', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(checkRateLimit).mockReturnValue({ success: false, limit: 30, remaining: 0, reset: 0 });
    const res = await patch({ status: 'resolved' });
    expect(res.status).toBe(429);
    expect(updateContactStatus).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/contacts/[contactId]', () => {
  it('deletes for an admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await del();
    expect(res.status).toBe(200);
    expect(deleteContact).toHaveBeenCalledWith('contact_1');
  });

  it('blocks unauthenticated callers before deleting', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await del();
    expect(res.status).toBe(401);
    expect(deleteContact).not.toHaveBeenCalled();
  });
});
