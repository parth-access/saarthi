import { describe, expect, it } from 'vitest';
import {
  reconcilePayment,
  type AdminPaymentBooking,
  type AdminPaymentDoc,
  type PaymentDiscrepancy,
} from './paymentTrace';

/**
 * The reconciliation at the centre of the payments trace.
 *
 * Every test here is a way two records disagree, because that is the only reason
 * this screen exists — an operator who just wants the amount reads it off the
 * booking. The failures under test: a paid booking looking unpaid because two
 * spellings of "paid" were compared as strings; a receipt number leaking onto an
 * unpaid booking; an orphaned gateway order passing unnoticed.
 */

function paymentDoc(overrides: Partial<AdminPaymentDoc> = {}): AdminPaymentDoc {
  return {
    orderId: 'order_A',
    bookingId: 'bk_1',
    status: 'success',
    amountRupees: 1500,
    currency: 'INR',
    razorpayOrderId: 'order_A',
    razorpayPaymentId: 'pay_A',
    source: 'checkout',
    createdAtIso: '2026-09-01T10:00:00.000Z',
    verifiedAtIso: '2026-09-01T10:01:00.000Z',
    refundedAtIso: null,
    ...overrides,
  };
}

function booking(overrides: Partial<AdminPaymentBooking> = {}): AdminPaymentBooking {
  return {
    id: 'bk_1',
    clientName: 'A. Client',
    clientEmail: 'client@example.com',
    sessionDate: '2026-09-10',
    sessionTime: '09:00',
    sessionType: 'Individual therapy',
    bookingStatus: 'confirmed',
    paymentStatus: 'paid',
    amountRupees: 1500,
    currency: 'INR',
    razorpayOrderId: 'order_A',
    razorpayPaymentId: 'pay_A',
    paidAtIso: '2026-09-01T10:01:00.000Z',
    refundStatus: null,
    refundId: null,
    refundAmountPaise: null,
    refundedAtIso: null,
    ...overrides,
  };
}

function kinds(list: readonly PaymentDiscrepancy[]): string[] {
  return list.map((d) => d.kind);
}

describe('reconcilePayment — presence', () => {
  it('reports both, and no presence-level discrepancy, when the records agree', () => {
    const trace = reconcilePayment(paymentDoc(), booking(), 'SAAR-2026-XXXX');
    expect(trace.presence).toBe('both');
    expect(kinds(trace.discrepancies)).toEqual([]);
  });

  it('flags a gateway order with no booking as a danger — money with nowhere to sit', () => {
    const trace = reconcilePayment(paymentDoc(), null, null);
    expect(trace.presence).toBe('payment_only');
    const orphan = trace.discrepancies.find((d) => d.kind === 'payment_without_booking');
    expect(orphan?.tone).toBe('danger');
  });

  it('treats a paid booking with no gateway document as expected, not wrong', () => {
    const trace = reconcilePayment(null, booking({ paymentStatus: 'paid' }), 'SAAR-2026-XXXX');
    expect(trace.presence).toBe('booking_only');
    const gap = trace.discrepancies.find((d) => d.kind === 'paid_without_payment_doc');
    expect(gap?.tone).toBe('info');
  });

  it('does not raise the missing-document note for an unpaid booking', () => {
    const trace = reconcilePayment(null, booking({ paymentStatus: 'pending' }), null);
    expect(kinds(trace.discrepancies)).not.toContain('paid_without_payment_doc');
  });

  it('reports neither when nothing was found', () => {
    const trace = reconcilePayment(null, null, null);
    expect(trace.presence).toBe('neither');
    expect(trace.capture.captured).toBe(false);
    expect(trace.capture.source).toBe('none');
  });
});

describe('reconcilePayment — capture verdict', () => {
  it('reads capture from the booking, which is the record of truth', () => {
    const trace = reconcilePayment(paymentDoc({ status: 'failed' }), booking({ paymentStatus: 'paid' }), 'SAAR-1');
    expect(trace.capture).toMatchObject({ captured: true, source: 'booking' });
  });

  it('falls back to the payment document only when there is no booking', () => {
    const trace = reconcilePayment(paymentDoc({ status: 'success' }), null, null);
    expect(trace.capture).toMatchObject({ captured: true, source: 'payment' });
  });
});

describe('reconcilePayment — discrepancies', () => {
  it('flags an amount mismatch and carries both figures for the sentence', () => {
    const trace = reconcilePayment(paymentDoc({ amountRupees: 1500 }), booking({ amountRupees: 1200 }), 'SAAR-1');
    const found = trace.discrepancies.find((d) => d.kind === 'amount_mismatch');
    expect(found).toMatchObject({ tone: 'danger', paymentRupees: 1500, bookingRupees: 1200 });
  });

  it('does not flag rounding-level differences as a mismatch', () => {
    const trace = reconcilePayment(paymentDoc({ amountRupees: 1500 }), booking({ amountRupees: 1500.001 }), 'SAAR-1');
    expect(kinds(trace.discrepancies)).not.toContain('amount_mismatch');
  });

  it('does not compare amounts when one side has none', () => {
    const trace = reconcilePayment(paymentDoc({ amountRupees: null }), booking({ amountRupees: 1500 }), 'SAAR-1');
    expect(kinds(trace.discrepancies)).not.toContain('amount_mismatch');
  });

  it('treats success and paid as the same captured state, not a status conflict', () => {
    const trace = reconcilePayment(paymentDoc({ status: 'success' }), booking({ paymentStatus: 'paid' }), 'SAAR-1');
    expect(kinds(trace.discrepancies)).not.toContain('status_mismatch');
  });

  it('flags a real capture disagreement between the two records', () => {
    const trace = reconcilePayment(paymentDoc({ status: 'failed' }), booking({ paymentStatus: 'paid' }), 'SAAR-1');
    const found = trace.discrepancies.find((d) => d.kind === 'status_mismatch');
    expect(found).toMatchObject({ tone: 'danger', paymentStatus: 'failed', bookingStatus: 'paid' });
  });

  it('flags a payment id that belongs to a different payment', () => {
    const trace = reconcilePayment(paymentDoc({ razorpayPaymentId: 'pay_X' }), booking({ razorpayPaymentId: 'pay_Y' }), 'SAAR-1');
    expect(kinds(trace.discrepancies)).toContain('payment_id_mismatch');
  });

  it('does not flag an id mismatch when only one side records the id', () => {
    const trace = reconcilePayment(paymentDoc({ razorpayPaymentId: null }), booking({ razorpayPaymentId: 'pay_Y' }), 'SAAR-1');
    expect(kinds(trace.discrepancies)).not.toContain('payment_id_mismatch');
  });

  it('flags an order id that does not match between the records', () => {
    const trace = reconcilePayment(paymentDoc({ razorpayOrderId: 'order_X' }), booking({ razorpayOrderId: 'order_Y' }), 'SAAR-1');
    expect(kinds(trace.discrepancies)).toContain('order_id_mismatch');
  });
});

describe('reconcilePayment — receipt', () => {
  it('shows the receipt number only when the booking is captured', () => {
    const paid = reconcilePayment(paymentDoc(), booking({ paymentStatus: 'paid' }), 'SAAR-2026-ABCD');
    expect(paid.receipt).toEqual({ available: true, number: 'SAAR-2026-ABCD' });
  });

  it('withholds a stray number for an unpaid booking rather than implying a receipt', () => {
    const unpaid = reconcilePayment(paymentDoc({ status: 'pending' }), booking({ paymentStatus: 'pending' }), 'SAAR-2026-ABCD');
    expect(unpaid.receipt).toEqual({ available: false, number: null });
  });

  it('has no receipt for an orphaned payment with no booking', () => {
    const trace = reconcilePayment(paymentDoc(), null, 'SAAR-2026-ABCD');
    expect(trace.receipt).toEqual({ available: false, number: null });
  });
});

describe('reconcilePayment — refund', () => {
  it('surfaces a refund standing from the booking with its reference', () => {
    const trace = reconcilePayment(
      paymentDoc(),
      booking({ paymentStatus: 'refunded', refundStatus: 'refunded', refundId: 'rfnd_1', refundAmountPaise: 150000 }),
      'SAAR-1'
    );
    expect(trace.refund).toEqual({ present: true, status: 'refunded', reference: 'rfnd_1' });
  });

  it('reports no refund when the booking records none', () => {
    const trace = reconcilePayment(paymentDoc(), booking(), 'SAAR-1');
    expect(trace.refund.present).toBe(false);
  });
});
