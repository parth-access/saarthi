import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Making an account a therapist links the profile an admin gave its email to,
 * so a therapist who signed up after their profile was made is not left on
 * "No therapist profile found". Only one unambiguous, unlinked profile links.
 */
interface FakeProfile {
  id: string;
  email?: string;
  authId?: string;
}

const h = vi.hoisted(() => ({
  users: {} as Record<string, { email?: string }>,
  profiles: [] as FakeProfile[],
  profileUpdate: vi.fn(),
  userUpdate: vi.fn(),
  setBetterAuthRole: vi.fn(),
  logError: vi.fn(),
}));

function snapshot(docs: FakeProfile[]) {
  return {
    empty: docs.length === 0,
    docs: docs.map((p) => ({
      id: p.id,
      get: (field: keyof FakeProfile) => p[field],
      ref: { update: (data: unknown) => h.profileUpdate(p.id, data) },
    })),
  };
}

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {},
  adminDb: {
    collection: (name: string) =>
      name === 'users'
        ? {
            doc: (id: string) => ({
              get: async () => ({ get: (field: 'email') => h.users[id]?.[field] }),
              update: h.userUpdate,
            }),
          }
        : {
            where: (field: 'authId' | 'email', op: string, value: string | string[]) => ({
              limit: (n: number) => ({
                get: async () =>
                  snapshot(
                    h.profiles
                      .filter((p) => (op === 'in' ? (value as string[]).includes(p[field] ?? '') : p[field] === value))
                      .slice(0, n)
                  ),
              }),
            }),
          },
  },
}));
vi.mock('firebase-admin/firestore', () => ({ Timestamp: { now: () => 'NOW', fromMillis: vi.fn() } }));
vi.mock('@/lib/auth/betterAuthAdmin', () => ({
  setBetterAuthRole: h.setBetterAuthRole,
  setBetterAuthBanned: vi.fn(),
  revokeBetterAuthSessions: vi.fn(),
}));
vi.mock('../../_lib/logger', () => ({ logger: { error: h.logError, info: vi.fn() } }));

import { setUserRole } from './usersSources';

beforeEach(() => {
  vi.clearAllMocks();
  h.users = { u1: { email: 'Parth@SaarthiLife.com' } };
  h.profiles = [];
});

describe('linking the therapist profile on a role change', () => {
  it('links the one unlinked profile with this email, matching it case-insensitively', async () => {
    h.profiles = [{ id: 't1', email: 'parth@saarthilife.com' }];
    expect(await setUserRole('u1', 'therapist')).toEqual({ ok: true });
    expect(h.profileUpdate).toHaveBeenCalledWith('t1', { authId: 'u1' });
  });

  it('does nothing for any role but therapist', async () => {
    h.profiles = [{ id: 't1', email: 'parth@saarthilife.com' }];
    await setUserRole('u1', 'client');
    expect(h.profileUpdate).not.toHaveBeenCalled();
  });

  it('leaves a profile already linked to another account alone', async () => {
    h.profiles = [{ id: 't1', email: 'parth@saarthilife.com', authId: 'someone-else' }];
    await setUserRole('u1', 'therapist');
    expect(h.profileUpdate).not.toHaveBeenCalled();
  });

  it('does not link a second profile when this account is already linked', async () => {
    h.profiles = [
      { id: 't0', authId: 'u1' },
      { id: 't1', email: 'parth@saarthilife.com' },
    ];
    await setUserRole('u1', 'therapist');
    expect(h.profileUpdate).not.toHaveBeenCalled();
  });

  it('links nothing when two profiles share the email', async () => {
    h.profiles = [
      { id: 't1', email: 'parth@saarthilife.com' },
      { id: 't2', email: 'parth@saarthilife.com' },
    ];
    await setUserRole('u1', 'therapist');
    expect(h.profileUpdate).not.toHaveBeenCalled();
  });

  it('still reports the role change as done when the link fails', async () => {
    h.profiles = [{ id: 't1', email: 'parth@saarthilife.com' }];
    h.profileUpdate.mockRejectedValueOnce(new Error('db down'));
    expect(await setUserRole('u1', 'therapist')).toEqual({ ok: true });
    expect(h.logError).toHaveBeenCalled();
  });
});
