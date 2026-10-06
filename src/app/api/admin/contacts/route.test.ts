import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('./contactsSources', () => ({
  CONTACT_PAGE_SIZE: 25,
  listContactsPage: vi.fn(),
}));

import { GET } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { listContactsPage } from './contactsSources';

function pageResult(rows: Array<Record<string, unknown>>, hasMore: boolean) {
  return {
    ok: true as const,
    page: {
      rows: rows as never,
      nextCursor: hasMore ? { createdAtMs: 1700000000000, id: 'contact_9' } : null,
    },
    pageSize: 25,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listContactsPage).mockResolvedValue(pageResult([], false));
});

function get(url = 'http://localhost/api/admin/contacts') {
  return GET(new Request(url) as never);
}

describe('GET /api/admin/contacts', () => {
  it('blocks unauthenticated and non-admin callers', async () => {
    for (const status of [401, 403]) {
      vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'denied' }, { status }));
      const res = await get();
      expect(res.status).toBe(status);
      expect(listContactsPage).not.toHaveBeenCalled();
    }
  });

  it('serves the first page without a cursor', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(listContactsPage).mockResolvedValue(
      pageResult([{ id: 'contact_1', name: 'A' }], true)
    );
    const res = await get();
    expect(res.status).toBe(200);
    expect(listContactsPage).toHaveBeenCalledWith(null);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.nextCursor).toBe('1700000000000_contact_9');
  });

  it('passes a well-formed cursor through and refuses a malformed one', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    await get('http://localhost/api/admin/contacts?cursor=1700000000000_contact_9');
    expect(listContactsPage).toHaveBeenCalledWith({ createdAtMs: 1700000000000, id: 'contact_9' });

    const bad = await get('http://localhost/api/admin/contacts?cursor=drop-table');
    expect(bad.status).toBe(400);
  });

  it('delivers a failed read as data, not a 500', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(listContactsPage).mockResolvedValue({
      ok: false,
      reason: 'Could not be read just now. Reload to try again.',
    });
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { contacts: { ok: boolean } };
    expect(body.contacts.ok).toBe(false);
  });
});
