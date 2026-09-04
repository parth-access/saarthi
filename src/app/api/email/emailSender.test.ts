import { describe, it, expect, vi } from 'vitest';
import { buildReceiptAttachment } from './emailSender';

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), update: vi.fn() }))
    }))
  },
  FieldValue: { serverTimestamp: vi.fn() }
}));

vi.mock('@/domains/booking/repository/FirestoreBookingRepository', () => ({
  firestoreBookingRepository: { findById: vi.fn(), save: vi.fn() }
}));

vi.mock('@/shared/events/EventBus', () => ({
  EventBus: { publish: vi.fn() }
}));

vi.mock('@/app/api/_lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), success: vi.fn() }
}));

function paidBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bk_pdf_test',
    name: 'PDF User',
    email: 'pdf@example.com',
    therapistId: 'th_1',
    date: '2026-09-04',
    time: '09:45 AM',
    sessionMode: 'online',
    sessionType: 'Individual Therapy Session',
    paymentStatus: 'paid',
    paymentAmount: 1500,
    paymentCurrency: 'INR',
    razorpayOrderId: 'order_pdf_123',
    razorpayPaymentId: 'pay_pdf_123',
    paymentVerifiedAt: new Date('2026-09-01T10:00:00Z'),
    ...overrides
  };
}

describe('buildReceiptAttachment', () => {
  it('builds a real PDF attachment for a paid booking', () => {
    const attachment = buildReceiptAttachment(paidBooking(), 'Dravina Gupta');

    expect(attachment).not.toBeNull();
    expect(attachment!.contentType).toBe('application/pdf');
    expect(attachment!.filename).toMatch(/^Saarthi-receipt-SAAR-2026-[A-Z0-9]+\.pdf$/);
    // Real PDF magic bytes.
    const head = attachment!.content.subarray(0, 5).toString('latin1');
    expect(head).toBe('%PDF-');
    // Reasonable size for an uncompressed receipt.
    expect(attachment!.content.byteLength).toBeGreaterThan(1000);
  });

  it('returns null for a booking with no captured payment', () => {
    expect(buildReceiptAttachment(paidBooking({ paymentStatus: 'unpaid' }), 'Dravina Gupta')).toBeNull();
    expect(buildReceiptAttachment(paidBooking({ paymentStatus: 'failed' }), 'Dravina Gupta')).toBeNull();
  });

  it('returns null for fallback booking details without payment fields', () => {
    // Mirrors the EmailPayload.bookingDetails fallback path — no payment fields,
    // so no receipt can be built and no fabricated PDF is ever attached.
    const fallbackDetails = {
      name: 'Fallback User',
      email: 'fallback@example.com',
      date: '2026-09-04',
      time: '09:45 AM',
      sessionMode: 'online',
      sessionType: 'Individual Therapy Session'
    };
    expect(buildReceiptAttachment(fallbackDetails, 'Dravina Gupta')).toBeNull();
  });
});