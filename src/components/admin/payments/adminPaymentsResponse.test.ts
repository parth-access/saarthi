import { describe, expect, it } from 'vitest';
import {
  GENERIC_PAYMENTS_ERROR,
  PAYMENTS_ACCESS_ERROR,
  interpretAdminPaymentsResponse,
  type AdminPaymentsPayload,
} from './adminPaymentsResponse';

/**
 * The gate between a payments response and the screen. The reconciliation is only
 * as honest as its inputs, so a malformed side must be refused, not compared: two
 * `undefined`s read as agreement, and a paid booking with a corrupt gateway
 * document would render as reconciled when it is not. These are the refusals.
 */

/** A payments document with every field the narrower checks, all well-typed. */
function paymentDoc() {
  return {
    orderId: 'order_1',
    bookingId: 'bk_1',
    status: 'paid',
    amountRupees: 1500,
    currency: 'INR',
    razorpayOrderId: 'order_1',
    razorpayPaymentId: 'pay_1',
    source: 'checkout',
    createdAtIso: '2026-09-01T00:00:00.000Z',
    verifiedAtIso: null,
    refundedAtIso: null,
  };
}

function orderRow() {
  return {
    orderId: 'order_1',
    bookingId: 'bk_1',
    status: 'paid',
    amountRupees: 1500,
    currency: 'INR',
    razorpayPaymentId: 'pay_1',
    source: 'checkout',
    createdAtIso: '2026-09-01T00:00:00.000Z',
  };
}

/** A well-formed 200 body. Individual tests corrupt one part of a copy. */
function body(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    generatedAtIso: '2026-09-05T09:00:00.000Z',
    scanLimit: 40,
    recent: { ok: true, rows: [orderRow()], atLeast: false },
    trace: null,
    ...overrides,
  };
}

function expectOk(result: ReturnType<typeof interpretAdminPaymentsResponse>): AdminPaymentsPayload {
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return result.payload;
}

describe('interpretAdminPaymentsResponse — auth and transport', () => {
  it('reads 401 and 403 as a session that lost admin access', () => {
    expect(interpretAdminPaymentsResponse(401, null)).toEqual({ ok: false, error: PAYMENTS_ACCESS_ERROR });
    expect(interpretAdminPaymentsResponse(403, null)).toEqual({ ok: false, error: PAYMENTS_ACCESS_ERROR });
  });

  it("lets the server's own sentence through on a 5xx", () => {
    const result = interpretAdminPaymentsResponse(500, { error: 'We could not load payments right now.' });
    expect(result).toEqual({ ok: false, error: 'We could not load payments right now.' });
  });

  it('falls back to the generic error when a failure carries no usable sentence', () => {
    expect(interpretAdminPaymentsResponse(503, {})).toEqual({ ok: false, error: GENERIC_PAYMENTS_ERROR });
  });

  it('treats a 200 that admits success:false as a failure', () => {
    const result = interpretAdminPaymentsResponse(200, body({ success: false, error: 'assembly failed' }));
    expect(result).toEqual({ ok: false, error: 'assembly failed' });
  });

  it('rejects a 200 whose body is not an object', () => {
    expect(interpretAdminPaymentsResponse(200, null)).toEqual({ ok: false, error: GENERIC_PAYMENTS_ERROR });
  });
});

describe('interpretAdminPaymentsResponse — a missing scan is not an empty scan', () => {
  it('rejects a body with no recent scan', () => {
    const { recent, ...withoutRecent } = body();
    void recent;
    expect(interpretAdminPaymentsResponse(200, withoutRecent)).toEqual({
      ok: false,
      error: GENERIC_PAYMENTS_ERROR,
    });
  });

  it('rejects a scan missing its admitted bound', () => {
    const result = interpretAdminPaymentsResponse(200, body({ recent: { ok: true, rows: [] } }));
    expect(result.ok).toBe(false);
  });

  it('rejects a scan with one malformed row rather than dropping it', () => {
    const bad = { ...orderRow(), amountRupees: 'fifteen hundred' };
    const result = interpretAdminPaymentsResponse(200, body({ recent: { ok: true, rows: [bad], atLeast: false } }));
    expect(result.ok).toBe(false);
  });

  it('accepts an admitted scan failure as data', () => {
    const result = interpretAdminPaymentsResponse(200, body({ recent: { ok: false, reason: 'Could not be read.' } }));
    const payload = expectOk(result);
    expect(payload.recent.ok).toBe(false);
  });

  it('requires the scanLimit that sizes the scan', () => {
    const { scanLimit, ...withoutLimit } = body();
    void scanLimit;
    expect(interpretAdminPaymentsResponse(200, withoutLimit).ok).toBe(false);
  });
});

describe('interpretAdminPaymentsResponse — a malformed trace side is not an empty side', () => {
  it('accepts a body with no trace (the page opened without a search)', () => {
    const payload = expectOk(interpretAdminPaymentsResponse(200, body({ trace: null })));
    expect(payload.trace).toBeNull();
  });

  it('accepts a matched-nothing trace with both sides null', () => {
    const trace = { ok: true, query: 'order_x', payment: null, booking: null, receiptNumber: null };
    const payload = expectOk(interpretAdminPaymentsResponse(200, body({ trace })));
    expect(payload.trace?.ok).toBe(true);
  });

  it('accepts an admitted trace failure carrying its query and reason', () => {
    const trace = { ok: false, query: 'order_x', reason: 'Could not be read just now.' };
    const payload = expectOk(interpretAdminPaymentsResponse(200, body({ trace })));
    expect(payload.trace?.ok).toBe(false);
  });

  it('rejects the whole payload when the payment side has a wrong-typed field', () => {
    const trace = {
      ok: true,
      query: 'order_1',
      payment: { ...paymentDoc(), amountRupees: 'lots' },
      booking: null,
      receiptNumber: null,
    };
    expect(interpretAdminPaymentsResponse(200, body({ trace }))).toEqual({
      ok: false,
      error: GENERIC_PAYMENTS_ERROR,
    });
  });

  it('rejects a trace ok:true that has lost its query', () => {
    const trace = { ok: true, payment: null, booking: null, receiptNumber: null };
    expect(interpretAdminPaymentsResponse(200, body({ trace })).ok).toBe(false);
  });

  it('accepts a fully-populated payment document', () => {
    const trace = { ok: true, query: 'order_1', payment: paymentDoc(), booking: null, receiptNumber: 'SAAR-1' };
    const payload = expectOk(interpretAdminPaymentsResponse(200, body({ trace })));
    expect(payload.trace?.ok).toBe(true);
  });
});
