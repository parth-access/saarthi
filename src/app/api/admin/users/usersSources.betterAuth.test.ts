import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Under Better Auth the role and ban verifySession reads live on the Better
 * Auth user: admin changes are written there first and mirrored to `users`.
 * A Better Auth failure must fail the change, never leave the two disagreeing.
 */
const h = vi.hoisted(() => ({
  update: vi.fn(),
  firebaseUpdateUser: vi.fn(),
  revokeRefreshTokens: vi.fn(),
  setBetterAuthRole: vi.fn(),
  setBetterAuthBanned: vi.fn(),
  revokeBetterAuthSessions: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ update: h.update }) }) },
  adminAuth: { updateUser: h.firebaseUpdateUser, revokeRefreshTokens: h.revokeRefreshTokens },
}));
vi.mock('firebase-admin/firestore', () => ({ Timestamp: { now: () => 'NOW', fromMillis: vi.fn() } }));
vi.mock('@/lib/auth/betterAuthAdmin', () => ({
  setBetterAuthRole: h.setBetterAuthRole,
  setBetterAuthBanned: h.setBetterAuthBanned,
  revokeBetterAuthSessions: h.revokeBetterAuthSessions,
}));
vi.mock('../../_lib/logger', () => ({ logger: { error: vi.fn() } }));

import { setUserRole, setUserAccountDisabled, revokeUserSessions } from './usersSources';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_AUTH_PROVIDER', 'better-auth');
  h.update.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('admin user changes under Better Auth', () => {
  it('sets the role in Better Auth, then mirrors it to users', async () => {
    expect(await setUserRole('u1', 'therapist')).toEqual({ ok: true });
    expect(h.setBetterAuthRole).toHaveBeenCalledWith('u1', 'therapist');
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ role: 'therapist' }));
    expect(h.setBetterAuthRole.mock.invocationCallOrder[0]).toBeLessThan(h.update.mock.invocationCallOrder[0]);
  });

  it('fails the role change, and leaves users alone, when Better Auth refuses', async () => {
    h.setBetterAuthRole.mockRejectedValue(new Error('db down'));
    expect(await setUserRole('u1', 'admin')).toMatchObject({ ok: false, status: 500 });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('bans in Better Auth when disabling, and never touches Firebase Auth', async () => {
    expect(await setUserAccountDisabled('u1', true, 123)).toEqual({ ok: true });
    expect(h.setBetterAuthBanned).toHaveBeenCalledWith('u1', true);
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ accountDisabled: true, sessionRevokeBefore: 123 }));
    expect(h.firebaseUpdateUser).not.toHaveBeenCalled();
  });

  it('unbans when enabling', async () => {
    await setUserAccountDisabled('u1', false, 123);
    expect(h.setBetterAuthBanned).toHaveBeenCalledWith('u1', false);
  });

  it('revokes Better Auth sessions', async () => {
    expect(await revokeUserSessions('u1', 123)).toEqual({ ok: true });
    expect(h.revokeBetterAuthSessions).toHaveBeenCalledWith('u1');
    expect(h.revokeRefreshTokens).not.toHaveBeenCalled();
  });
});

describe('admin user changes under Firebase (unchanged)', () => {
  it('never calls Better Auth', async () => {
    vi.unstubAllEnvs();
    await setUserRole('u1', 'therapist');
    await setUserAccountDisabled('u1', true, 123);
    expect(h.setBetterAuthRole).not.toHaveBeenCalled();
    expect(h.setBetterAuthBanned).not.toHaveBeenCalled();
    expect(h.firebaseUpdateUser).toHaveBeenCalledWith('u1', { disabled: true });
  });
});
