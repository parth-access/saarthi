import { describe, expect, it } from 'vitest';
import {
  CLIENTS_ACCESS_ERROR,
  GENERIC_CLIENTS_ERROR,
  interpretAdminClientsResponse,
  type AdminClientsPayload,
} from './adminClientsResponse';

/**
 * The gate between a clients response and the screen. The profile aggregate is
 * summed in the browser from these rows, so a malformed row is the failure that
 * matters: one NaN amount or undefined status would skew a lifetime total or a
 * status count. A missing scan is refused too — a truncated body must never read
 * as "no recent clients". These are the refusals.
 */

/** A booking row with every field the narrower checks, all well-typed. */
function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bk_1',
    email: 'asha@example.com',
    name: 'Asha',
    phone: '+91 90000 00000',
    userId: 'u1',
    therapistId: 't1',
    therapistName: 'Dr. Rao',
    sessionDate: '2026-09-10',
    sessionTime: '10:00',
    sessionType: 'Therapy',
    sessionMode: 'online',
    status: 'confirmed',
    paymentStatus: 'paid',
    amountRupees: 1500,
    currency: 'INR',
    refundStatus: null,
    refundAmountPaise: null,
    createdAtIso: '2026-09-01T00:00:00.000Z',
    sessionStartIso: '2026-09-10T04:30:00.000Z',
    ...overrides,
  };
}

/** A well-formed 200 body. Individual tests corrupt one part of a copy. */
function body(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    generatedAtIso: '2026-09-05T09:00:00.000Z',
    scanLimit: 60,
    profileLimit: 200,
    recent: { ok: true, rows: [clientRow()], atLeast: false },
    profile: null,
    ...overrides,
  };
}

function expectOk(result: ReturnType<typeof interpretAdminClientsResponse>): AdminClientsPayload {
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return result.payload;
}

describe('interpretAdminClientsResponse — auth and transport', () => {
  it('reads 401 and 403 as a session that lost admin access', () => {
    expect(interpretAdminClientsResponse(401, null)).toEqual({ ok: false, error: CLIENTS_ACCESS_ERROR });
    expect(interpretAdminClientsResponse(403, null)).toEqual({ ok: false, error: CLIENTS_ACCESS_ERROR });
  });

  it("lets the server's own sentence through on a 5xx", () => {
    const result = interpretAdminClientsResponse(500, { error: 'We could not load clients right now.' });
    expect(result).toEqual({ ok: false, error: 'We could not load clients right now.' });
  });

  it('falls back to the generic error when a failure carries no usable sentence', () => {
    expect(interpretAdminClientsResponse(503, {})).toEqual({ ok: false, error: GENERIC_CLIENTS_ERROR });
  });

  it('treats a 200 that admits success:false as a failure', () => {
    const result = interpretAdminClientsResponse(200, body({ success: false, error: 'assembly failed' }));
    expect(result).toEqual({ ok: false, error: 'assembly failed' });
  });

  it('rejects a 200 whose body is not an object', () => {
    expect(interpretAdminClientsResponse(200, null)).toEqual({ ok: false, error: GENERIC_CLIENTS_ERROR });
  });
});

describe('interpretAdminClientsResponse — a missing scan is not an empty scan', () => {
  it('rejects a body with no recent scan', () => {
    const { recent, ...withoutRecent } = body();
    void recent;
    expect(interpretAdminClientsResponse(200, withoutRecent)).toEqual({
      ok: false,
      error: GENERIC_CLIENTS_ERROR,
    });
  });

  it('rejects a scan missing its admitted bound', () => {
    const result = interpretAdminClientsResponse(200, body({ recent: { ok: true, rows: [] } }));
    expect(result.ok).toBe(false);
  });

  it('rejects a scan with one malformed row rather than dropping it', () => {
    const bad = clientRow({ amountRupees: 'fifteen hundred' });
    const result = interpretAdminClientsResponse(200, body({ recent: { ok: true, rows: [bad], atLeast: false } }));
    expect(result.ok).toBe(false);
  });

  it('accepts an admitted scan failure as data', () => {
    const result = interpretAdminClientsResponse(200, body({ recent: { ok: false, reason: 'Could not be read.' } }));
    const payload = expectOk(result);
    expect(payload.recent.ok).toBe(false);
  });

  it('requires the scanLimit and profileLimit that size the reads', () => {
    const { scanLimit, ...withoutScan } = body();
    void scanLimit;
    expect(interpretAdminClientsResponse(200, withoutScan).ok).toBe(false);
    const { profileLimit, ...withoutProfileLimit } = body();
    void profileLimit;
    expect(interpretAdminClientsResponse(200, withoutProfileLimit).ok).toBe(false);
  });
});

describe('interpretAdminClientsResponse — a malformed profile side is not an empty side', () => {
  it('accepts a body with no profile (the page opened without a search)', () => {
    const payload = expectOk(interpretAdminClientsResponse(200, body({ profile: null })));
    expect(payload.profile).toBeNull();
  });

  it('accepts a matched-nothing profile as a valid empty result, not an error', () => {
    const profile = { ok: true, query: 'nobody@example.com', email: 'nobody@example.com', rows: [], atLeast: false };
    const payload = expectOk(interpretAdminClientsResponse(200, body({ profile })));
    expect(payload.profile?.ok).toBe(true);
  });

  it('accepts an admitted profile failure carrying its query and reason', () => {
    const profile = { ok: false, query: 'asha@example.com', reason: 'Could not be read just now.' };
    const payload = expectOk(interpretAdminClientsResponse(200, body({ profile })));
    expect(payload.profile?.ok).toBe(false);
  });

  it('rejects the whole payload when a profile row has a wrong-typed field', () => {
    const profile = {
      ok: true,
      query: 'asha@example.com',
      email: 'asha@example.com',
      rows: [clientRow({ amountRupees: 'lots' })],
      atLeast: false,
    };
    expect(interpretAdminClientsResponse(200, body({ profile }))).toEqual({
      ok: false,
      error: GENERIC_CLIENTS_ERROR,
    });
  });

  it('rejects a profile ok:true that has lost its email', () => {
    const profile = { ok: true, query: 'asha@example.com', rows: [], atLeast: false };
    expect(interpretAdminClientsResponse(200, body({ profile })).ok).toBe(false);
  });

  it('rejects a profile that has lost its query', () => {
    const profile = { ok: true, email: 'asha@example.com', rows: [], atLeast: false };
    expect(interpretAdminClientsResponse(200, body({ profile })).ok).toBe(false);
  });

  it('accepts a fully-populated profile with rows', () => {
    const profile = {
      ok: true,
      query: 'asha@example.com',
      email: 'asha@example.com',
      rows: [clientRow(), clientRow({ id: 'bk_2', status: 'completed' })],
      atLeast: false,
    };
    const payload = expectOk(interpretAdminClientsResponse(200, body({ profile })));
    expect(payload.profile?.ok).toBe(true);
  });
});
