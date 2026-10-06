import { describe, it, expect } from 'vitest';
import { interpretAdminActivityResponse, GENERIC_ACTIVITY_ERROR, ACTIVITY_SESSION_ERROR } from './adminActivityResponse';

function okBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    success: true,
    generatedAtIso: '2026-10-06T09:00:00.000Z',
    pageSize: 30,
    appliedFilter: null,
    nextCursor: null,
    activity: { ok: true, entries: [], hasMore: false },
    ...overrides,
  };
}

describe('interpretAdminActivityResponse', () => {
  it('accepts a well-formed page', () => {
    const result = interpretAdminActivityResponse(200, okBody());
    expect(result.ok).toBe(true);
  });

  it('carries entries and the applied filter through', () => {
    const result = interpretAdminActivityResponse(
      200,
      okBody({
        appliedFilter: { kind: 'bookingId', value: 'bk_1' },
        nextCursor: '1700000000000_tl_9',
        activity: {
          ok: true,
          hasMore: true,
          entries: [
            {
              id: 'tl_1',
              event: 'BookingConfirmed',
              severity: 'info',
              message: 'm',
              actorType: 'admin',
              actorId: 'uid_admin',
              correlationId: 'corr_1',
              bookingId: 'bk_1',
              paymentId: null,
              emailId: null,
              metadata: { source: 'replay' },
              createdAtIso: '2026-10-06T09:00:00.000Z',
            },
          ],
        },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.page.entries[0]?.metadata).toEqual({ source: 'replay' });
    expect(result.page.appliedFilter).toEqual({ kind: 'bookingId', value: 'bk_1' });
    expect(result.page.nextCursor).toBe('1700000000000_tl_9');
  });

  it('renders a failed read as data', () => {
    const result = interpretAdminActivityResponse(
      200,
      okBody({ activity: { ok: false, reason: 'Could not be read just now. Reload to try again.' } })
    );
    expect(result.ok && result.page.failed).toBe(true);
  });

  it('surfaces plan refusals as readable errors', () => {
    const result = interpretAdminActivityResponse(400, { error: 'One filter at a time.' });
    expect(result).toEqual({ ok: false, error: 'One filter at a time.' });
    expect(interpretAdminActivityResponse(401, null)).toEqual({ ok: false, error: ACTIVITY_SESSION_ERROR });
    expect(interpretAdminActivityResponse(500, { success: false })).toEqual({
      ok: false,
      error: GENERIC_ACTIVITY_ERROR,
    });
  });
});
