import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore } from '@/shared/firestore/testing/fakeFirestore';
import { FailPaymentCommand, FailPaymentCommandHandler } from './FailPaymentCommand';
import { OutboxProcessor } from '@/shared/events/outbox';

/**
 * Authorization contract of the client-reported payment-failure path
 * (post-P2-7 remediation). The browser failure report is untrusted input:
 *   - it must be bound to a Razorpay order (a bare bookingId proves nothing);
 *   - Razorpay ground truth is consulted — an order that captured money is
 *     never cancelled here, and an unverifiable state fails closed;
 *   - a booking owned by a real user can only be failed by that user;
 *   - the HMAC-verified webhook path (source='webhook') is exempt.
 */

const h = vi.hoisted(() => ({
  db: null as unknown as FakeFirestore,
  gateway: { isConfigured: vi.fn(), fetchOrderHasSuccessfulPayment: vi.fn() },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => h.db.collection(name),
    runTransaction: (fn: Parameters<FakeFirestore['runTransaction']>[0]) => h.db.runTransaction(fn),
    getAll: (...refs: Parameters<FakeFirestore['getAll']>) => h.db.getAll(...refs),
  },
  adminAuth: {},
}));

vi.mock('@/domains/payment/RazorpayGateway', () => ({
  razorpayGateway: {
    get isConfigured() { return h.gateway.isConfigured; },
    get fetchOrderHasSuccessfulPayment() { return h.gateway.fetchOrderHasSuccessfulPayment; },
  },
}));

vi.mock('@/app/api/email/emailSender', () => ({
  sendEmailAction: vi.fn().mockResolvedValue({ success: true }),
}));

const NOW = new Date('2026-09-02T12:00:00.000Z');
const SLOT_PATH = 'locked_slots/th_1_2026-09-05_09:00';

function bookingDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    therapistId: 'th_1',
    name: 'Ananya Sharma',
    email: 'ananya@example.com',
    userId: 'uid_ananya',
    status: 'awaiting_payment',
    paymentStatus: 'pending',
    razorpayOrderId: 'order_ABC123',
    date: '2026-09-05',
    time: '09:00',
    sessionMode: 'online',
    createdAt: Timestamp.fromDate(new Date('2026-09-02T10:00:00.000Z')),
    ...overrides,
  };
}

function install(booking: Record<string, unknown> = bookingDoc()) {
  h.db = new FakeFirestore(
    {
      'bookings/bk_1': booking,
      'therapists/th_1': { authId: 'therapist_auth_abc', name: 'Dr Priya Menon' },
      [SLOT_PATH]: { bookingId: 'bk_1', status: 'held', therapistId: 'th_1' },
    },
    NOW
  );
  return h.db;
}

const handler = new FailPaymentCommandHandler();

/** The exact call /api/payment/fail makes. */
function clientReport(sessionUid?: string) {
  return new FailPaymentCommand('bk_1', 'order_ABC123', 'Payment dismissed by user', 'client', sessionUid);
}

const bookingState = () => h.db.docs.get('bookings/bk_1') as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(OutboxProcessor, 'processEvent').mockResolvedValue(undefined as never);
  h.gateway.isConfigured.mockReturnValue(false);
  h.gateway.fetchOrderHasSuccessfulPayment.mockReturnValue(Promise.resolve(false));
  install();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FailPaymentCommand — client-source authorization', () => {
  it('refuses a bare bookingId with no orderId (order binding is required)', async () => {
    install();
    const command = new FailPaymentCommand('bk_1', undefined, 'dismissed', 'client', undefined);

    await expect(handler.execute(command)).rejects.toThrow(/orderId is required/);
    expect(bookingState().status).toBe('awaiting_payment'); // untouched
  });

  it('refuses to fail an order that captured money at the gateway', async () => {
    h.gateway.isConfigured.mockReturnValue(true);
    h.gateway.fetchOrderHasSuccessfulPayment.mockResolvedValue(true);
    install();

    await expect(handler.execute(clientReport('uid_ananya'))).rejects.toThrow(/failure report refused/);
    expect(bookingState().status).toBe('awaiting_payment');
  });

  it('fails closed when the gateway check cannot be completed', async () => {
    h.gateway.isConfigured.mockReturnValue(true);
    h.gateway.fetchOrderHasSuccessfulPayment.mockResolvedValue(null);
    install();

    await expect(handler.execute(clientReport('uid_ananya'))).rejects.toThrow(/could not be verified/);
    expect(bookingState().status).toBe('awaiting_payment');
  });

  it('rejects a caller who does not own the booking (IDOR guard)', async () => {
    await expect(handler.execute(clientReport('uid_attacker'))).rejects.toThrow(/Not authorized/);
    await expect(handler.execute(new FailPaymentCommand('bk_1', 'order_ABC123', 'x', 'client', undefined)))
      .rejects.toThrow(/Not authorized/);
    expect(bookingState().status).toBe('awaiting_payment');
  });

  it('rejects a mismatched orderId for the booking', async () => {
    const command = new FailPaymentCommand('bk_1', 'order_OTHER', 'x', 'client', 'uid_ananya');

    await expect(handler.execute(command)).rejects.toThrow(/does not match/);
    expect(bookingState().status).toBe('awaiting_payment');
  });

  it('lets the owning user fail their own pending checkout', async () => {
    const result = await handler.execute(clientReport('uid_ananya'));

    expect(result.success).toBe(true);
    expect(bookingState().status).toBe('cancelled');
  });

  it('lets a guest checkout be failed via the order binding (no session)', async () => {
    install(bookingDoc({ userId: 'guest' }));
    const result = await handler.execute(new FailPaymentCommand('bk_1', 'order_ABC123', 'dismissed', 'client', undefined));

    expect(result.success).toBe(true);
    expect(bookingState().status).toBe('cancelled');
  });

  it('never cancels a confirmed+paid booking regardless of caller', async () => {
    install(bookingDoc({ status: 'confirmed', paymentStatus: 'paid' }));
    const result = await handler.execute(clientReport('uid_ananya'));

    expect(result.success).toBe(true);
    expect(bookingState().status).toBe('confirmed');
    expect(bookingState().paymentStatus).toBe('paid');
  });
});

describe('FailPaymentCommand — webhook exemption', () => {
  it('processes the HMAC-verified webhook path without session/order-binding guards', async () => {
    const result = await handler.execute(
      new FailPaymentCommand('bk_1', 'order_ABC123', 'Payment failed at gateway', 'webhook', undefined)
    );

    expect(result.success).toBe(true);
    expect(bookingState().status).toBe('cancelled');
  });
});
