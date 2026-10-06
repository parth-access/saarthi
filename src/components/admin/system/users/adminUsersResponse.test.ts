import { describe, it, expect } from 'vitest';
import {
  GENERIC_USERS_ERROR,
  interpretAdminUsersResponse,
  interpretUserMutationResponse,
} from './adminUsersResponse';

const OK_BODY = {
  success: true,
  generatedAtIso: '2026-10-06T10:00:00.000Z',
  selfUid: 'admin_user_1',
  mode: 'page',
  users: {
    ok: true,
    rows: [{ id: 'u_1', name: 'A', email: 'a@x.com', role: 'client' }],
    hasMore: true,
  },
  nextCursor: '1700000000000_u_1',
  pageSize: 25,
  administrators: { ok: true, count: 2 },
};

describe('interpretAdminUsersResponse', () => {
  it('parses a page: rows, cursor, selfUid and the administrator count', () => {
    const result = interpretAdminUsersResponse(200, OK_BODY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.rows).toHaveLength(1);
    expect(result.payload.selfUid).toBe('admin_user_1');
    expect(result.payload.hasMore).toBe(true);
    expect(result.payload.nextCursor).toBe('1700000000000_u_1');
    expect(result.payload.administrators).toEqual({ ok: true, count: 2 });
    expect(result.payload.failed).toBe(false);
  });

  it('turns a failed read into data with the server sentence verbatim', () => {
    const result = interpretAdminUsersResponse(200, {
      ...OK_BODY,
      users: { ok: false, reason: 'Could not be read just now. Reload to try again.' },
      nextCursor: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.failed).toBe(true);
    expect(result.payload.failedReason).toBe('Could not be read just now. Reload to try again.');
    expect(result.payload.rows).toEqual([]);
  });

  it('names the session problem instead of offering a reload that cannot help', () => {
    expect(interpretAdminUsersResponse(401, null)).toMatchObject({ ok: false });
  });

  it('refuses to parse a 500 into rows', () => {
    expect(interpretAdminUsersResponse(500, OK_BODY)).toMatchObject({
      ok: false,
      error: GENERIC_USERS_ERROR,
    });
  });

  it('carries a failed administrator count as data, not as zero admins', () => {
    const result = interpretAdminUsersResponse(200, {
      ...OK_BODY,
      administrators: { ok: false, reason: 'The administrator count could not be read just now.' },
    });
    if (!result.ok) return;
    expect(result.payload.administrators).toEqual({
      ok: false,
      reason: 'The administrator count could not be read just now.',
    });
  });
});

describe('interpretUserMutationResponse', () => {
  it('returns the server summary verbatim on success', () => {
    const result = interpretUserMutationResponse(200, {
      success: true,
      changed: true,
      summary: 'Every session issued before now is rejected.',
    });
    expect(result).toEqual({ ok: true, changed: true, summary: 'Every session issued before now is rejected.' });
  });

  it('treats a no-op as success without a reload-worthy change', () => {
    const result = interpretUserMutationResponse(200, {
      success: true,
      changed: false,
      summary: 'Nothing was written.',
    });
    expect(result).toEqual({ ok: true, changed: false, summary: 'Nothing was written.' });
  });

  it('quotes authored refusals — the last-admin sentence is known, not unknown', () => {
    const result = interpretUserMutationResponse(409, {
      error: 'This is the last administrator account. Grant the administrator role to another account first, then change this one.',
    });
    expect(result).toMatchObject({ ok: false, indeterminate: false });
  });

  it('treats silence as indeterminate — reload, never retry', () => {
    expect(interpretUserMutationResponse(500, null)).toMatchObject({ ok: false, indeterminate: true });
  });
});
