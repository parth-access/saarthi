import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The rules lock: authority fields on `users` (`role`, `sessionRevokeBefore`,
 * `accountDisabled`) must only be writable through the server — the Admin SDK
 * bypasses rules, so the audited console endpoints are the intended path, and
 * a client-SDK write of any of these keys is refused outright in the rules.
 *
 * There is no emulator harness in this repo, so this is a textual agreement
 * pin in the same spirit as the index-agreement tests: if the deny clause is
 * removed or renamed out of `firestore.rules`, CI fails here instead of the
 * bypass surviving unnoticed.
 */
describe('firestore.rules agreement: users authority fields', () => {
  const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
  const normalized = rules.replace(/\s+/g, ' ');

  it('denies client-SDK updates that touch any authority field', () => {
    expect(normalized).toContain(
      "affectedKeys().hasAny([ 'role', 'sessionRevokeBefore', 'accountDisabled' ])"
    );
  });

  it('denies them in the admin branch, not just the self-service branch', () => {
    // The deny clause must sit in the isAdmin() arm of the update rule — the
    // self-service arm already narrows with hasOnly.
    const adminArm = normalized.slice(
      normalized.indexOf('allow update'),
      normalized.indexOf('allow delete')
    );
    expect(adminArm).toContain('isAdmin()');
    expect(adminArm).toContain('hasAny([');
    expect(adminArm).toContain("'role'");
    expect(adminArm).toContain("'sessionRevokeBefore'");
    expect(adminArm).toContain("'accountDisabled'");
  });

  it('keeps the self-service update branch narrower than the authority set', () => {
    // The self-service allowlist must never grow to include an authority field.
    const selfArm = normalized.slice(normalized.indexOf('hasOnly(['), normalized.indexOf('hasAny(['));
    for (const forbidden of ["'role'", "'sessionRevokeBefore'", "'accountDisabled'"]) {
      expect(selfArm).not.toContain(forbidden);
    }
  });
});
