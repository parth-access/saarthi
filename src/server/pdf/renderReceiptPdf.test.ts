import { describe, it, expect } from 'vitest';
import { renderReceiptPdf, receiptFileName, formatAmount } from './renderReceiptPdf';
import { sanitizeForPdf } from './pdfDocument';
import { formatSessionTimeRange } from '@/lib/sessionDisplay';
import { SESSION_DURATION_MINUTES } from '@/shared/constants';
import type { Receipt } from '@/domains/payment/Receipt';

/**
 * The renderer's contract: every value on the page comes from the receipt it was
 * handed, nothing is hardcoded to a person, absent values are visibly absent, and
 * the document makes no claim the business has no record of (notably tax).
 */

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');
const GENERATED_AT = new Date('2026-09-02T04:45:00.000Z');

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    receiptNumber: 'SAAR-2026-K7X2M9QD',
    bookingId: 'bk_20260902_ABCD1234',
    paidAtIso: '2026-09-01T10:15:00.000Z',
    clientName: 'Ananya Sharma',
    clientEmail: 'ananya@example.com',
    therapistName: 'Dr Priya Menon',
    sessionType: 'Individual therapy',
    sessionMode: 'online',
    sessionDate: '2026-09-10',
    sessionTime: '09:00',
    amount: 1500,
    currency: 'INR',
    status: 'paid',
    razorpayPaymentId: 'pay_XYZ789',
    razorpayOrderId: 'order_ABC123',
    refundedAmount: null,
    refundedAtIso: null,
    refundReference: null,
    ...overrides,
  };
}

describe('formatAmount', () => {
  it('groups in the Indian convention with two decimals', () => {
    expect(formatAmount(1500, 'INR')).toBe('INR 1,500.00');
    expect(formatAmount(2000, 'INR')).toBe('INR 2,000.00');
    expect(formatAmount(150000, 'INR')).toBe('INR 1,50,000.00');
    expect(formatAmount(1234567, 'INR')).toBe('INR 12,34,567.00');
    expect(formatAmount(999, 'INR')).toBe('INR 999.00');
    expect(formatAmount(1500.5, 'INR')).toBe('INR 1,500.50');
  });

  it('never renders a negative or non-numeric amount as junk', () => {
    expect(formatAmount(0, 'INR')).toBe('INR 0.00');
    expect(formatAmount(NaN, 'INR')).toBe('INR 0.00');
    expect(formatAmount(Infinity, 'INR')).toBe('INR 0.00');
    expect(formatAmount(-1500, 'INR')).toBe('INR 1,500.00');
  });

  it('prints the currency it was given, defaulting to INR', () => {
    expect(formatAmount(10, 'USD')).toBe('USD 10.00');
    expect(formatAmount(10, '')).toBe('INR 10.00');
  });
});

describe('renderReceiptPdf', () => {
  const bytes = renderReceiptPdf(receipt(), { generatedAt: GENERATED_AT });
  const pdf = latin1(bytes);

  it('produces a structurally valid PDF, not markup', () => {
    expect(pdf.startsWith('%PDF-1.7\n')).toBe(true);
    expect(pdf.endsWith('%%EOF\n')).toBe(true);
    expect(pdf).not.toContain('<html');
  });

  it('draws the actual booking and payment references', () => {
    // The gateway references are the whole evidentiary point of a receipt.
    expect(pdf).toContain('(pay_XYZ789) Tj');
    expect(pdf).toContain('(order_ABC123) Tj');
    expect(pdf).toContain('(bk_20260902_ABCD1234) Tj');
    expect(pdf).toContain('(SAAR-2026-K7X2M9QD) Tj');
  });

  it('draws the client, therapist and session from the record', () => {
    expect(pdf).toContain('(Ananya Sharma) Tj');
    expect(pdf).toContain('(ananya@example.com) Tj');
    expect(pdf).toContain('(Dr Priya Menon) Tj');
    expect(pdf).toContain('(Individual therapy) Tj');
    expect(pdf).toContain('(Online \\(Google Meet\\)) Tj');
    expect(pdf).toContain('(Thu, 10 Sep 2026) Tj');
    expect(pdf).toContain(`(${sanitizeForPdf(formatSessionTimeRange('09:00'))} IST) Tj`);
    expect(pdf).toContain(`(${SESSION_DURATION_MINUTES} minutes) Tj`);
    expect(pdf).toContain(`(Therapy session \\(${SESSION_DURATION_MINUTES} minutes\\)) Tj`);
  });

  it('states the amount captured and the total paid', () => {
    expect(pdf).toContain('(INR 1,500.00) Tj');
    expect(pdf).toContain('(Total paid) Tj');
  });

  it('stamps the payment date in IST, not UTC', () => {
    // 10:15 UTC on 1 Sep is 3:45 PM IST the same day.
    expect(pdf).toContain('(1 Sep 2026, 3:45 PM IST) Tj');
    expect(pdf).toContain('(Issued 1 Sep 2026) Tj');
  });

  it('makes no tax or fee claim anywhere', () => {
    // Deliberate: no tax registration, rate, component or fee exists anywhere in
    // the payment schema or pricing rule, so any tax line would be invented. The
    // page this replaced asserted "inclusive of applicable taxes".
    expect(pdf.toLowerCase()).not.toContain('tax');
    expect(pdf.toLowerCase()).not.toContain('gst');
    expect(pdf.toLowerCase()).not.toContain('invoice');
  });

  it('carries no data from any other receipt', () => {
    const other = latin1(
      renderReceiptPdf(
        receipt({
          receiptNumber: 'SAAR-2026-ZZ11ZZ11',
          clientName: 'Rahul Verma',
          clientEmail: 'rahul@example.com',
          bookingId: 'bk_20260902_OTHER999',
          razorpayPaymentId: 'pay_OTHER',
          amount: 2000,
        }),
        { generatedAt: GENERATED_AT }
      )
    );
    expect(other).toContain('(Rahul Verma) Tj');
    expect(other).not.toContain('Ananya Sharma');
    expect(other).not.toContain('pay_XYZ789');
    expect(other).toContain('(INR 2,000.00) Tj');
  });

  it('is byte-identical for the same receipt and stamp', () => {
    // A re-download must not produce a different document.
    const again = renderReceiptPdf(receipt(), { generatedAt: GENERATED_AT });
    expect(Buffer.from(again).equals(Buffer.from(bytes))).toBe(true);
  });

  it('prints a dash for a reference the records do not hold', () => {
    // A link-based or legacy payment may have no gateway payment id. The receipt
    // says so rather than inventing or omitting the row.
    const sparse = latin1(
      renderReceiptPdf(receipt({ razorpayPaymentId: null, razorpayOrderId: null }), {
        generatedAt: GENERATED_AT,
      })
    );
    expect(sparse).toContain('(-) Tj');
    expect(sparse).not.toContain('pay_XYZ789');
    // Non-vacuous: a receipt with every reference present draws no dash row at all.
    expect(pdf).not.toContain('(-) Tj');
  });

  it('falls back to the email when a name cannot be drawn in a base-14 font', () => {
    const devanagari = latin1(
      renderReceiptPdf(receipt({ clientName: 'अनन्या शर्मा' }), { generatedAt: GENERATED_AT })
    );
    // Two draws of the email: the billed-to name line and the line beneath it.
    expect(devanagari.match(/\(ananya@example\.com\) Tj/g)).toHaveLength(2);
    expect(devanagari).not.toContain('?????');
  });

  it('shows the refund block only once there is a refund', () => {
    expect(pdf).not.toContain('(REFUND) Tj');

    const refunded = latin1(
      renderReceiptPdf(
        receipt({
          status: 'refunded',
          refundedAmount: 1500,
          refundedAtIso: '2026-09-03T06:30:00.000Z',
          refundReference: 'rfnd_QWE456',
        }),
        { generatedAt: GENERATED_AT }
      )
    );
    expect(refunded).toContain('(REFUND) Tj');
    expect(refunded).toContain('(Refunded amount) Tj');
    expect(refunded).toContain('(rfnd_QWE456) Tj');
    expect(refunded).toContain('(3 Sep 2026, 12:00 PM IST) Tj');
    expect(refunded).toContain('(Refunded) Tj');
  });

  it('labels a partial refund as partial', () => {
    const partial = latin1(
      renderReceiptPdf(receipt({ status: 'partially_refunded', refundedAmount: 750 }), {
        generatedAt: GENERATED_AT,
      })
    );
    expect(partial).toContain('(Partially refunded) Tj');
    expect(partial).toContain('(INR 750.00) Tj');
  });

  it('survives a receipt whose optional fields are all empty', () => {
    const bare = renderReceiptPdf(
      receipt({
        clientName: '',
        clientEmail: '',
        sessionDate: '',
        sessionTime: '',
        paidAtIso: null,
        amount: 0,
        razorpayPaymentId: null,
        razorpayOrderId: null,
      }),
      { generatedAt: GENERATED_AT }
    );
    expect(latin1(bare).startsWith('%PDF-1.7')).toBe(true);
    expect(bare.byteLength).toBeGreaterThan(1000);
  });
});

describe('receiptFileName', () => {
  it('names the file after the receipt number', () => {
    expect(receiptFileName(receipt())).toBe('Saarthi-receipt-SAAR-2026-K7X2M9QD.pdf');
  });

  it('strips anything a filesystem or Content-Disposition header would choke on', () => {
    expect(receiptFileName(receipt({ receiptNumber: 'SAAR/2026 "X"; rm -rf' }))).toBe(
      'Saarthi-receipt-SAAR2026Xrm-rf.pdf'
    );
  });
});
