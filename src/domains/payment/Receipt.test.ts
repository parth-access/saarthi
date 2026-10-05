import { describe, it, expect } from 'vitest';
import { buildReceipt, deriveReceiptNumber, isReceiptable } from './Receipt';
import { Booking } from '@/domains/booking/entities/Booking';
import { Payment } from './Payment';

/**
 * The receipt is derived, never stored, so these tests are the contract for what
 * a receipt is allowed to claim. The two rules worth breaking a build over:
 * a booking whose money was never captured has no receipt at all, and no field is
 * ever filled in with a plausible-looking default.
 */

function booking(overrides: Partial<Booking> = {}): Booking {
  return new Booking({
    id: 'bk_20260902_ABCD1234',
    therapistId: 'th_priya',
    name: 'Ananya Sharma',
    email: 'ananya@example.com',
    userId: 'uid_ananya',
    phone: '9876543210',
    gender: 'female',
    age: 24,
    date: '2026-09-10',
    time: '09:00',
    sessionType: 'Individual therapy',
    message: '',
    status: 'confirmed',
    sessionMode: 'online',
    paymentStatus: 'paid',
    paymentAmount: 1500,
    paymentCurrency: 'INR',
    razorpayOrderId: 'order_ABC123',
    razorpayPaymentId: 'pay_XYZ789',
    paymentVerifiedAt: new Date('2026-09-01T10:15:00.000Z'),
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
    ...overrides,
  });
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return new Payment({
    id: 'order_ABC123',
    bookingId: 'bk_20260902_ABCD1234',
    therapistId: 'th_priya',
    patientEmail: 'ananya@example.com',
    amount: 1500,
    currency: 'INR',
    razorpayOrderId: 'order_ABC123',
    razorpayPaymentId: 'pay_XYZ789',
    status: 'success',
    createdAt: new Date('2026-09-01T09:05:00.000Z'),
    verifiedAt: new Date('2026-09-01T09:06:00.000Z'),
    ...overrides,
  });
}

describe('isReceiptable', () => {
  it('accepts only the states in which money was actually captured', () => {
    for (const status of ['paid', 'success', 'refunded'] as const) {
      expect(isReceiptable({ paymentStatus: status })).toBe(true);
    }
  });

  it('refuses abandoned, in-flight and failed attempts', () => {
    // A document headed "payment receipt" for a payment that never completed
    // would be a fabrication, so these produce nothing at all.
    for (const status of ['unpaid', 'pending', 'initiated', 'failed'] as const) {
      expect(isReceiptable({ paymentStatus: status })).toBe(false);
    }
    expect(isReceiptable({ paymentStatus: undefined })).toBe(false);
  });
});

describe('buildReceipt', () => {
  it('returns null for a booking with no captured payment', () => {
    expect(buildReceipt(booking({ paymentStatus: 'unpaid' }))).toBeNull();
    expect(buildReceipt(booking({ paymentStatus: 'failed' }))).toBeNull();
    expect(buildReceipt(booking({ paymentStatus: undefined }))).toBeNull();
  });

  it('maps a paid booking onto the printed fields', () => {
    const receipt = buildReceipt(booking(), { therapistName: 'Dr Priya Menon' })!;
    expect(receipt).not.toBeNull();
    expect(receipt.bookingId).toBe('bk_20260902_ABCD1234');
    expect(receipt.clientName).toBe('Ananya Sharma');
    expect(receipt.clientEmail).toBe('ananya@example.com');
    expect(receipt.therapistName).toBe('Dr Priya Menon');
    expect(receipt.sessionType).toBe('Individual therapy');
    expect(receipt.sessionMode).toBe('online');
    expect(receipt.sessionDate).toBe('2026-09-10');
    expect(receipt.sessionTime).toBe('09:00');
    expect(receipt.amount).toBe(1500);
    expect(receipt.currency).toBe('INR');
    expect(receipt.status).toBe('paid');
    expect(receipt.razorpayPaymentId).toBe('pay_XYZ789');
    expect(receipt.razorpayOrderId).toBe('order_ABC123');
    expect(receipt.paidAtIso).toBe('2026-09-01T10:15:00.000Z');
  });

  it('labels the therapist neutrally rather than printing an id', () => {
    // `resolveTherapistNames` yields no entry for a deleted therapist document.
    expect(buildReceipt(booking())!.therapistName).toBe('Saarthi therapist');
    expect(buildReceipt(booking(), { therapistName: '   ' })!.therapistName).toBe('Saarthi therapist');
  });

  it('prefers the booking verification time, then the payment, then creation', () => {
    expect(buildReceipt(booking())!.paidAtIso).toBe('2026-09-01T10:15:00.000Z');

    const noBookingStamp = booking({ paymentVerifiedAt: undefined });
    expect(buildReceipt(noBookingStamp, { payment: payment() })!.paidAtIso).toBe(
      '2026-09-01T09:06:00.000Z'
    );
    expect(
      buildReceipt(noBookingStamp, { payment: payment({ verifiedAt: undefined }) })!.paidAtIso
    ).toBe('2026-09-01T09:05:00.000Z');
    expect(buildReceipt(noBookingStamp)!.paidAtIso).toBe('2026-09-01T09:00:00.000Z');
  });

  it('reads Firestore Timestamp shapes, not just Dates', () => {
    const asTimestamp = { seconds: 1756721700, nanoseconds: 0 }; // 2026-09-01T10:15:00Z
    const receipt = buildReceipt(booking({ paymentVerifiedAt: asTimestamp }))!;
    expect(receipt.paidAtIso).toBe(new Date(1756721700 * 1000).toISOString());
  });

  it('falls back to the gateway record for values the booking is missing', () => {
    const sparse = booking({
      email: undefined,
      paymentAmount: undefined,
      paymentCurrency: undefined,
      razorpayOrderId: undefined,
      razorpayPaymentId: undefined,
    });
    const receipt = buildReceipt(sparse, { payment: payment() })!;
    expect(receipt.clientEmail).toBe('ananya@example.com');
    expect(receipt.amount).toBe(1500);
    expect(receipt.currency).toBe('INR');
    expect(receipt.razorpayOrderId).toBe('order_ABC123');
    expect(receipt.razorpayPaymentId).toBe('pay_XYZ789');
  });

  it('ignores a zero or negative stored amount instead of printing it', () => {
    // A 0 here means "not recorded", never "this session was free".
    expect(buildReceipt(booking({ paymentAmount: 0 }), { payment: payment() })!.amount).toBe(1500);
    expect(buildReceipt(booking({ paymentAmount: -1500 }), { payment: payment() })!.amount).toBe(1500);
  });

  it('leaves absent values absent rather than inventing them', () => {
    const receipt = buildReceipt(
      booking({
        razorpayPaymentId: undefined,
        razorpayOrderId: undefined,
        paymentAmount: undefined,
        name: undefined,
      })
    )!;
    expect(receipt.razorpayPaymentId).toBeNull();
    expect(receipt.razorpayOrderId).toBeNull();
    expect(receipt.refundedAmount).toBeNull();
    expect(receipt.refundedAtIso).toBeNull();
    expect(receipt.refundReference).toBeNull();
    expect(receipt.clientName).toBe('');
    // Nothing plausible is substituted for an amount nobody recorded.
    expect(receipt.amount).toBe(0);
  });

  it('normalises the session mode to the two modes that exist', () => {
    expect(buildReceipt(booking({ sessionMode: 'in_person' }))!.sessionMode).toBe('in_person');
    expect(buildReceipt(booking({ sessionMode: 'video' }))!.sessionMode).toBe('online');
    expect(buildReceipt(booking({ sessionMode: undefined }))!.sessionMode).toBe('online');
  });

  it('converts the paise refund amount to the rupees every other line is in', () => {
    // `booking.refundAmount` is paise; the receipt prints rupees throughout.
    const receipt = buildReceipt(
      booking({
        paymentStatus: 'refunded',
        refundStatus: 'refunded',
        refundAmount: 150000,
        refundId: 'rfnd_QWE456',
        refundedAt: new Date('2026-09-03T06:30:00.000Z'),
      })
    )!;
    expect(receipt.refundedAmount).toBe(1500);
    expect(receipt.refundReference).toBe('rfnd_QWE456');
    expect(receipt.refundedAtIso).toBe('2026-09-03T06:30:00.000Z');
    expect(receipt.status).toBe('refunded');
  });

  it('distinguishes a partial refund from a full one', () => {
    const partial = buildReceipt(
      booking({ refundStatus: 'partial', refundAmount: 75000 })
    )!;
    expect(partial.status).toBe('partially_refunded');
    expect(partial.refundedAmount).toBe(750);

    // A refund that failed is not a refund: the receipt still reads "paid".
    const failed = buildReceipt(booking({ refundStatus: 'failed' }))!;
    expect(failed.status).toBe('paid');
  });

  it('treats a refunded payment status as refunded even without a refund record', () => {
    const receipt = buildReceipt(booking({ paymentStatus: 'refunded' }))!;
    expect(receipt.status).toBe('refunded');
    expect(receipt.refundedAmount).toBeNull();
  });
});

describe('deriveReceiptNumber', () => {
  const paidAt = new Date('2026-09-01T10:15:00.000Z');

  it('is stable for the same booking and order', () => {
    // Stability is the whole point: a re-download must not mint a new number,
    // and generating one needs no write on a GET.
    const first = deriveReceiptNumber('bk_1', 'order_1', paidAt);
    const second = deriveReceiptNumber('bk_1', 'order_1', paidAt);
    expect(first).toBe(second);
    expect(buildReceipt(booking())!.receiptNumber).toBe(buildReceipt(booking())!.receiptNumber);
  });

  it('differs per booking and per order', () => {
    const base = deriveReceiptNumber('bk_1', 'order_1', paidAt);
    expect(deriveReceiptNumber('bk_2', 'order_1', paidAt)).not.toBe(base);
    expect(deriveReceiptNumber('bk_1', 'order_2', paidAt)).not.toBe(base);
    expect(deriveReceiptNumber('bk_1', null, paidAt)).not.toBe(base);
  });

  it('formats as SAAR-<payment year>-<8 characters>', () => {
    expect(deriveReceiptNumber('bk_1', 'order_1', paidAt)).toMatch(/^SAAR-2026-[0-9A-Z]{8}$/);
    expect(deriveReceiptNumber('bk_1', 'order_1', new Date('2025-12-31T23:00:00.000Z'))).toMatch(
      /^SAAR-2025-[0-9A-Z]{8}$/
    );
  });

  it('still produces a number when the payment date is unknown', () => {
    expect(deriveReceiptNumber('bk_1', 'order_1', null)).toMatch(/^SAAR-\d{4}-[0-9A-Z]{8}$/);
  });
});
