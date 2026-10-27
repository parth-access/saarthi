import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  findBetterAuthUserIdByEmail: vi.fn(),
  linked: [] as Array<{ id: string }>,
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { getUserByEmail: h.getUserByEmail },
  adminDb: { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: h.linked }) }) }) }) },
}));
vi.mock('@/lib/auth/betterAuthAdmin', () => ({ findBetterAuthUserIdByEmail: h.findBetterAuthUserIdByEmail }));

import { resolveAuthLink } from './profileWrite';

beforeEach(() => {
  vi.clearAllMocks();
  h.linked = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveAuthLink', () => {
  it('links the Firebase account under Firebase', async () => {
    h.getUserByEmail.mockResolvedValue({ uid: 'fb_1' });
    expect(await resolveAuthLink('t@x.com')).toEqual({ email: 't@x.com', authId: 'fb_1', linked: true });
    expect(h.findBetterAuthUserIdByEmail).not.toHaveBeenCalled();
  });

  it('links the Better Auth account under Better Auth', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_PROVIDER', 'better-auth');
    h.findBetterAuthUserIdByEmail.mockResolvedValue('ba_1');
    expect(await resolveAuthLink('t@x.com')).toEqual({ email: 't@x.com', authId: 'ba_1', linked: true });
    expect(h.getUserByEmail).not.toHaveBeenCalled();
  });

  it('stores the email unlinked when the account does not exist yet', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_PROVIDER', 'better-auth');
    h.findBetterAuthUserIdByEmail.mockResolvedValue(null);
    expect(await resolveAuthLink('new@x.com')).toEqual({ email: 'new@x.com', authId: null, linked: false });
  });

  it('refuses an account already linked to another therapist', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_PROVIDER', 'better-auth');
    h.findBetterAuthUserIdByEmail.mockResolvedValue('ba_1');
    h.linked = [{ id: 'other_therapist' }];
    await expect(resolveAuthLink('t@x.com', 'this_therapist')).rejects.toThrow('already linked');
  });
});
