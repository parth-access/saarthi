import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('./usersSources', () => ({
  USERS_PAGE_SIZE: 25,
  listUsersPage: vi.fn(),
  findUsersByEmail: vi.fn(),
  countAdministrators: vi.fn(),
}));

import { GET } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { listUsersPage, findUsersByEmail, countAdministrators } from './usersSources';

const ADMIN_SESSION = { uid: 'admin_user_1', role: 'admin' };

function okPage(rows: Array<Record<string, unknown>>, hasMore = false) {
  return {
    ok: true as const,
    page: { rows: rows as never[], nextCursor: hasMore ? { createdAtMs: 123, id: 'u_1' } : null },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(ADMIN_SESSION as never);
  vi.mocked(listUsersPage).mockResolvedValue(
    okPage([{ id: 'u_1', name: 'A', email: 'a@x.com', role: 'client' }])
  );
  vi.mocked(countAdministrators).mockResolvedValue({ ok: true, count: 2 });
});

function url(query = '') {
  const qs = query.replace(/^\?/, '');
  return new NextRequest(`http://localhost/api/admin/users${qs ? `?${qs}` : ''}`);
}

describe('GET /api/admin/users', () => {
  it('refuses the world before reading anything', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'x' }, { status: 401 }));
    const response = await GET(url());
    expect(response.status).toBe(401);
    expect(listUsersPage).not.toHaveBeenCalled();
  });

  it('refuses a role filter outside the closed vocabulary', async () => {
    const response = await GET(url('?role=superadmin'));
    expect(response.status).toBe(400);
    expect(listUsersPage).not.toHaveBeenCalled();
  });

  it('applies a valid role filter and reports who is asking', async () => {
    const response = await GET(url('?role=admin'));
    expect(listUsersPage).toHaveBeenCalledWith(null, 'admin');
    const body = await response.json();
    expect(body.selfUid).toBe('admin_user_1');
    expect(body.mode).toBe('page');
    expect(body.users.ok).toBe(true);
    expect(body.administrators).toEqual({ ok: true, count: 2 });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('parses the cursor into createdAtMs and id', async () => {
    await GET(url('?cursor=1700000000000_user_9'));
    expect(listUsersPage).toHaveBeenCalledWith({ createdAtMs: 1700000000000, id: 'user_9' }, 'all');
  });

  it('refuses a malformed cursor instead of guessing', async () => {
    const response = await GET(url('?cursor=garbage'));
    expect(response.status).toBe(400);
    expect(listUsersPage).not.toHaveBeenCalled();
  });

  it('switches to exact-email lookup mode and ignores the role filter', async () => {
    vi.mocked(findUsersByEmail).mockResolvedValue(okPage([{ id: 'u_2', role: 'admin' }]));
    const response = await GET(url('?email=person%40example.com&role=admin'));
    expect(findUsersByEmail).toHaveBeenCalledWith('person@example.com');
    expect(listUsersPage).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.mode).toBe('emailLookup');
  });

  it('carries a failed read as data, not as a thrown 500', async () => {
    vi.mocked(listUsersPage).mockResolvedValue({ ok: false, reason: 'Could not be read just now. Reload to try again.' });
    const response = await GET(url());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.users).toEqual({ ok: false, reason: 'Could not be read just now. Reload to try again.' });
    expect(body.nextCursor).toBeNull();
  });

  it('answers a malformed email with the named gap, not a plausible empty list', async () => {
    const response = await GET(url('?email=not-an-email'));
    expect(findUsersByEmail).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.mode).toBe('emailLookup');
    expect(body.users.ok).toBe(false);
    expect(body.users.reason).toMatch(/not a well-formed email/);
  });

  it('returns an opaque 500 when assembly itself fails', async () => {
    vi.mocked(countAdministrators).mockRejectedValue(new Error('db down'));
    const response = await GET(url());
    expect(response.status).toBe(500);
    expect((await response.json()).error).not.toContain('db down');
  });
});
