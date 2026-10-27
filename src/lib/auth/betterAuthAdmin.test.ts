import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ updateUser: vi.fn(), deleteUserSessions: vi.fn(), findUserByEmail: vi.fn() }));

vi.mock('./betterAuth', () => ({
  auth: { $context: Promise.resolve({ internalAdapter: h }) },
}));

import { setBetterAuthRole, setBetterAuthBanned, revokeBetterAuthSessions, findBetterAuthUserIdByEmail } from './betterAuthAdmin';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('betterAuthAdmin', () => {
  it('sets the role on the Better Auth user', async () => {
    await setBetterAuthRole('u1', 'therapist');
    expect(h.updateUser).toHaveBeenCalledWith('u1', { role: 'therapist' });
  });

  it('bans and signs the person out everywhere', async () => {
    await setBetterAuthBanned('u1', true);
    expect(h.updateUser).toHaveBeenCalledWith('u1', expect.objectContaining({ banned: true }));
    expect(h.deleteUserSessions).toHaveBeenCalledWith('u1');
  });

  it('unbans without touching sessions', async () => {
    await setBetterAuthBanned('u1', false);
    expect(h.updateUser).toHaveBeenCalledWith('u1', { banned: false, banReason: null, banExpires: null });
    expect(h.deleteUserSessions).not.toHaveBeenCalled();
  });

  it('revokes every session', async () => {
    await revokeBetterAuthSessions('u1');
    expect(h.deleteUserSessions).toHaveBeenCalledWith('u1');
  });

  it('finds a user id by normalized email, or null', async () => {
    h.findUserByEmail.mockResolvedValueOnce({ user: { id: 'u9' }, accounts: [] }).mockResolvedValueOnce(null);
    expect(await findBetterAuthUserIdByEmail(' Asha@X.com ')).toBe('u9');
    expect(h.findUserByEmail).toHaveBeenCalledWith('asha@x.com');
    expect(await findBetterAuthUserIdByEmail('nobody@x.com')).toBeNull();
  });
});
