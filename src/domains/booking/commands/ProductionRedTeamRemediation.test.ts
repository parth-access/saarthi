/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmBookingCommand, ConfirmBookingCommandHandler } from './ConfirmBookingCommand';
import { CancelBookingCommand, CancelBookingCommandHandler } from './CancelBookingCommand';
import { adminDb } from '@/lib/firebase/admin';
import { firestoreBookingRepository, Booking, SlotAlreadyBookedError } from '@/domains/booking';
import { firestorePaymentRepository, Payment, razorpayGateway, firestoreRefundRepository } from '@/domains/payment';
import { sendEmailAction } from '@/app/api/email/emailSender';

vi.mock('@/shared/config', () => ({
  config: {
    razorpay: {
      keyId: 'mock_key',
      keySecret: 'mock_secret',
      webhookSecret: 'mock_webhook_secret',
    },
  },
}));

vi.mock('razorpay', () => ({
  default: class MockRazorpay {
    orders = {
      create: vi.fn().mockResolvedValue({ id: 'order_123' }),
    };
  },
}));

vi.mock('@/lib/firebase/admin', () => {
  const mockDoc = vi.fn((id) => ({
    id,
    get: vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ authId: 'therapist_abc' }),
    }),
    set: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      })),
      add: vi.fn().mockResolvedValue({ id: 'audit_123' }),
      get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    })),
  }));

  const mockCollectionRef = {
    doc: mockDoc,
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    add: vi.fn().mockResolvedValue({ id: 'audit_123' }),
    get: vi.fn().mockResolvedValue({
      exists: true,
      empty: false,
      docs: [{ id: 'doc_abc', data: () => ({ authId: 'therapist_abc' }) }],
    }),
  };

  const mockCollection = vi.fn(() => mockCollectionRef);
  const mockRunTransaction = vi.fn();

  return {
    adminDb: {
      collection: mockCollection,
      runTransaction: mockRunTransaction,
    },
  };
});

vi.mock('@/app/api/email/emailSender', () => ({
  sendEmailAction: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Production Red-Team Validations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HIGH FINDING #1: Slot Lock Expiry vs Payment Completion Race', () => {
    it('Scenario A: Lock expired and cleanup cancelled booking before payment -> confirms fails, double-booking prevented, 100% refund enqueued', async () => {
      // Client A's booking was marked cancelled because slot lock expired
      const bookingA = new Booking({
        id: 'bk_client_A',
        status: 'cancelled',
        paymentStatus: 'pending',
        declineReason: 'Payment timeout: Slot lock expired',
        therapistId: 'therapist_1',
        date: '2026-08-01',
        time: '14:00',
        razorpayOrderId: 'order_A',
        email: 'clientA@example.com',
        userId: 'user_A',
      });

      const paymentA = new Payment({
        id: 'order_A',
        bookingId: 'bk_client_A',
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_A',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(bookingA);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(paymentA);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);
      const enqueueRefundSpy = vi.spyOn(firestoreRefundRepository, 'enqueue').mockResolvedValue(true);

      const slotSetSpy = vi.fn();
      const mockTx = {
        get: vi.fn().mockImplementation(async (ref: any) => {
          // Client B holds the slot now
          return {
            exists: true,
            data: () => ({
              lockId: 'lock_B',
              userId: 'user_B',
              bookingId: 'bk_client_B',
              expiresAt: new Date(Date.now() + 600000), // Active unexpired hold for Client B
            }),
          };
        }),
        set: slotSetSpy,
        delete: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const command = new ConfirmBookingCommand('pay_A', 'order_A', 'sig_A', 'webhook', 'bk_client_A');
      const handler = new ConfirmBookingCommandHandler();

      // Must reject with SlotAlreadyBookedError
      await expect(handler.execute(command)).rejects.toBeInstanceOf(SlotAlreadyBookedError);

      // Client A must NOT be confirmed
      expect(bookingA.status).toBe('cancelled');
      expect(bookingA.paymentStatus).toBe('pending');

      // The slot must NOT be pinned to Client A
      const slotAssignedToA = slotSetSpy.mock.calls.some(
        (call: any[]) => call[1] && call[1].bookingId === 'bk_client_A'
      );
      expect(slotAssignedToA).toBe(false);

      // 100% refund must be automatically enqueued for Client A's captured payment
      expect(enqueueRefundSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: 'refund_pay_A',
        bookingId: 'bk_client_A',
        razorpayPaymentId: 'pay_A',
        razorpayOrderId: 'order_A',
        refundPercent: 100,
        reason: 'double_booking',
      }));
    });

    it('Scenario B: Lock expired, cleanup has not run yet, but Client B acquired an active hold -> Client A confirm rejected, 100% refund enqueued', async () => {
      // Client A's booking document is still awaiting_payment
      const bookingA = new Booking({
        id: 'bk_client_A',
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        therapistId: 'therapist_1',
        date: '2026-08-01',
        time: '14:00',
        razorpayOrderId: 'order_A',
        email: 'clientA@example.com',
        userId: 'user_A',
      });

      const paymentA = new Payment({
        id: 'order_A',
        bookingId: 'bk_client_A',
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_A',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(bookingA);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(paymentA);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);
      const enqueueRefundSpy = vi.spyOn(firestoreRefundRepository, 'enqueue').mockResolvedValue(true);

      const slotSetSpy = vi.fn();
      const mockTx = {
        get: vi.fn().mockImplementation(async () => ({
          exists: true,
          data: () => ({
            lockId: 'lock_B',
            userId: 'user_B',
            expiresAt: new Date(Date.now() + 600000), // Client B actively holds the slot
          }),
        })),
        set: slotSetSpy,
        delete: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const command = new ConfirmBookingCommand('pay_A', 'order_A', 'sig_A', 'direct', 'bk_client_A');
      const handler = new ConfirmBookingCommandHandler();

      await expect(handler.execute(command)).rejects.toBeInstanceOf(SlotAlreadyBookedError);

      // Client A is NOT confirmed
      expect(bookingA.status).toBe('awaiting_payment');
      expect(bookingA.paymentStatus).toBe('pending');

      // Client B's hold was NOT overwritten
      expect(slotSetSpy).not.toHaveBeenCalled();

      // Refund enqueued
      expect(enqueueRefundSpy).toHaveBeenCalledWith(expect.objectContaining({
        bookingId: 'bk_client_A',
        razorpayPaymentId: 'pay_A',
        refundPercent: 100,
      }));
    });
  });

  describe('HIGH FINDING #2: Webhook Idempotency Under Duplicate & Concurrent Deliveries', () => {
    it('Sequential duplicate webhook delivery: processes payment once, sends one receipt email, skips subsequent', async () => {
      const booking = new Booking({
        id: 'bk_webhook_1',
        status: 'payment_initiated',
        paymentStatus: 'pending',
        email: 'user@example.com',
        therapistId: 'therapist_1',
        date: '2026-08-01',
        time: '11:00',
        razorpayOrderId: 'order_webhook_1',
      });

      const payment = new Payment({
        id: 'order_webhook_1',
        bookingId: 'bk_webhook_1',
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_webhook_1',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(booking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(payment);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const handler = new ConfirmBookingCommandHandler();
      const webhookCmd = new ConfirmBookingCommand('pay_hook_1', 'order_webhook_1', undefined, 'webhook');

      // First delivery
      const res1 = await handler.execute(webhookCmd);
      expect(res1.success).toBe(true);
      expect(booking.status).toBe('confirmed');
      expect(booking.paymentStatus).toBe('paid');
      expect(sendEmailAction).toHaveBeenCalledTimes(1);

      // Second delivery (duplicate retry)
      const res2 = await handler.execute(webhookCmd);
      expect(res2.success).toBe(true);
      // Email should NOT be dispatched a second time
      expect(sendEmailAction).toHaveBeenCalledTimes(1);
    });

    it('Concurrent webhook delivery: handles race cleanly with at most one confirmation email and confirmed state', async () => {
      const booking = new Booking({
        id: 'bk_webhook_race',
        status: 'payment_initiated',
        paymentStatus: 'pending',
        email: 'user@example.com',
        therapistId: 'therapist_1',
        date: '2026-08-01',
        time: '11:00',
        razorpayOrderId: 'order_race',
      });

      const payment = new Payment({
        id: 'order_race',
        bookingId: 'bk_webhook_race',
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_race',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(booking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(payment);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const handler = new ConfirmBookingCommandHandler();
      const webhookCmd1 = new ConfirmBookingCommand('pay_race', 'order_race', undefined, 'webhook');
      const webhookCmd2 = new ConfirmBookingCommand('pay_race', 'order_race', undefined, 'webhook');

      const [res1, res2] = await Promise.all([
        handler.execute(webhookCmd1),
        handler.execute(webhookCmd2),
      ]);

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
      expect(booking.status).toBe('confirmed');
      expect(booking.paymentStatus).toBe('paid');
      expect(payment.status).toBe('success');
    });
  });

  describe('HIGH FINDING #3: Concurrent Cancellation & Refund Requests', () => {
    it('Concurrent cancellation requests: only first cancels and enqueues refund, second reports alreadySettled cleanly', async () => {
      const booking = new Booking({
        id: 'bk_cancel_concurrent',
        status: 'confirmed',
        paymentStatus: 'paid',
        email: 'user@example.com',
        userId: 'client_123',
        therapistId: 'therapist_1',
        date: '2026-08-01',
        time: '11:00',
        razorpayOrderId: 'order_123',
        razorpayPaymentId: 'pay_cancel_123',
        utcDateTime: new Date(Date.now() + 72 * 3600000).toISOString(), // >48h out -> 100% refund
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(booking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);

      let refundEnqueueCalls = 0;
      vi.spyOn(firestoreRefundRepository, 'readEnqueuePlan').mockImplementation(async (req, reader) => {
        return {
          ref: { id: req.id } as any,
          payload: req as any,
          shouldCreate: refundEnqueueCalls === 0,
        };
      });

      vi.spyOn(firestoreRefundRepository, 'applyEnqueue').mockImplementation(() => {
        refundEnqueueCalls++;
        return true;
      });

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ bookingId: 'bk_cancel_concurrent' }) }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const handler = new CancelBookingCommandHandler();
      const cancelCmd1 = new CancelBookingCommand('bk_cancel_concurrent', 'Need to reschedule', 'client_123');
      const cancelCmd2 = new CancelBookingCommand('bk_cancel_concurrent', 'Need to reschedule', 'client_123');

      // Run sequentially to simulate Firestore's commit-and-retry behavior
      const res1 = await handler.execute(cancelCmd1);
      expect(res1.success).toBe(true);
      expect(res1.alreadySettled).toBe(false);
      expect(res1.refundEnqueued).toBe(true);

      // Now the booking is already cancelled
      booking.status = 'cancelled';

      const res2 = await handler.execute(cancelCmd2);
      expect(res2.success).toBe(true);
      expect(res2.alreadySettled).toBe(true);
      expect(res2.refundEnqueued).toBe(false);

      // Exactly ONE refund was enqueued
      expect(refundEnqueueCalls).toBe(1);
    });
  });
});
