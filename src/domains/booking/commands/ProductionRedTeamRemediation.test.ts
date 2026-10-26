/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { ConfirmBookingCommand, ConfirmBookingCommandHandler } from './ConfirmBookingCommand';
import { CancelBookingCommand, CancelBookingCommandHandler } from './CancelBookingCommand';
import { adminDb } from '@/lib/firebase/admin';
import { firestoreBookingRepository, Booking, SlotAlreadyBookedError } from '@/domains/booking';
import { firestorePaymentRepository, Payment, razorpayGateway, firestoreRefundRepository, refundService } from '@/domains/payment';
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

// Razorpay's view of each test payment: captured, on the order the test pays.
// Confirmation fails closed when the gateway cannot vouch for a payment.
const PAYMENT_ORDERS: Record<string, string> = {
  pay_123: 'order_123',
  pay_razorpay_123: 'order_123',
  pay_A: 'order_A',
  pay_hook_1: 'order_webhook_1',
  pay_loser: 'order_loser',
  pay_race: 'order_race',
  pay_own: 'order_own',
  pay_guest: 'order_guest',
  pay_other: 'order_other',
  pay_late: 'order_late',
  pay_late_taken: 'order_late_taken',
  pay_user_cancelled: 'order_user_cancelled',
};

vi.mock('razorpay', () => ({
  default: class MockRazorpay {
    orders = {
      create: vi.fn().mockResolvedValue({ id: 'order_123' }),
    };
    payments = {
      fetch: vi.fn(async (id: string) => ({ id, order_id: PAYMENT_ORDERS[id], status: 'captured' })),
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
  let processRefundSpy: MockInstance<typeof refundService.processRefund>;
  beforeEach(() => {
    vi.clearAllMocks();
    processRefundSpy = vi.spyOn(refundService, 'processRefund').mockResolvedValue({ success: true, outcome: 'PROCESSED' });
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
        get: vi.fn().mockImplementation(async () => {
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

  describe('Confirming onto the customer\'s OWN active hold (production incident 2026-10-26)', () => {
    // Booking creation tags the hold with the booking id and `userId || email`.
    // A signed-in customer's hold therefore carries their uid, never their email.
    function confirmAgainstHold(
      ids: { pay: string; order: string; booking: string },
      bookingFields: Record<string, unknown>,
      hold: Record<string, unknown>
    ) {
      const booking = new Booking({
        id: ids.booking,
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        therapistId: 'therapist_1',
        date: '2026-10-27',
        time: '13:00',
        razorpayOrderId: ids.order,
        ...bookingFields,
      });
      const payment = new Payment({
        id: ids.order,
        bookingId: ids.booking,
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: ids.order,
      });
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(booking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(payment);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);
      const enqueueRefundSpy = vi.spyOn(firestoreRefundRepository, 'enqueue').mockResolvedValue(true);
      const slotSetSpy = vi.fn();
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ expiresAt: new Date(Date.now() + 9 * 60_000), ...hold }),
        }),
        set: slotSetSpy,
        delete: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));
      const run = () =>
        new ConfirmBookingCommandHandler().execute(
          new ConfirmBookingCommand(ids.pay, ids.order, 'sig', 'webhook', ids.booking)
        );
      return { booking, run, enqueueRefundSpy, slotSetSpy };
    }

    it('confirms a signed-in customer whose hold is tagged with their own booking', async () => {
      const { booking, run, enqueueRefundSpy, slotSetSpy } = confirmAgainstHold(
        { pay: 'pay_own', order: 'order_own', booking: 'bk_own' },
        { userId: 'uid_signed_in', email: 'client@example.com' },
        { bookingId: 'bk_own', userId: 'uid_signed_in', lockId: 'lock_own' }
      );

      await expect(run()).resolves.toMatchObject({ success: true });
      expect(booking.status).toBe('confirmed');
      expect(booking.paymentStatus).toBe('paid');
      expect(enqueueRefundSpy).not.toHaveBeenCalled();
      expect(slotSetSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bookingId: 'bk_own', status: 'booked', isPermanent: true })
      );
    });

    it('confirms a guest whose untagged hold carries their email', async () => {
      const { booking, run } = confirmAgainstHold(
        { pay: 'pay_guest', order: 'order_guest', booking: 'bk_guest' },
        { email: 'guest@example.com' },
        { userId: 'guest@example.com', lockId: 'lock_guest' }
      );

      await expect(run()).resolves.toMatchObject({ success: true });
      expect(booking.status).toBe('confirmed');
    });

    it('still refuses a hold tagged with a different booking, even for the same customer', async () => {
      const { booking, run, enqueueRefundSpy } = confirmAgainstHold(
        { pay: 'pay_other', order: 'order_other', booking: 'bk_mine' },
        { userId: 'uid_signed_in', email: 'client@example.com' },
        { bookingId: 'bk_someone_else', userId: 'uid_signed_in', lockId: 'lock_x' }
      );

      await expect(run()).rejects.toBeInstanceOf(SlotAlreadyBookedError);
      expect(booking.status).toBe('awaiting_payment');
      expect(enqueueRefundSpy).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'bk_mine', refundPercent: 100 }));
      // Issued immediately, not left for the cron.
      expect(processRefundSpy).toHaveBeenCalledWith('refund_pay_other');
    });

    it('still refuses the payment when the immediate refund fails (the cron retries it)', async () => {
      processRefundSpy.mockRejectedValueOnce(new Error('Razorpay unreachable'));
      const { run, enqueueRefundSpy } = confirmAgainstHold(
        { pay: 'pay_other', order: 'order_other', booking: 'bk_mine' },
        { userId: 'uid_signed_in', email: 'client@example.com' },
        { bookingId: 'bk_someone_else', userId: 'uid_signed_in', lockId: 'lock_x' }
      );

      await expect(run()).rejects.toBeInstanceOf(SlotAlreadyBookedError);
      expect(enqueueRefundSpy).toHaveBeenCalled();
    });

    // Checkout closed while a UPI request was pending, the failure report
    // cancelled the booking, then the customer approved on their phone.
    const lapsedHold = { expiresAt: new Date(Date.now() - 60_000) };

    it('confirms a payment that lands after a failed-payment cancellation when the slot is still free', async () => {
      const { booking, run, enqueueRefundSpy } = confirmAgainstHold(
        { pay: 'pay_late', order: 'order_late', booking: 'bk_late' },
        { userId: 'uid_signed_in', email: 'client@example.com', status: 'cancelled', paymentStatus: 'failed' },
        lapsedHold
      );

      await expect(run()).resolves.toMatchObject({ success: true });
      expect(booking.status).toBe('confirmed');
      expect(booking.paymentStatus).toBe('paid');
      expect(enqueueRefundSpy).not.toHaveBeenCalled();
    });

    it('still refunds that late payment when someone else has since taken the slot', async () => {
      const { run, enqueueRefundSpy } = confirmAgainstHold(
        { pay: 'pay_late_taken', order: 'order_late_taken', booking: 'bk_late_taken' },
        { userId: 'uid_signed_in', email: 'client@example.com', status: 'cancelled', paymentStatus: 'failed' },
        { bookingId: 'bk_someone_else', status: 'booked', isPermanent: true }
      );

      await expect(run()).rejects.toBeInstanceOf(SlotAlreadyBookedError);
      expect(enqueueRefundSpy).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'bk_late_taken', refundPercent: 100 }));
    });

    it('does not revive a booking cancelled for any other reason', async () => {
      const { booking, run } = confirmAgainstHold(
        { pay: 'pay_user_cancelled', order: 'order_user_cancelled', booking: 'bk_user_cancelled' },
        { userId: 'uid_signed_in', email: 'client@example.com', status: 'cancelled', paymentStatus: 'pending' },
        lapsedHold
      );

      await expect(run()).rejects.toBeInstanceOf(SlotAlreadyBookedError);
      expect(booking.status).toBe('cancelled');
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
      vi.spyOn(firestoreRefundRepository, 'readEnqueuePlan').mockImplementation(async (req) => {
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
