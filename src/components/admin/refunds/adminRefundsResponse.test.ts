import { describe, expect, it } from 'vitest';
import {
  GENERIC_REFUNDS_ERROR,
  REFUNDS_ACCESS_ERROR,
  describeRefundGaps,
  interpretAdminRefundsResponse,
  type AdminRefundsPayload,
} from './adminRefundsResponse';

/**
 * What the refunds page is allowed to believe about a response.
 *
 * The failure being tested is one specific false reassurance: an operator opens
 * this page, sees no refunds owed, and closes it — while the truth was that the
 * list never arrived, arrived without its bound, or arrived one row short.
 */

function refundRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'refund_pay_ABC123',
    bookingId: 'bk_20260901_AAAA1111',
    razorpayPaymentId: 'pay_ABC123',
    razorpayOrderId: 'order_ABC123',
    status: 'PENDING',
    reason: 'cancellation',
    refundPercent: 50,
    attempts: 0,
    refundId: null,
    amountRefundedPaise: null,
    cause: null,
    requestedAtIso: '2026-09-05T11:56:00.000Z',
    updatedAtIso: '2026-09-05T11:56:00.000Z',
    booking: {
      clientName: 'Asha Menon',
      sessionDate: '2026-09-10',
      sessionTime: '10:15',
      status: 'cancelled',
      paymentStatus: 'paid',
      paymentAmountRupees: 1500,
      currency: 'INR',
      refundStatus: null,
    },
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    generatedAtIso: '2026-09-05T12:00:00.000Z',
    scanLimit: 60,
    outstanding: { ok: true, rows: [refundRow()], atLeast: false },
    settled: { ok: true, rows: [], atLeast: false },
    ...overrides,
  };
}

describe('interpretAdminRefundsResponse', () => {
  it('accepts a well-formed payload', () => {
    const result = interpretAdminRefundsResponse(200, body());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.outstanding.ok).toBe(true);
    expect(result.payload.scanLimit).toBe(60);
  });

  it('keeps a scan that admitted its own failure, rather than rejecting the page', () => {
    const result = interpretAdminRefundsResponse(
      200,
      body({ settled: { ok: false, reason: 'Could not be read just now. Reload to try again.' } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.settled.ok).toBe(false);
  });

  it('rejects a payload whose outstanding list is absent, which would read as none owed', () => {
    const { outstanding, ...withoutOutstanding } = body();
    expect(outstanding).toBeDefined();
    expect(interpretAdminRefundsResponse(200, withoutOutstanding)).toEqual({
      ok: false,
      error: GENERIC_REFUNDS_ERROR,
    });
  });

  it('rejects a scan that omits its bound, which would read a capped list as complete', () => {
    const result = interpretAdminRefundsResponse(
      200,
      body({ outstanding: { ok: true, rows: [refundRow()] } })
    );
    expect(result).toEqual({ ok: false, error: GENERIC_REFUNDS_ERROR });
  });

  it('rejects a body that reports failure with a 200', () => {
    const result = interpretAdminRefundsResponse(200, {
      success: false,
      error: 'We could not load refunds right now. Please try again.',
    });
    expect(result).toEqual({
      ok: false,
      error: 'We could not load refunds right now. Please try again.',
    });
  });

  it('treats 401 and 403 as an access problem, not a loading problem', () => {
    expect(interpretAdminRefundsResponse(401, null)).toEqual({
      ok: false,
      error: REFUNDS_ACCESS_ERROR,
    });
    expect(interpretAdminRefundsResponse(403, body())).toEqual({
      ok: false,
      error: REFUNDS_ACCESS_ERROR,
    });
  });

  it('falls back to generic copy when a non-JSON response arrives', () => {
    expect(interpretAdminRefundsResponse(500, null)).toEqual({
      ok: false,
      error: GENERIC_REFUNDS_ERROR,
    });
    expect(interpretAdminRefundsResponse(200, 'not json')).toEqual({
      ok: false,
      error: GENERIC_REFUNDS_ERROR,
    });
  });
});

describe('row validation', () => {
  const withRow = (overrides: Record<string, unknown>) =>
    interpretAdminRefundsResponse(
      200,
      body({ outstanding: { ok: true, rows: [refundRow(overrides)], atLeast: false } })
    );

  it('rejects the payload rather than dropping an unreadable refund from the queue', () => {
    // Silently filtering this row out is the one outcome that must not happen:
    // the queue would be one refund short and look complete.
    expect(withRow({ status: undefined })).toEqual({ ok: false, error: GENERIC_REFUNDS_ERROR });
    expect(withRow({ attempts: undefined })).toEqual({ ok: false, error: GENERIC_REFUNDS_ERROR });
    expect(withRow({ id: '' })).toEqual({ ok: false, error: GENERIC_REFUNDS_ERROR });
  });

  it('refuses a cause that is not one of the four this build classifies', () => {
    // The whole point of the union: raw error text must not arrive as a cause.
    expect(
      withRow({ cause: { kind: '9 FAILED_PRECONDITION: create an index at ...' } })
    ).toEqual({ ok: false, error: GENERIC_REFUNDS_ERROR });
    expect(withRow({ cause: { kind: 'payment_not_captured', gatewayStatus: 5 } })).toEqual({
      ok: false,
      error: GENERIC_REFUNDS_ERROR,
    });
  });

  it('accepts each cause the server can actually send', () => {
    for (const cause of [
      null,
      { kind: 'payment_unknown_at_gateway' },
      { kind: 'payment_not_captured', gatewayStatus: 'authorized' },
      { kind: 'payment_not_captured', gatewayStatus: null },
      { kind: 'nothing_to_refund' },
      { kind: 'unclassified' },
    ]) {
      expect(withRow({ cause }).ok).toBe(true);
    }
  });

  it('rejects a non-finite rupee figure instead of rendering NaN beside a refund', () => {
    expect(withRow({ amountRefundedPaise: Number.NaN })).toEqual({
      ok: false,
      error: GENERIC_REFUNDS_ERROR,
    });
  });

  it('accepts a refund whose booking could not be joined', () => {
    expect(withRow({ booking: null }).ok).toBe(true);
  });
});

describe('describeRefundGaps', () => {
  const payload = (overrides: Partial<AdminRefundsPayload>): AdminRefundsPayload => ({
    generatedAtIso: '2026-09-05T12:00:00.000Z',
    scanLimit: 60,
    outstanding: { ok: true, rows: [], atLeast: false },
    settled: { ok: true, rows: [], atLeast: false },
    ...overrides,
  });

  it('says nothing when both lists were read', () => {
    expect(describeRefundGaps(payload({}))).toBeNull();
  });

  it('says the money owed is missing, not empty', () => {
    const gaps = describeRefundGaps(payload({ outstanding: { ok: false, reason: 'nope' } }));
    expect(gaps?.labels).toEqual(['Refunds owed']);
    expect(gaps?.sentence).toContain('missing, not empty');
  });

  it('names both lists when neither could be read', () => {
    const gaps = describeRefundGaps(
      payload({
        outstanding: { ok: false, reason: 'nope' },
        settled: { ok: false, reason: 'nope' },
      })
    );
    expect(gaps?.sentence).toContain('Refunds owed and Settled refunds');
    expect(gaps?.sentence).toContain('2 lists');
  });
});
