import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { mockAuditAdd } = vi.hoisted(() => ({
  mockAuditAdd: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/app/api/_lib/rateLimit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ success: true, limit: 15, remaining: 14, reset: 0 }),
  getClientIp: vi.fn().mockReturnValue('test-client-ip'),
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: vi.fn(() => ({ add: mockAuditAdd })) },
}));
vi.mock('../usersSources', () => ({
  readUser: vi.fn(),
  countOtherAdministrators: vi.fn().mockResolvedValue(1),
  setUserRole: vi.fn().mockResolvedValue({ ok: true }),
  revokeUserSessions: vi.fn().mockResolvedValue({ ok: true }),
  setUserAccountDisabled: vi.fn().mockResolvedValue({ ok: true }),
}));

import { PATCH } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import {
  readUser,
  countOtherAdministrators,
  setUserRole,
  revokeUserSessions,
  setUserAccountDisabled,
} from '../usersSources';

const ADMIN_SESSION = { uid: 'admin_user_1', role: 'admin' };

function userRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user_b',
    name: 'Bee',
    email: 'bee@example.com',
    role: 'client',
    provider: null,
    createdAtIso: '2026-01-01T00:00:00.000Z',
    accountDisabled: false,
    sessionRevokeBeforeSeconds: null,
    ...overrides,
  };
}

function patchRequest(userId: string, body: unknown) {
  return new NextRequest(`http://localhost/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const context = (userId: string) => ({ params: Promise.resolve({ userId }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(ADMIN_SESSION as never);
  vi.mocked(readUser).mockResolvedValue({ row: userRow() as never });
  vi.mocked(countOtherAdministrators).mockResolvedValue(1);
});

describe('PATCH /api/admin/users/[userId]', () => {
  it('refuses the world before reading the account', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'x' }, { status: 401 }));
    const response = await PATCH(patchRequest('user_b', { action: 'revokeSessions' }), context('user_b'));
    expect(response.status).toBe(401);
    expect(readUser).not.toHaveBeenCalled();
  });

  it('rate-limits after authorization', async () => {
    const { checkRateLimit } = await import('@/app/api/_lib/rateLimit');
    vi.mocked(checkRateLimit).mockReturnValueOnce({ success: false, limit: 15, remaining: 0, reset: 0 });
    const response = await PATCH(patchRequest('user_b', { action: 'revokeSessions' }), context('user_b'));
    expect(response.status).toBe(429);
    expect(readUser).not.toHaveBeenCalled();
  });

  it('answers a body without a supported action with 400', async () => {
    const response = await PATCH(patchRequest('user_b', { action: 'deleteEverything' }), context('user_b'));
    expect(response.status).toBe(400);
    expect(readUser).not.toHaveBeenCalled();
  });

  it('answers a malformed body with 400', async () => {
    const response = await PATCH(patchRequest('user_b', 'not-json'), context('user_b'));
    expect(response.status).toBe(400);
  });

  it('404s when no account exists with that id', async () => {
    vi.mocked(readUser).mockResolvedValueOnce(null);
    const response = await PATCH(patchRequest('user_missing', { action: 'revokeSessions' }), context('user_missing'));
    expect(response.status).toBe(404);
  });

  it('changes a role, writes the audit row, and reports what it did', async () => {
    const response = await PATCH(patchRequest('user_b', { action: 'setRole', role: 'admin' }), context('user_b'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.changed).toBe(true);
    expect(setUserRole).toHaveBeenCalledWith('user_b', 'admin');
    expect(mockAuditAdd).toHaveBeenCalledTimes(1);
    const auditRow = mockAuditAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(auditRow.eventType).toBe('USER_ROLE_CHANGED');
    expect(auditRow.userId).toBe('admin_user_1');
    expect(auditRow.targetUserId).toBe('user_b');
    expect(auditRow.before).toMatchObject({ role: 'client' });
    expect(auditRow.after).toMatchObject({ role: 'admin' });
  });

  it('refuses an administrator changing their own role', async () => {
    const response = await PATCH(patchRequest('admin_user_1', { action: 'setRole', role: 'client' }), context('admin_user_1'));
    expect(response.status).toBe(400);
    expect(setUserRole).not.toHaveBeenCalled();
  });

  it('reports a same-role write as a no-op without writing or auditing', async () => {
    vi.mocked(readUser).mockResolvedValueOnce({ row: userRow({ role: 'admin' }) as never });
    const response = await PATCH(patchRequest('user_b', { action: 'setRole', role: 'admin' }), context('user_b'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.changed).toBe(false);
    expect(setUserRole).not.toHaveBeenCalled();
    expect(mockAuditAdd).not.toHaveBeenCalled();
  });

  it('refuses to demote the last administrator, naming the way out', async () => {
    vi.mocked(readUser).mockResolvedValueOnce({ row: userRow({ role: 'admin' }) as never });
    vi.mocked(countOtherAdministrators).mockResolvedValueOnce(0);
    const response = await PATCH(patchRequest('user_b', { action: 'setRole', role: 'client' }), context('user_b'));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('last administrator');
    expect(setUserRole).not.toHaveBeenCalled();
  });

  it('checks for other administrators only when the change could remove one', async () => {
    await PATCH(patchRequest('user_b', { action: 'setRole', role: 'therapist' }), context('user_b'));
    expect(countOtherAdministrators).not.toHaveBeenCalled();
    await PATCH(patchRequest('user_b', { action: 'revokeSessions' }), context('user_b'));
    expect(countOtherAdministrators).not.toHaveBeenCalled();
  });

  it('revokes sessions with an epoch mark and audits it', async () => {
    const response = await PATCH(patchRequest('user_b', { action: 'revokeSessions' }), context('user_b'));
    expect(response.status).toBe(200);
    const [, markSeconds] = vi.mocked(revokeUserSessions).mock.calls[0];
    expect(typeof markSeconds).toBe('number');
    expect(markSeconds as number).toBeGreaterThan(1_700_000_000);
    const auditRow = mockAuditAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(auditRow.eventType).toBe('USER_SESSIONS_REVOKED');
    expect(auditRow.after).toMatchObject({ sessionRevokeBeforeSeconds: markSeconds });
  });

  it('refuses revoking your own sessions', async () => {
    const response = await PATCH(patchRequest('admin_user_1', { action: 'revokeSessions' }), context('admin_user_1'));
    expect(response.status).toBe(400);
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  it('disables an account with both levers in the audit row', async () => {
    const response = await PATCH(patchRequest('user_b', { action: 'disableAccount' }), context('user_b'));
    expect(response.status).toBe(200);
    const [, , markSeconds] = vi.mocked(setUserAccountDisabled).mock.calls[0];
    expect(typeof markSeconds).toBe('number');
    const auditRow = mockAuditAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(auditRow.eventType).toBe('USER_ACCOUNT_DISABLED');
    expect(auditRow.after).toMatchObject({ accountDisabled: true, sessionRevokeBeforeSeconds: markSeconds });
  });

  it('refuses to disable the last administrator', async () => {
    vi.mocked(readUser).mockResolvedValueOnce({ row: userRow({ role: 'admin' }) as never });
    vi.mocked(countOtherAdministrators).mockResolvedValueOnce(0);
    const response = await PATCH(patchRequest('user_b', { action: 'disableAccount' }), context('user_b'));
    expect(response.status).toBe(409);
    expect(setUserAccountDisabled).not.toHaveBeenCalled();
  });

  it('reports disabling an already-disabled account as a no-op', async () => {
    vi.mocked(readUser).mockResolvedValueOnce({ row: userRow({ accountDisabled: true }) as never });
    const response = await PATCH(patchRequest('user_b', { action: 'disableAccount' }), context('user_b'));
    const body = await response.json();
    expect(body.changed).toBe(false);
    expect(setUserAccountDisabled).not.toHaveBeenCalled();
  });

  it('enables an account without a last-admin guard and audits the enable', async () => {
    vi.mocked(readUser).mockResolvedValueOnce({ row: userRow({ accountDisabled: true }) as never });
    const response = await PATCH(patchRequest('user_b', { action: 'enableAccount' }), context('user_b'));
    expect(response.status).toBe(200);
    expect(setUserAccountDisabled).toHaveBeenCalledWith('user_b', false, expect.any(Number));
    const auditRow = mockAuditAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(auditRow.eventType).toBe('USER_ACCOUNT_ENABLED');
    expect(auditRow.after).toMatchObject({ accountDisabled: false });
  });

  it('reports enabling a non-disabled account as a no-op', async () => {
    const response = await PATCH(patchRequest('user_b', { action: 'enableAccount' }), context('user_b'));
    const body = await response.json();
    expect(body.changed).toBe(false);
    expect(setUserAccountDisabled).not.toHaveBeenCalled();
  });

  it('surfaces a failed write as its authored sentence, not a stack', async () => {
    vi.mocked(setUserRole).mockResolvedValueOnce({ ok: false, status: 500, error: 'The role change did not go through just now.' });
    const response = await PATCH(patchRequest('user_b', { action: 'setRole', role: 'admin' }), context('user_b'));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('The role change did not go through just now.');
    expect(mockAuditAdd).not.toHaveBeenCalled();
  });
});
