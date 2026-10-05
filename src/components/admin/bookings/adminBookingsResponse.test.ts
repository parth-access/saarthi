import { describe, it, expect } from 'vitest';
import {
  BOOKINGS_ACCESS_ERROR,
  GENERIC_BOOKINGS_ERROR,
  createLatestRequestGuard,
  interpretAdminBookingsResponse,
} from './adminBookingsResponse';

/**
 * The two ways the fetch path could put the wrong thing in front of an operator:
 * showing a generic message where the API explained itself, and letting a slow
 * response for an abandoned query win the race against the current one.
 */

const PAGE = { pageSize: 25, hasMore: false, nextCursor: null, truncated: false };

function ok(overrides: Record<string, unknown> = {}) {
  return { success: true, mode: 'list', rows: [], page: PAGE, ...overrides };
}

describe('interpretAdminBookingsResponse', () => {
  it('accepts a well-formed list page', () => {
    const result = interpretAdminBookingsResponse(200, ok({ rows: [{ id: 'bk_1' }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.mode).toBe('list');
    expect(result.payload.rows).toHaveLength(1);
    expect(result.payload.page.pageSize).toBe(25);
  });

  it('carries the lookup description through, since the screen states it', () => {
    const result = interpretAdminBookingsResponse(
      200,
      ok({ mode: 'lookup', lookup: { kind: 'namePrefix', matched: 'Case-sensitive prefix.' } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.lookup?.matched).toBe('Case-sensitive prefix.');
  });

  it('shows a refusal in the words the API used', () => {
    // A 400 here names the filter combination that has no index. Replacing it
    // with "something went wrong" leaves the operator with nothing to act on.
    const result = interpretAdminBookingsResponse(400, {
      success: false,
      error: 'Filtering by payment + status together is not indexed.',
    });
    expect(result).toEqual({
      ok: false,
      error: 'Filtering by payment + status together is not indexed.',
    });
  });

  it('passes the 500 message through, which the route has already made safe', () => {
    // The route replaces the Firestore error — project id, index console URL —
    // with its own copy before it ever reaches the browser.
    const result = interpretAdminBookingsResponse(500, {
      success: false,
      error: GENERIC_BOOKINGS_ERROR,
    });
    expect(result).toEqual({ ok: false, error: GENERIC_BOOKINGS_ERROR });
  });

  it('says an authorization failure is an authorization failure', () => {
    for (const status of [401, 403]) {
      const result = interpretAdminBookingsResponse(status, { error: 'Forbidden' });
      expect(result, String(status)).toEqual({ ok: false, error: BOOKINGS_ACCESS_ERROR });
    }
  });

  it('falls back to generic copy when the body is not JSON', () => {
    // A proxy or gateway error page tells an operator nothing useful.
    expect(interpretAdminBookingsResponse(502, null)).toEqual({
      ok: false,
      error: GENERIC_BOOKINGS_ERROR,
    });
    expect(interpretAdminBookingsResponse(502, 'Bad Gateway')).toEqual({
      ok: false,
      error: GENERIC_BOOKINGS_ERROR,
    });
  });

  it('treats a 200 that says it failed as a failure', () => {
    // Trusting the status alone would render an empty table as though the query
    // had genuinely returned nothing.
    expect(interpretAdminBookingsResponse(200, { success: false, error: 'Nope' })).toEqual({
      ok: false,
      error: 'Nope',
    });
  });

  it('refuses a body that is not the shape this screen renders', () => {
    for (const body of [
      {},
      ok({ rows: undefined }),
      ok({ rows: 'not an array' }),
      ok({ page: undefined }),
      ok({ page: { pageSize: 25 } }),
      ok({ page: { ...PAGE, nextCursor: 12 } }),
      ok({ mode: 'something_else' }),
    ]) {
      const result = interpretAdminBookingsResponse(200, body);
      expect(result, JSON.stringify(body)).toEqual({ ok: false, error: GENERIC_BOOKINGS_ERROR });
    }
  });

  it('keeps a real cursor rather than flattening it to null', () => {
    const result = interpretAdminBookingsResponse(
      200,
      ok({ page: { ...PAGE, hasMore: true, nextCursor: '1757000000000.bk_1' } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.page.nextCursor).toBe('1757000000000.bk_1');
  });

  it('never returns an empty error string, which would render as a blank alert', () => {
    for (const body of [{ success: false, error: '' }, { success: false, error: '   ' }]) {
      const result = interpretAdminBookingsResponse(400, body);
      expect(result).toEqual({ ok: false, error: GENERIC_BOOKINGS_ERROR });
    }
  });
});

describe('createLatestRequestGuard', () => {
  it('lets the only request in flight commit', () => {
    const guard = createLatestRequestGuard();
    const first = guard.begin();
    expect(guard.isCurrent(first)).toBe(true);
  });

  it('refuses a response for a query the operator has moved on from', () => {
    // The failure this prevents is silent: the table settles on the results of a
    // filter that is no longer selected, and nothing on screen says so.
    const guard = createLatestRequestGuard();
    const stale = guard.begin();
    const fresh = guard.begin();
    expect(guard.isCurrent(stale)).toBe(false);
    expect(guard.isCurrent(fresh)).toBe(true);
  });

  it('stays correct across a burst of overlapping requests', () => {
    const guard = createLatestRequestGuard();
    const tickets = Array.from({ length: 8 }, () => guard.begin());
    for (const ticket of tickets.slice(0, -1)) {
      expect(guard.isCurrent(ticket)).toBe(false);
    }
    expect(guard.isCurrent(tickets[tickets.length - 1])).toBe(true);
  });

  it('never treats a ticket it did not issue as current', () => {
    const guard = createLatestRequestGuard();
    guard.begin();
    for (const forged of [0, -1, 99, Number.NaN]) {
      expect(guard.isCurrent(forged), String(forged)).toBe(false);
    }
  });
});
