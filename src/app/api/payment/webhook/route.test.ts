import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

/**
 * refund.processed webhook reconciliation, including the untracked-payment
 * branch: a refund issued directly in the Razorpay dashboard (no local refund
 * doc) must still create the deterministic refund record and mark the booking
 * refunded, instead of letting Firestore drift from Razorpay.
 */

const h = vi.hoisted(() => ({
  refundFindByPaymentId: vi.fn(),
  refundSave: vi.fn().mockResolvedValue(undefined),
  refundIdForPayment: vi.fn((paymentId: string) => `refund_${paymentId}`),
  bookingGet: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: h.bookingGet,
      doc: vi.fn(() => ({
        update: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

vi.mock('@/domains/payment', () => ({
  firestoreRefundRepository: {
    findByPaymentId: (...a: unknown[]) => h.refundFindByPaymentId(...a),
    save: (...a: unknown[]) => h.refundSave(...a),
    refundIdForPayment: (paymentId: string) => h.refundIdForPayment(paymentId),
  },
}));

vi.mock('@/domains/booking', () => ({
  firestoreBookingRepository: { findByOrderId: vi.fn() },
  ConfirmBookingCommand: class {},
  ConfirmBookingCommandHandler: class { execute() { return Promise.resolve({ success: true }); } },
  FailPaymentCommand: class {},
  FailPaymentCommandHandler: class { execute() { return Promise.resolve({ success: true }); } },
  SlotAlreadyBookedError: class extends Error {},
}));

vi.mock('@/domains/booking/repository/FirestoreBookingRepository', () => ({
  firestoreBookingRepository: {},
}));


const SECRET = 'test_webhook_secret';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  h.refundFindByPaymentId.mockResolvedValue(null);
  h.bookingGet.mockResolvedValue({
    empty: false,
    docs: [{ id: 'bk_1' }],
  });
});

async function post(body: string, headers: Record<string, string>) {
  const { POST } = await import('./route');
  return POST(new Request('http://localhost/api/payment/webhook', { method: 'POST', headers, body }));
}

function refundWebhook(paymentId: string, amountPaise: number) {
  const body = JSON.stringify({
    event: 'refund.processed',
    payload: {
      refund: { entity: { id: 'rfn_gateway_1', payment_id: paymentId, amount: amountPaise } },
    },
  });
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  const headers = { 'x-razorpay-signature': signature, 'Content-Type': 'application/json' };
  return [body, headers] as const;
}

describe('refund.processed webhook — untracked manual refunds', () => {
  it('creates the deterministic refund record and marks the booking refunded', async () => {
    const res = await post(...refundWebhook('pay_MANUAL1', 150000));

    expect(res.status).toBe(200);
    expect(h.refundSave).toHaveBeenCalledTimes(1);
    const saved = h.refundSave.mock.calls[0][0];
    expect(saved).toMatchObject({
      id: 'refund_pay_MANUAL1',
      bookingId: 'bk_1',
      razorpayPaymentId: 'pay_MANUAL1',
      status: 'PROCESSED',
      reason: 'manual',
      refundId: 'rfn_gateway_1',
      amountRefundedPaise: 150000,
    });
  });

  it('never reconciles a refund it cannot link to a booking (no fabricated bookingId)', async () => {
    h.bookingGet.mockResolvedValue({ empty: true, docs: [] });

    const res = await post(...refundWebhook('pay_UNKNOWN', 150000));

    expect(res.status).toBe(200);
    expect(h.refundSave).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature without touching Firestore', async () => {
    const body = JSON.stringify({ event: 'refund.processed', payload: {} });
    const res = await post(body, { 'x-razorpay-signature': 'deadbeef' });

    expect(res.status).toBe(400);
    expect(h.refundSave).not.toHaveBeenCalled();
    expect(h.bookingGet).not.toHaveBeenCalled();
  });
});
