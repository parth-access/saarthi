import { describe, it, expect } from 'vitest';
import {
  USER_ROLES,
  disableDecision,
  isUserRole,
  roleChangeDecision,
  userRoleBadge,
  userRoleLabel,
} from './usersTriage';

/**
 * The invariants that make role mutation safe to offer at all. These are pure
 * decisions on purpose: the route applies them, and these tests pin them
 * independently of Firestore, rate limits or sessions.
 */
describe('usersTriage invariants', () => {
  const base = {
    targetUid: 'user_b',
    actorUid: 'user_a',
    currentRole: 'client',
    nextRole: 'admin' as const,
    otherAdministratorCount: 1,
  };

  it('keeps the role vocabulary closed to the three roles the platform reads', () => {
    expect(USER_ROLES).toEqual(['admin', 'therapist', 'client']);
    expect(isUserRole('admin')).toBe(true);
    expect(isUserRole('superadmin')).toBe(false);
    expect(isUserRole(null)).toBe(false);
  });

  it('labels an unknown stored role instead of pretending it is a client', () => {
    expect(userRoleLabel('client')).toBe('Client');
    expect(userRoleLabel('superadmin')).toBe('Unknown (superadmin)');
    expect(userRoleBadge('superadmin').tone).toBe('warning');
  });

  it('changes a role when every guard passes', () => {
    expect(roleChangeDecision(base)).toEqual({ kind: 'proceed' });
  });

  it('refuses an administrator mutating their own account', () => {
    const decision = roleChangeDecision({ ...base, targetUid: 'user_a' });
    expect(decision).toMatchObject({ kind: 'refuse', status: 400 });
  });

  it('treats a same-role write as a no-op rather than rewriting the document', () => {
    const decision = roleChangeDecision({ ...base, currentRole: 'admin' });
    expect(decision).toMatchObject({ kind: 'noop' });
  });

  it('refuses to demote the last administrator', () => {
    const decision = roleChangeDecision({
      ...base,
      currentRole: 'admin',
      nextRole: 'client',
      otherAdministratorCount: 0,
    });
    expect(decision).toMatchObject({ kind: 'refuse', status: 409 });
    expect((decision as { error: string }).error).toContain('last administrator');
  });

  it('does not invoke the last-admin guard when promoting or staying an admin', () => {
    // Promoting someone to admin can never remove the last admin.
    expect(roleChangeDecision({ ...base, otherAdministratorCount: 0 })).toEqual({ kind: 'proceed' });
    // An admin re-selected as admin is a no-op, not a guarded write.
    expect(
      roleChangeDecision({ ...base, currentRole: 'admin', nextRole: 'admin', otherAdministratorCount: 0 })
    ).toMatchObject({ kind: 'noop' });
  });

  it('refuses disabling the last administrator but allows it when another exists', () => {
    const lastAdmin = disableDecision({
      targetUid: 'user_b',
      actorUid: 'user_a',
      currentRole: 'admin',
      otherAdministratorCount: 0,
    });
    expect(lastAdmin).toMatchObject({ kind: 'refuse', status: 409 });

    const withBackup = disableDecision({
      targetUid: 'user_b',
      actorUid: 'user_a',
      currentRole: 'admin',
      otherAdministratorCount: 1,
    });
    expect(withBackup).toEqual({ kind: 'proceed' });
  });

  it('refuses disabling or enabling (and therefore locking out) your own account', () => {
    const decision = disableDecision({
      targetUid: 'user_a',
      actorUid: 'user_a',
      currentRole: 'client',
      otherAdministratorCount: 3,
    });
    expect(decision).toMatchObject({ kind: 'refuse', status: 400 });
  });
});
