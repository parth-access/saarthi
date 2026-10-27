import { describe, it, expect } from 'vitest';
import { planFirebaseImport, type FirebaseUserLike } from './firebaseImport';
import { isFirebaseHash } from './firebasePassword';

const NOW = new Date('2026-10-27T06:00:00Z');

function fbUser(overrides: Partial<FirebaseUserLike> = {}): FirebaseUserLike {
  return {
    uid: 'uid_1',
    email: 'Asha@Example.com',
    emailVerified: true,
    disabled: false,
    metadata: { creationTime: 'Mon, 01 Sep 2026 10:00:00 GMT' },
    providerData: [],
    ...overrides,
  };
}

describe('planFirebaseImport', () => {
  it('keeps the Firebase uid as the user id and lowercases the email', () => {
    const { users } = planFirebaseImport([fbUser()], new Map(), NOW);
    expect(users[0]).toMatchObject({ id: 'uid_1', email: 'asha@example.com', emailVerified: true, role: 'client', banned: false });
    expect(users[0].createdAt.toISOString()).toBe('2026-09-01T10:00:00.000Z');
  });

  it('carries the Firebase password hash with the firebase$ prefix, in standard base64', () => {
    const { accounts } = planFirebaseImport([fbUser({ passwordHash: 'ab-c_d==', passwordSalt: 'sa-lt_==' })], new Map(), NOW);
    expect(accounts).toEqual([
      expect.objectContaining({ providerId: 'credential', accountId: 'uid_1', userId: 'uid_1', password: 'firebase$ab+c/d==$sa+lt/==' }),
    ]);
    expect(isFirebaseHash(accounts[0].password!)).toBe(true);
  });

  it('links Google by the Google sub, and gives a user with both both accounts', () => {
    const { accounts } = planFirebaseImport(
      [fbUser({ passwordHash: 'h', passwordSalt: 's', providerData: [{ providerId: 'google.com', uid: 'google_sub_42' }] })],
      new Map(),
      NOW
    );
    expect(accounts.map((a) => [a.providerId, a.accountId])).toEqual([
      ['credential', 'uid_1'],
      ['google', 'google_sub_42'],
    ]);
  });

  it('takes role and ban state from Firestore, defaulting unknown roles to client', () => {
    const docs = new Map([
      ['uid_admin', { role: 'admin' }],
      ['uid_banned', { role: 'therapist', accountDisabled: true }],
      ['uid_odd', { role: 'superuser' }],
    ]);
    const { users } = planFirebaseImport(
      [
        fbUser({ uid: 'uid_admin', email: 'a@x.com' }),
        fbUser({ uid: 'uid_banned', email: 'b@x.com' }),
        fbUser({ uid: 'uid_odd', email: 'c@x.com' }),
        fbUser({ uid: 'uid_disabled', email: 'd@x.com', disabled: true }),
      ],
      docs,
      NOW
    );
    expect(users.map((u) => [u.id, u.role, u.banned])).toEqual([
      ['uid_admin', 'admin', false],
      ['uid_banned', 'therapist', true],
      ['uid_odd', 'client', false],
      ['uid_disabled', 'client', true],
    ]);
  });

  it('skips users without an email and duplicate emails, and reports them', () => {
    const plan = planFirebaseImport(
      [fbUser({ uid: 'u1', email: 'same@x.com' }), fbUser({ uid: 'u2', email: 'SAME@x.com' }), fbUser({ uid: 'u3', email: undefined })],
      new Map(),
      NOW
    );
    expect(plan.users.map((u) => u.id)).toEqual(['u1']);
    expect(plan.skipped).toEqual([
      { uid: 'u2', reason: 'duplicate_email' },
      { uid: 'u3', reason: 'no_email' },
    ]);
  });

  it('never leaves the required name empty', () => {
    const { users } = planFirebaseImport([fbUser({ displayName: '  ' })], new Map([['uid_1', { name: 'Asha R' }]]), NOW);
    expect(users[0].name).toBe('Asha R');
    expect(planFirebaseImport([fbUser()], new Map(), NOW).users[0].name).toBe('asha');
  });
});
