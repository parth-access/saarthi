import { describe, expect, it } from 'vitest';
import {
  describeCapture,
  describeDiscrepancy,
  describePresence,
  describeReceipt,
  describeRefund,
} from './paymentsPresentation';
import { reconcilePayment, type PaymentDiscrepancy } from '@/domains/admin/paymentTrace';

/**
 * The words an operator reads off the trace. The reconciliation is tested next to
 * the module that computes it; this is about the sentences it turns into — money
 * in rupees, statuses in words, and nothing that implies more certainty than the
 * reconciliation carried.
 */

describe('describePresence', () => {
  it('makes only an orphaned gateway order a danger on its own', () => {
    expect(describePresence('payment_only').tone).toBe('danger');
    expect(describePresence('booking_only').tone).not.toBe('danger');
    expect(describePresence('both').tone).not.toBe('danger');
  });

  it('does not call a missing gateway document wrong for a paid booking', () => {
    const headline = describePresence('booking_only');
    expect(headline.detail).toContain('expected');
  });

  it('gives every presence a label and a reason', () => {
    for (const presence of ['both', 'payment_only', 'booking_only', 'neither'] as const) {
      const headline = describePresence(presence);
      expect(headline.label.length).toBeGreaterThan(0);
      expect(headline.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('describeCapture', () => {
  it('names the booking as the source when the verdict is read from it', () => {
    const line = describeCapture({ captured: true, tone: 'success', source: 'booking' });
    expect(line.label).toBe('Payment captured');
    expect(line.detail).toContain('booking');
    expect(line.tone).toBe('success');
  });

  it('says plainly when there is no record to read a verdict from', () => {
    const line = describeCapture({ captured: false, tone: 'neutral', source: 'none' });
    expect(line.label).toBe('No record of capture');
    expect(line.tone).toBe('neutral');
  });
});

describe('describeDiscrepancy', () => {
  it('states an amount mismatch in rupees from both sides', () => {
    const line = describeDiscrepancy({
      kind: 'amount_mismatch',
      tone: 'danger',
      paymentRupees: 1500,
      bookingRupees: 1200,
    });
    expect(line.text).toContain('₹1,500');
    expect(line.text).toContain('₹1,200');
    expect(line.tone).toBe('danger');
  });

  it('renders a status disagreement as words, and says one reads as captured', () => {
    const line = describeDiscrepancy({
      kind: 'status_mismatch',
      tone: 'danger',
      paymentStatus: 'failed',
      bookingStatus: 'paid',
    });
    expect(line.text).toContain('Failed');
    expect(line.text).toContain('Paid');
    expect(line.text).toContain('captured');
  });

  it('carries both ids in an id mismatch so it can be reconciled', () => {
    const line = describeDiscrepancy({
      kind: 'payment_id_mismatch',
      tone: 'danger',
      onPayment: 'pay_X',
      onBooking: 'pay_Y',
    });
    expect(line.text).toContain('pay_X');
    expect(line.text).toContain('pay_Y');
  });

  it('keeps the expected-gap note at info, not danger', () => {
    const line = describeDiscrepancy({ kind: 'paid_without_payment_doc', tone: 'info' });
    expect(line.tone).toBe('info');
    expect(line.text).toContain('expected');
  });

  it('agrees with a real reconciliation of two disagreeing records', () => {
    const trace = reconcilePayment(
      {
        orderId: 'order_A',
        bookingId: 'bk_1',
        status: 'failed',
        amountRupees: 1500,
        currency: 'INR',
        razorpayOrderId: 'order_A',
        razorpayPaymentId: 'pay_A',
        source: 'checkout',
        createdAtIso: null,
        verifiedAtIso: null,
        refundedAtIso: null,
      },
      {
        id: 'bk_1',
        clientName: 'A. Client',
        clientEmail: 'a@example.com',
        sessionDate: '2026-09-10',
        sessionTime: '09:00',
        sessionType: 'Individual therapy',
        bookingStatus: 'confirmed',
        paymentStatus: 'paid',
        amountRupees: 1500,
        currency: 'INR',
        razorpayOrderId: 'order_A',
        razorpayPaymentId: 'pay_A',
        paidAtIso: null,
        refundStatus: null,
        refundId: null,
        refundAmountPaise: null,
        refundedAtIso: null,
      },
      'SAAR-1'
    );

    const mismatch = trace.discrepancies.find(
      (d): d is Extract<PaymentDiscrepancy, { kind: 'status_mismatch' }> => d.kind === 'status_mismatch'
    );
    expect(mismatch).toBeDefined();
    expect(describeDiscrepancy(mismatch!).text).toContain('captured');
  });
});

describe('describeReceipt', () => {
  it('shows the number when a receipt is available', () => {
    expect(describeReceipt({ available: true, number: 'SAAR-2026-ABCD' })).toEqual({
      available: true,
      text: 'Receipt SAAR-2026-ABCD',
    });
  });

  it('says no receipt, and why, when there is none', () => {
    const line = describeReceipt({ available: false, number: null });
    expect(line.available).toBe(false);
    expect(line.text).toContain('captured booking');
  });
});

describe('describeRefund', () => {
  it('points to the Refunds section and carries the reference', () => {
    const line = describeRefund({ present: true, status: 'refunded', reference: 'rfnd_1' });
    expect(line).toContain('Refunded');
    expect(line).toContain('rfnd_1');
    expect(line).toContain('Refunds');
  });

  it('is nothing when no refund is recorded', () => {
    expect(describeRefund({ present: false, status: null, reference: null })).toBeNull();
  });
});
