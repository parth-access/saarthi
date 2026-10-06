import { describe, it, expect } from 'vitest';
import {
  interpretAdminContactsResponse,
  interpretContactMutationResponse,
  GENERIC_CONTACTS_ERROR,
  CONTACTS_SESSION_ERROR,
  CONTACTS_BAD_CURSOR,
} from './adminContactsResponse';

function okBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    success: true,
    generatedAtIso: '2026-10-06T09:00:00.000Z',
    contacts: { ok: true, rows: [], hasMore: false },
    nextCursor: null,
    pageSize: 25,
    ...overrides,
  };
}

describe('interpretAdminContactsResponse', () => {
  it('accepts a well-formed page', () => {
    const result = interpretAdminContactsResponse(200, okBody());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.page.failed).toBe(false);
      expect(result.page.hasMore).toBe(false);
    }
  });

  it('carries the cursor through for accumulation', () => {
    const result = interpretAdminContactsResponse(
      200,
      okBody({ contacts: { ok: true, rows: [], hasMore: true }, nextCursor: '123_contact_9' })
    );
    expect(result.ok && result.page.nextCursor).toBe('123_contact_9');
  });

  it('renders a failed read as data, not an error', () => {
    const result = interpretAdminContactsResponse(
      200,
      okBody({ contacts: { ok: false, reason: 'Could not be read just now. Reload to try again.' } })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.page.failed).toBe(true);
      expect(result.page.failedReason).toContain('Could not be read');
    }
  });

  it('separates a bad cursor from a generic failure', () => {
    const result = interpretAdminContactsResponse(400, { error: CONTACTS_BAD_CURSOR });
    expect(result).toEqual({ ok: false, error: CONTACTS_BAD_CURSOR });
    expect(interpretAdminContactsResponse(401, null)).toEqual({
      ok: false,
      error: CONTACTS_SESSION_ERROR,
    });
    expect(interpretAdminContactsResponse(500, { success: false })).toEqual({
      ok: false,
      error: GENERIC_CONTACTS_ERROR,
    });
  });
});

describe('interpretContactMutationResponse', () => {
  it('accepts success and quotes known refusals', () => {
    expect(interpretContactMutationResponse(200, { success: true })).toEqual({ ok: true });
    const refusal = interpretContactMutationResponse(400, {
      error: 'That status is not one the console can set.',
    });
    expect(refusal.ok).toBe(false);
    expect(refusal.ok ? null : refusal.indeterminate).toBe(false);
  });

  it('treats a transport failure as indeterminate', () => {
    const result = interpretContactMutationResponse(500, null);
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.indeterminate).toBe(true);
  });
});
