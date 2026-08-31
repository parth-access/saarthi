/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateBookingCommand, CreateBookingCommandHandler } from './CreateBookingCommand';
import { GeneratePaymentLinkCommand, GeneratePaymentLinkCommandHandler } from './GeneratePaymentLinkCommand';
import { LockSlotCommand, LockSlotCommandHandler } from './LockSlotCommand';
import { StartPaymentCommand, StartPaymentCommandHandler } from './StartPaymentCommand';
import { ConfirmBookingCommand, ConfirmBookingCommandHandler } from './ConfirmBookingCommand';
import { CancelBookingCommand, CancelBookingCommandHandler } from './CancelBookingCommand';
import { RescheduleBookingCommand, RescheduleBookingCommandHandler } from './RescheduleBookingCommand';
import { AdminConfirmBookingCommand, AdminConfirmBookingCommandHandler } from './AdminConfirmBookingCommand';
import { adminDb } from '@/lib/firebase/admin';
import { firestoreBookingRepository, Booking, SlotAlreadyBookedError } from '@/domains/booking';
import { firestorePaymentRepository, Payment, razorpayGateway } from '@/domains/payment';
import { sendEmailAction } from '@/app/api/email/emailSender';
import { EventBus } from '@/shared/events/EventBus';
import { registerListeners } from '@/shared/events/listeners';

vi.mock("@/shared/config", () => ({
  config: {
    razorpay: {
      keyId: "mock_key",
      keySecret: "mock_secret",
    }
  }
}));

// Class-based mock for Razorpay to guarantee "new Razorpay" works perfectly

vi.mock('razorpay', () => {
  return {
    default: class MockRazorpay {
      orders = {
        create: vi.fn().mockResolvedValue({ id: 'order_123' })
      };
    }
  };
});

// Mock admin DB
vi.mock('@/lib/firebase/admin', () => {
  const mockDoc = vi.fn((id) => ({
    id,
    get: vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ authId: 'therapist_abc' })
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
    })),
  }));

  const mockCollectionRef = {
    doc: mockDoc,
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({
      exists: true,
      empty: false,
      docs: [{ id: 'doc_abc', data: () => ({ authId: 'therapist_abc' }) }]
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

// Mock Email action
vi.mock('@/app/api/email/emailSender', () => ({
  sendEmailAction: vi.fn().mockResolvedValue({ success: true })
}));

describe('Command Handlers Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(razorpayGateway, "createOrder").mockResolvedValue({ orderId: "order_123", amount: 1500, currency: "INR" });
    EventBus.clear();
    registerListeners(EventBus);
  });

  describe('CreateBookingCommand & Booking/Payment Ordering', () => {
    it('1. Successful slot reservation -> Razorpay order creation succeeds', async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new CreateBookingCommand(
        {
          therapistId: 'therapist_1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '9999999999',
          age: 25,
          date: '2026-07-20',
          time: '11:00',
          message: 'Stress management',
          sessionMode: 'online',
          lockId: 'lock_abc123'
        },
        'user_123',
        'jane@example.com'
      );

      const handler = new CreateBookingCommandHandler();
      const result = await handler.execute(command);

      expect(result.bookingId).toBeDefined();
      expect(adminDb.runTransaction).toHaveBeenCalled();
      expect(razorpayGateway.createOrder).toHaveBeenCalledTimes(1);
    });

    it('2. Slot reservation fails -> Razorpay order creation is never called', async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ bookingId: 'existing_booking_id' })
        }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new CreateBookingCommand(
        {
          therapistId: 'therapist_1',
          name: 'John Doe',
          email: 'john@example.com',
          phone: '9999999999',
          date: '2026-07-20',
          time: '11:00',
          sessionMode: 'online'
        },
        'user_456',
        'john@example.com'
      );

      const handler = new CreateBookingCommandHandler();
      await expect(handler.execute(command)).rejects.toThrow('This slot is already booked.');
      expect(razorpayGateway.createOrder).not.toHaveBeenCalled();
    });

    it('3. Slot reservation succeeds -> Razorpay order creation fails -> compensating cleanup runs', async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => {
        return callback(mockTx as any);
      });

      vi.spyOn(razorpayGateway, 'createOrder').mockRejectedValueOnce(new Error('Razorpay network error'));

      const command = new CreateBookingCommand(
        {
          therapistId: 'therapist_1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '9999999999',
          date: '2026-07-20',
          time: '11:00',
          sessionMode: 'online'
        },
        'user_123',
        'jane@example.com'
      );

      const handler = new CreateBookingCommandHandler();
      await expect(handler.execute(command)).rejects.toThrow('Failed to initialize payment gateway.');
      expect(adminDb.runTransaction).toHaveBeenCalledTimes(2); // Initial transaction + compensating cleanup transaction
    });

    it('4. Concurrent booking attempts: at most ONE booking claims slot and creates Razorpay order', async () => {
      let slotClaimed = false;
      const mockTx1 = {
        get: vi.fn().mockImplementation(async () => {
          if (!slotClaimed) {
            slotClaimed = true;
            return { exists: false };
          }
          return { exists: true, data: () => ({ bookingId: 'winner_booking_id' }) };
        }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };

      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => {
        return callback(mockTx1 as any);
      });

      const commandA = new CreateBookingCommand(
        {
          therapistId: 'therapist_1',
          name: 'User A',
          email: 'usera@example.com',
          phone: '9999999999',
          date: '2026-07-20',
          time: '11:00',
          sessionMode: 'online'
        },
        'user_A',
        'usera@example.com'
      );

      const commandB = new CreateBookingCommand(
        {
          therapistId: 'therapist_1',
          name: 'User B',
          email: 'userb@example.com',
          phone: '8888888888',
          date: '2026-07-20',
          time: '11:00',
          sessionMode: 'online'
        },
        'user_B',
        'userb@example.com'
      );

      const handler = new CreateBookingCommandHandler();
      const results = await Promise.allSettled([
        handler.execute(commandA),
        handler.execute(commandB)
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('This slot is already booked.');
      expect(razorpayGateway.createOrder).toHaveBeenCalledTimes(1);
    });

    it('5. GeneratePaymentLinkCommand: fails and skips Razorpay when slot is claimed by another user', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'pending_approval',
        email: 'patient@example.com'
      });
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ bookingId: 'other_booking_id' })
        }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler = new GeneratePaymentLinkCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow('This slot is already booked by another user.');
      expect(razorpayGateway.createOrder).not.toHaveBeenCalled();
    });

    it('6. GeneratePaymentLinkCommand: reuses existing razorpayOrderId and skips Razorpay order creation', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        paymentAmount: 1500,
        razorpayOrderId: 'order_existing_123',
        email: 'patient@example.com'
      });
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler = new GeneratePaymentLinkCommandHandler();
      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('order_existing_123');
      expect(razorpayGateway.createOrder).not.toHaveBeenCalled();
    });

    it('7. GeneratePaymentLinkCommand: fails when booking is confirmed or payment completed', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'confirmed',
        paymentStatus: 'paid',
        email: 'patient@example.com'
      });
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler = new GeneratePaymentLinkCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow('Payment is already completed for this booking.');
      expect(razorpayGateway.createOrder).not.toHaveBeenCalled();
    });

    it('8. GeneratePaymentLinkCommand: fails when booking is in invalid state (cancelled)', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'cancelled',
        email: 'patient@example.com'
      });
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler = new GeneratePaymentLinkCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow('Booking is not in a valid state to create a payment order');
      expect(razorpayGateway.createOrder).not.toHaveBeenCalled();
    });

    it('A. Stale lock + existing Firestore Payment -> reuse Firestore Payment', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'awaiting_payment',
        orderCreationInProgress: true,
        orderCreationStartedAt: Date.now() - 120000, // Stale
        email: 'patient@example.com'
      });
      const mockPayment = new Payment({
        id: 'order_fs_payment',
        bookingId: 'bk_1',
        therapistId: 'therapist_1',
        amount: 1500,
        currency: 'INR',
        razorpayOrderId: 'order_fs_payment',
        status: 'pending'
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestorePaymentRepository, 'findByBookingId').mockResolvedValue(mockPayment);
      const findReceiptSpy = vi.spyOn(razorpayGateway, 'findOrderByReceipt');
      const createOrderSpy = vi.spyOn(razorpayGateway, 'createOrder');

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler = new GeneratePaymentLinkCommandHandler();

      const result = await handler.execute(command);
      expect(result.success).toBe(true);
      expect(result.orderId).toBe('order_fs_payment');
      expect(findReceiptSpy).not.toHaveBeenCalled();
      expect(createOrderSpy).not.toHaveBeenCalled();
    });

    it('B. Stale lock + no Firestore Payment + existing Razorpay order by receipt -> recover Razorpay order without createOrder()', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'awaiting_payment',
        orderCreationInProgress: true,
        orderCreationStartedAt: Date.now() - 120000, // Stale
        paymentAmount: 1500,
        email: 'patient@example.com'
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestorePaymentRepository, 'findByBookingId').mockResolvedValue(null);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined as any);
      vi.spyOn(razorpayGateway, 'findOrderByReceipt').mockResolvedValue({
        id: 'order_rzp_rec',
        amount: 150000, // in paise
        currency: 'INR',
        receipt: 'receipt_bk_1',
        notes: { bookingId: 'bk_1' }
      });
      const createOrderSpy = vi.spyOn(razorpayGateway, 'createOrder');

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler = new GeneratePaymentLinkCommandHandler();

      const result = await handler.execute(command);
      expect(result.success).toBe(true);
      expect(result.orderId).toBe('order_rzp_rec');
      expect(createOrderSpy).not.toHaveBeenCalled();
      expect(firestorePaymentRepository.save).toHaveBeenCalled();
    });

    it('C. Stale lock + no Firestore Payment + no Razorpay order -> create exactly one new order', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'awaiting_payment',
        orderCreationInProgress: true,
        orderCreationStartedAt: Date.now() - 120000, // Stale
        email: 'patient@example.com'
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestorePaymentRepository, 'findByBookingId').mockResolvedValue(null);
      vi.spyOn(razorpayGateway, 'findOrderByReceipt').mockResolvedValue(null);
      const createOrderSpy = vi.spyOn(razorpayGateway, 'createOrder').mockResolvedValueOnce({
        orderId: 'order_new_created',
        amount: 1500,
        currency: 'INR'
      });

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler = new GeneratePaymentLinkCommandHandler();

      const result = await handler.execute(command);
      expect(result.success).toBe(true);
      expect(result.orderId).toBe('order_new_created');
      expect(createOrderSpy).toHaveBeenCalledTimes(1);
    });

    it('D. Existing Razorpay order with mismatched receipt -> reject/recover safely, create new order', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'awaiting_payment',
        orderCreationInProgress: true,
        orderCreationStartedAt: Date.now() - 120000,
        email: 'patient@example.com'
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestorePaymentRepository, 'findByBookingId').mockResolvedValue(null);
      vi.spyOn(razorpayGateway, 'findOrderByReceipt').mockResolvedValue({
        id: 'order_mismatched_receipt',
        amount: 150000,
        currency: 'INR',
        receipt: 'receipt_WRONG_BOOKING',
        notes: { bookingId: 'bk_1' }
      });
      const createOrderSpy = vi.spyOn(razorpayGateway, 'createOrder').mockResolvedValueOnce({
        orderId: 'order_safe_fallback',
        amount: 1500,
        currency: 'INR'
      });

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler = new GeneratePaymentLinkCommandHandler();

      const result = await handler.execute(command);
      expect(result.success).toBe(true);
      expect(result.orderId).toBe('order_safe_fallback');
      expect(result.orderId).not.toBe('order_mismatched_receipt');
      expect(createOrderSpy).toHaveBeenCalledTimes(1);
    });

    it('E. Existing Razorpay order with mismatched amount/currency -> reject safely and create new order', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'awaiting_payment',
        orderCreationInProgress: true,
        orderCreationStartedAt: Date.now() - 120000,
        paymentAmount: 1500,
        email: 'patient@example.com'
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestorePaymentRepository, 'findByBookingId').mockResolvedValue(null);
      vi.spyOn(razorpayGateway, 'findOrderByReceipt').mockResolvedValue({
        id: 'order_mismatched_amount',
        amount: 999900, // 9999 INR instead of 1500 INR
        currency: 'INR',
        receipt: 'receipt_bk_1',
        notes: { bookingId: 'bk_1' }
      });
      const createOrderSpy = vi.spyOn(razorpayGateway, 'createOrder').mockResolvedValueOnce({
        orderId: 'order_correct_amount',
        amount: 1500,
        currency: 'INR'
      });

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler = new GeneratePaymentLinkCommandHandler();

      const result = await handler.execute(command);
      expect(result.success).toBe(true);
      expect(result.orderId).toBe('order_correct_amount');
      expect(createOrderSpy).toHaveBeenCalledTimes(1);
    });

    it('F. Two concurrent stale-lock recovery attempts -> only one recovery owner proceeds', async () => {
      const mockBookingStale = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'awaiting_payment',
        orderCreationInProgress: true,
        orderCreationStartedAt: Date.now() - 120000, // Stale initially
        email: 'patient@example.com'
      });

      const mockBookingActive = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'awaiting_payment',
        orderCreationInProgress: true,
        orderCreationStartedAt: Date.now(), // Active lock after winner updates it
        email: 'patient@example.com'
      });

      vi.spyOn(firestoreBookingRepository, 'findById')
        .mockResolvedValueOnce(mockBookingStale) // Handler 1 Phase 1
        .mockResolvedValueOnce(mockBookingStale) // Handler 1 Phase 3
        .mockResolvedValueOnce(mockBookingActive); // Handler 2 Phase 1 (active lock)

      vi.spyOn(firestorePaymentRepository, 'findByBookingId').mockResolvedValue(null);
      vi.spyOn(razorpayGateway, 'findOrderByReceipt').mockResolvedValue(null);
      vi.spyOn(razorpayGateway, 'createOrder').mockResolvedValue({
        orderId: 'order_owner_1',
        amount: 1500,
        currency: 'INR'
      });

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler1 = new GeneratePaymentLinkCommandHandler();
      const handler2 = new GeneratePaymentLinkCommandHandler();

      // Owner 1 executes first and updates lock
      const res1 = await handler1.execute(command);
      expect(res1.orderId).toBe('order_owner_1');

      // Concurrent Owner 2 attempts execution now seeing active lock from Owner 1
      await expect(handler2.execute(command)).rejects.toThrow('Payment order creation is already in progress');
    });

    it('G. Active lock -> no Razorpay call', async () => {
      const mockBookingActive = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'awaiting_payment',
        orderCreationInProgress: true,
        orderCreationStartedAt: Date.now() - 10000, // Active lock (10s old)
        email: 'patient@example.com'
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBookingActive);
      vi.spyOn(firestorePaymentRepository, 'findByBookingId').mockResolvedValue(null);
      const findReceiptSpy = vi.spyOn(razorpayGateway, 'findOrderByReceipt');
      const createOrderSpy = vi.spyOn(razorpayGateway, 'createOrder');

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler = new GeneratePaymentLinkCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow('Payment order creation is already in progress');
      expect(findReceiptSpy).not.toHaveBeenCalled();
      expect(createOrderSpy).not.toHaveBeenCalled();
    });

    it('H. findOrderByReceipt network/API failure -> releases lock and throws retryable error without calling createOrder()', async () => {
      const mockBookingStale = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'awaiting_payment',
        orderCreationInProgress: true,
        orderCreationStartedAt: Date.now() - 120000,
        email: 'patient@example.com',
        paymentAmount: 1500
      });

      const mockDocUpdate = vi.fn().mockResolvedValue(true);
      const mockDocRef = {
        update: mockDocUpdate,
        collection: vi.fn(() => ({ doc: vi.fn(() => ({ set: vi.fn() })) }))
      };
      const collectionSpy = vi.spyOn(adminDb, 'collection').mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef)
      } as any);

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBookingStale);
      vi.spyOn(firestorePaymentRepository, 'findByBookingId').mockResolvedValue(null);
      vi.spyOn(razorpayGateway, 'findOrderByReceipt').mockRejectedValue(new Error('Razorpay Network Timeout'));
      const createOrderSpy = vi.spyOn(razorpayGateway, 'createOrder');

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler = new GeneratePaymentLinkCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow('Failed to initialize payment gateway.');
      expect(createOrderSpy).not.toHaveBeenCalled();
      expect(mockDocUpdate).toHaveBeenCalledWith({
        orderCreationInProgress: false,
        orderCreationStartedAt: expect.anything()
      });

      collectionSpy.mockRestore();
    });
  });

  describe('LockSlotCommand', () => {
    it('should lock a slot successfully', async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new LockSlotCommand('therapist_1', '2026-07-20', '11:00', 'user_123');
      const handler = new LockSlotCommandHandler();
      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(result.lockId).toBeDefined();
    });
  });

  describe('StartPaymentCommand', () => {
    it('should initiate payment transition', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        status: 'awaiting_payment'
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new StartPaymentCommand('bk_1');
      const handler = new StartPaymentCommandHandler();
      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(mockBooking.status).toBe('payment_initiated');
    });
  });

  describe('ConfirmBookingCommand', () => {
    it('A. Normal confirmation (pending -> success) succeeds and sends single email', async () => {
      // Protects against: Normal payment confirmation failing to transition payment or booking to confirmed state.
      const mockBooking = new Booking({
        id: 'bk_1',
        status: 'payment_initiated',
        paymentStatus: 'pending',
        email: 'jane@example.com',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        razorpayOrderId: 'order_123',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      const mockPayment = new Payment({
        id: 'order_123',
        bookingId: 'bk_1',
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_123',
      });
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(mockPayment);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new ConfirmBookingCommand('pay_123', 'order_123', 'sig_123', 'direct');
      const handler = new ConfirmBookingCommandHandler();
      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(mockBooking.status).toBe('confirmed');
      expect(mockBooking.paymentStatus).toBe('paid');
      expect(mockPayment.status).toBe('success');
      expect(mockPayment.razorpayPaymentId).toBe('pay_123');
      expect(sendEmailAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'payment-receipt',
        bookingId: 'bk_1',
      }));
    });

    it('B. Repeated confirmation is idempotent (success -> success does not throw and preserves state)', async () => {
      // Protects against: PaymentStateMachine throwing invalid transition error when confirmation is re-attempted.
      const mockBooking = new Booking({
        id: 'bk_1',
        status: 'confirmed',
        paymentStatus: 'paid',
        email: 'jane@example.com',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        razorpayOrderId: 'order_123',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      const mockPayment = new Payment({
        id: 'order_123',
        bookingId: 'bk_1',
        amount: 1500,
        currency: 'INR',
        status: 'success',
        razorpayOrderId: 'order_123',
        razorpayPaymentId: 'pay_123',
      });
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(mockPayment);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new ConfirmBookingCommand('pay_123', 'order_123', 'sig_123', 'direct');
      const handler = new ConfirmBookingCommandHandler();
      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(mockBooking.status).toBe('confirmed');
      expect(mockBooking.paymentStatus).toBe('paid');
      expect(mockPayment.status).toBe('success');
      expect(sendEmailAction).not.toHaveBeenCalled();
    });

    it('B2. Double-booking prevented: confirming onto a slot already pinned to another booking throws and never overwrites the pin', async () => {
      // Protects against: P0-2 — confirm-time slot pin overwriting a slot already
      // permanently owned by a different confirmed booking (double-booking).
      const mockBooking = new Booking({
        id: 'bk_LOSER',
        status: 'payment_initiated',
        paymentStatus: 'pending',
        email: 'jane@example.com',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        date: '2026-09-01',
        time: '10:00',
        razorpayOrderId: 'order_loser',
      });
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      const mockPayment = new Payment({
        id: 'order_loser',
        bookingId: 'bk_LOSER',
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_loser',
      });
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(mockPayment);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);

      const slotSetSpy = vi.fn();
      const mockTx = {
        // The slot is already permanently pinned to a DIFFERENT confirmed booking.
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            isPermanent: true,
            status: 'booked',
            bookingId: 'bk_WINNER',
            therapistId: 'therapist_1',
            date: '2026-09-01',
            time: '10:00',
          }),
        }),
        set: slotSetSpy,
        delete: vi.fn(),
        update: vi.fn(),
      };
      // NOTE: ConfirmBookingCommand runs TWO transactions — the inner
      // ConfirmPaymentCommand transaction first, then the booking-confirm
      // transaction that holds the double-booking guard. Use a persistent
      // mockImplementation (not ...Once) so BOTH transactions see this mockTx,
      // otherwise the slot read in the booking transaction falls through to a
      // leaked mock and the guard never observes the WINNER pin.
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const command = new ConfirmBookingCommand('pay_loser', 'order_loser', 'sig_loser', 'direct', 'bk_LOSER');
      const handler = new ConfirmBookingCommandHandler();

      await expect(handler.execute(command)).rejects.toBeInstanceOf(SlotAlreadyBookedError);

      // The losing booking must NOT be confirmed/paid.
      expect(mockBooking.status).not.toBe('confirmed');
      expect(mockBooking.paymentStatus).not.toBe('paid');

      // The permanent pin must never be overwritten to the losing booking.
      const pinnedToLoser = slotSetSpy.mock.calls.some(
        (call: any[]) => call[1] && call[1].bookingId === 'bk_LOSER'
      );
      expect(pinnedToLoser).toBe(false);
    });

    it('C. verify -> webhook race sequence converges safely to confirmed and paid', async () => {
      // Protects against: Razorpay webhook arriving shortly after direct client verification failing with a 500 error.
      const mockBooking = new Booking({
        id: 'bk_1',
        status: 'payment_initiated',
        paymentStatus: 'pending',
        email: 'jane@example.com',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        razorpayOrderId: 'order_123',
      });
      const mockPayment = new Payment({
        id: 'order_123',
        bookingId: 'bk_1',
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_123',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(mockPayment);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const handler = new ConfirmBookingCommandHandler();

      // 1. Direct client verify arrives first
      const verifyCmd = new ConfirmBookingCommand('pay_123', 'order_123', 'sig_123', 'direct');
      const verifyRes = await handler.execute(verifyCmd);
      expect(verifyRes.success).toBe(true);
      expect(mockBooking.status).toBe('confirmed');
      expect(mockBooking.paymentStatus).toBe('paid');
      expect(mockPayment.status).toBe('success');
      expect(sendEmailAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'payment-receipt',
        bookingId: 'bk_1',
      }));

      const emailCallCountAfterFirst = vi.mocked(sendEmailAction).mock.calls.length;

      // 2. Webhook arrives second
      const webhookCmd = new ConfirmBookingCommand('pay_123', 'order_123', undefined, 'webhook');
      const webhookRes = await handler.execute(webhookCmd);
      expect(webhookRes.success).toBe(true);
      expect(mockBooking.status).toBe('confirmed');
      expect(mockBooking.paymentStatus).toBe('paid');
      expect(mockPayment.status).toBe('success');
      // No duplicate email dispatched on second confirmation
      expect(vi.mocked(sendEmailAction).mock.calls.length).toBe(emailCallCountAfterFirst);
    });

    it('D. webhook -> verify race sequence converges safely to confirmed and paid', async () => {
      // Protects against: Direct client verification arriving after background webhook failing with an error in the UI.
      const mockBooking = new Booking({
        id: 'bk_1',
        status: 'payment_initiated',
        paymentStatus: 'pending',
        email: 'jane@example.com',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        razorpayOrderId: 'order_123',
      });
      const mockPayment = new Payment({
        id: 'order_123',
        bookingId: 'bk_1',
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_123',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(mockPayment);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const handler = new ConfirmBookingCommandHandler();

      // 1. Webhook arrives first
      const webhookCmd = new ConfirmBookingCommand('pay_123', 'order_123', undefined, 'webhook');
      const webhookRes = await handler.execute(webhookCmd);
      expect(webhookRes.success).toBe(true);
      expect(mockBooking.status).toBe('confirmed');
      expect(mockBooking.paymentStatus).toBe('paid');
      expect(mockPayment.status).toBe('success');
      expect(sendEmailAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'payment-receipt',
        bookingId: 'bk_1',
      }));

      const emailCallCountAfterFirst = vi.mocked(sendEmailAction).mock.calls.length;

      // 2. Direct client verify arrives second with signature
      const verifyCmd = new ConfirmBookingCommand('pay_123', 'order_123', 'sig_123', 'direct');
      const verifyRes = await handler.execute(verifyCmd);
      expect(verifyRes.success).toBe(true);
      expect(mockBooking.status).toBe('confirmed');
      expect(mockBooking.paymentStatus).toBe('paid');
      expect(mockPayment.status).toBe('success');
      expect(mockPayment.razorpaySignature).toBe('sig_123'); // Captures signature
      // No duplicate email dispatched on second confirmation
      expect(vi.mocked(sendEmailAction).mock.calls.length).toBe(emailCallCountAfterFirst);
    });

    it('E. verify -> verify repeated call succeeds idempotently', async () => {
      // Protects against: User double-clicking or client retrying /api/payment/verify.
      const mockBooking = new Booking({
        id: 'bk_1',
        status: 'payment_initiated',
        paymentStatus: 'pending',
        email: 'jane@example.com',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        razorpayOrderId: 'order_123',
      });
      const mockPayment = new Payment({
        id: 'order_123',
        bookingId: 'bk_1',
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_123',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(mockPayment);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const handler = new ConfirmBookingCommandHandler();
      const verifyCmd = new ConfirmBookingCommand('pay_123', 'order_123', 'sig_123', 'direct');

      const res1 = await handler.execute(verifyCmd);
      expect(res1.success).toBe(true);
      expect(sendEmailAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'payment-receipt',
        bookingId: 'bk_1',
      }));

      const emailCallCountAfterFirst = vi.mocked(sendEmailAction).mock.calls.length;

      const res2 = await handler.execute(verifyCmd);
      expect(res2.success).toBe(true);
      expect(vi.mocked(sendEmailAction).mock.calls.length).toBe(emailCallCountAfterFirst);
    });

    it('F. webhook -> webhook repeated delivery succeeds idempotently', async () => {
      // Protects against: Razorpay webhook retries causing errors or duplicate processing.
      const mockBooking = new Booking({
        id: 'bk_1',
        status: 'payment_initiated',
        paymentStatus: 'pending',
        email: 'jane@example.com',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        razorpayOrderId: 'order_123',
      });
      const mockPayment = new Payment({
        id: 'order_123',
        bookingId: 'bk_1',
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_123',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(mockPayment);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const handler = new ConfirmBookingCommandHandler();
      const webhookCmd = new ConfirmBookingCommand('pay_123', 'order_123', undefined, 'webhook');

      const res1 = await handler.execute(webhookCmd);
      expect(res1.success).toBe(true);
      expect(sendEmailAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'payment-receipt',
        bookingId: 'bk_1',
      }));

      const emailCallCountAfterFirst = vi.mocked(sendEmailAction).mock.calls.length;

      const res2 = await handler.execute(webhookCmd);
      expect(res2.success).toBe(true);
      expect(vi.mocked(sendEmailAction).mock.calls.length).toBe(emailCallCountAfterFirst);
    });

    it('G. Concurrent duplicate confirmation handles race without invalid transition errors', async () => {
      // Protects against: Simultaneous execution of verify and webhook resulting in unhandled rejections.
      const mockBooking = new Booking({
        id: 'bk_1',
        status: 'payment_initiated',
        paymentStatus: 'pending',
        email: 'jane@example.com',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        razorpayOrderId: 'order_123',
      });
      const mockPayment = new Payment({
        id: 'order_123',
        bookingId: 'bk_1',
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_123',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(mockPayment);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const handler = new ConfirmBookingCommandHandler();
      const verifyCmd = new ConfirmBookingCommand('pay_123', 'order_123', 'sig_123', 'direct');
      const webhookCmd = new ConfirmBookingCommand('pay_123', 'order_123', undefined, 'webhook');

      const [res1, res2] = await Promise.all([
        handler.execute(verifyCmd),
        handler.execute(webhookCmd),
      ]);

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
      expect(mockBooking.status).toBe('confirmed');
      expect(mockBooking.paymentStatus).toBe('paid');
      expect(mockPayment.status).toBe('success');
    });

    it('H. Duplicate confirmation does not send duplicate confirmation email', async () => {
      // Protects against: Spamming patients with multiple confirmation emails.
      const mockBooking = new Booking({
        id: 'bk_1',
        status: 'confirmed',
        paymentStatus: 'paid',
        email: 'jane@example.com',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        razorpayOrderId: 'order_123',
      });
      const mockPayment = new Payment({
        id: 'order_123',
        bookingId: 'bk_1',
        amount: 1500,
        currency: 'INR',
        status: 'success',
        razorpayOrderId: 'order_123',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(mockPayment);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const handler = new ConfirmBookingCommandHandler();
      const verifyCmd = new ConfirmBookingCommand('pay_123', 'order_123', 'sig_123', 'direct');

      await handler.execute(verifyCmd);
      expect(sendEmailAction).not.toHaveBeenCalled();
    });

    it('I. Different payment/order cannot piggyback on an already-successful payment', async () => {
      // Protects against: Corrupting booking or payment state if mismatched order IDs are submitted.
      const mockBooking = new Booking({
        id: 'bk_1',
        status: 'confirmed',
        paymentStatus: 'paid',
        email: 'jane@example.com',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        razorpayOrderId: 'order_original_123',
      });
      const mockPayment = new Payment({
        id: 'order_different_456',
        bookingId: 'bk_1',
        amount: 1500,
        currency: 'INR',
        status: 'success',
        razorpayOrderId: 'order_different_456',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(mockPayment);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => callback(mockTx as any));

      const handler = new ConfirmBookingCommandHandler();
      const mismatchedCmd = new ConfirmBookingCommand('pay_123', 'order_different_456', 'sig_123', 'direct');

      await expect(handler.execute(mismatchedCmd)).rejects.toThrow('razorpayOrderId mismatch');
    });

    it('J. Existing invalid transitions still fail (e.g. invalid signature fails)', async () => {
      // Protects against: Accepting forged or corrupted payment signatures.
      const mockPayment = new Payment({
        id: 'order_123',
        bookingId: 'bk_1',
        amount: 1500,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_123',
      });

      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(mockPayment);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(false); // Invalid HMAC

      const handler = new ConfirmBookingCommandHandler();
      const invalidSigCmd = new ConfirmBookingCommand('pay_123', 'order_123', 'invalid_sig', 'direct');

      await expect(handler.execute(invalidSigCmd)).rejects.toThrow('Invalid signature verification failed');
    });
  });

  describe('CancelBookingCommand', () => {
    it('should decline a pending booking', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        status: 'pending',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        date: '2026-07-20',
        time: '11:00',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = {
        get: vi.fn().mockImplementation(async () => ({
          exists: true,
          data: () => ({
            authId: 'therapist_abc',
            id: 'evt_booking_bk_1_rejected',
            name: 'BookingRejected',
            status: 'pending',
            attempts: 0,
            payload: {
              bookingId: 'bk_1',
              booking: mockBooking,
              reason: 'Scheduling conflict',
              declinedBy: 'therapist_abc',
              customNote: 'Sorry Jane'
            }
          })
        })),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new CancelBookingCommand('bk_1', 'Scheduling conflict', 'therapist_abc', 'therapist', 'Sorry Jane');
      const handler = new CancelBookingCommandHandler();
      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(mockBooking.status).toBe('rejected');
      expect(sendEmailAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'booking-declined',
        bookingId: 'bk_1'
      }));
    });
  });

  describe('RescheduleBookingCommand', () => {
    let mockBooking: Booking;

    beforeEach(() => {
      mockBooking = new Booking({
        id: 'bk_reschedule_1',
        status: 'confirmed',
        therapistId: 'therapist_1',
        name: 'John Smith',
        email: 'john@example.com',
        phone: '1234567890',
        date: '2026-08-10',
        time: '10:00',
        sessionMode: 'online',
        bookingToken: 'token_abc_123',
      });
    });

    it('A. Therapist can reschedule own booking & J. Old slot released & K. New slot reserved & L. Booking date/time updated & M. Audit log written', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);

      const mockTx = {
        get: vi.fn().mockImplementation(async (ref: any) => {
          if (typeof ref?.id === 'string' && ref.id.includes('14:00')) {
            return { exists: false };
          }
          if (typeof ref?.id === 'string' && ref.id.includes('10:00')) {
            return {
              exists: true,
              data: () => ({ bookingId: 'bk_reschedule_1' })
            };
          }
          return {
            exists: true,
            empty: true,
            docs: [],
            data: () => ({ authId: 'therapist_uid_1' })
          };
        }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };

      vi.mocked(adminDb.runTransaction).mockImplementation(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new RescheduleBookingCommand('bk_reschedule_1', '2026-08-31', '14:00', {
        uid: 'therapist_uid_1',
        role: 'therapist'
      });
      const handler = new RescheduleBookingCommandHandler();
      const updatedBooking = await handler.execute(command);

      expect(updatedBooking.date).toBe('2026-08-31');
      expect(updatedBooking.time).toBe('14:00');
      expect(mockTx.delete).toHaveBeenCalled(); // Old slot released
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          therapistId: 'therapist_1',
          date: '2026-08-31',
          time: '14:00',
          bookingId: 'bk_reschedule_1'
        })
      );
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'rescheduled',
          userId: 'therapist_uid_1'
        })
      );
    });

    it("B. Therapist cannot reschedule another therapist's booking", async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ authId: 'other_therapist_uid' })
        }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };

      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new RescheduleBookingCommand('bk_reschedule_1', '2026-08-31', '14:00', {
        uid: 'therapist_uid_1',
        role: 'therapist'
      });
      const handler = new RescheduleBookingCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow("Unauthorized to modify this booking");
    });

    it('C. Admin can reschedule any booking', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };

      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new RescheduleBookingCommand('bk_reschedule_1', '2026-08-31', '14:00', {
        uid: 'admin_uid_999',
        role: 'admin'
      });
      const handler = new RescheduleBookingCommandHandler();
      const updatedBooking = await handler.execute(command);

      expect(updatedBooking.date).toBe('2026-08-31');
      expect(updatedBooking.time).toBe('14:00');
    });

    it('D. Token flow can reschedule with valid token', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };

      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new RescheduleBookingCommand('bk_reschedule_1', '2026-08-31', '16:00', {
        isTokenFlow: true
      });
      const handler = new RescheduleBookingCommandHandler();
      const updatedBooking = await handler.execute(command);

      expect(updatedBooking.date).toBe('2026-08-31');
      expect(updatedBooking.time).toBe('16:00');
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'rescheduled',
          userId: 'system-token-flow'
        })
      );
    });

    it('E. Non-existent booking cannot reschedule', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(null);

      const mockTx = { get: vi.fn() };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new RescheduleBookingCommand('invalid_id', '2026-08-31', '14:00', { isTokenFlow: true });
      const handler = new RescheduleBookingCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow("Booking not found");
    });

    it('F. Cancelled booking cannot reschedule', async () => {
      mockBooking = new Booking({
        id: 'bk_cancelled',
        status: 'cancelled',
        therapistId: 'therapist_1',
        name: 'John',
        email: 'john@example.com',
        date: '2026-08-10',
        time: '10:00'
      });
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = { get: vi.fn() };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new RescheduleBookingCommand('bk_cancelled', '2026-08-31', '14:00', { isTokenFlow: true });
      const handler = new RescheduleBookingCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow("Cannot reschedule a cancelled or rejected booking.");
    });

    it('G. Rejected booking cannot reschedule', async () => {
      mockBooking = new Booking({
        id: 'bk_rejected',
        status: 'rejected',
        therapistId: 'therapist_1',
        name: 'John',
        email: 'john@example.com',
        date: '2026-08-10',
        time: '10:00'
      });
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = { get: vi.fn() };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new RescheduleBookingCommand('bk_rejected', '2026-08-31', '14:00', { isTokenFlow: true });
      const handler = new RescheduleBookingCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow("Cannot reschedule a cancelled or rejected booking.");
    });

    it('H. Active target slot blocks rescheduling', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ bookingId: 'existing_other_booking' })
        })
      };

      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new RescheduleBookingCommand('bk_reschedule_1', '2026-08-31', '14:00', { isTokenFlow: true });
      const handler = new RescheduleBookingCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow("This new slot is already booked.");
    });

    it('I. Expired target lock is cleaned and reused', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);

      const expiredDate = new Date(Date.now() - 60000);
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            expiresAt: { toDate: () => expiredDate }
          })
        }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };

      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new RescheduleBookingCommand('bk_reschedule_1', '2026-08-31', '14:00', { isTokenFlow: true });
      const handler = new RescheduleBookingCommandHandler();
      const updatedBooking = await handler.execute(command);

      expect(updatedBooking.date).toBe('2026-08-31');
      expect(mockTx.delete).toHaveBeenCalled(); // Expired lock deleted
    });

    it('N. Transaction failure leaves old slot + booking state intact', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async () => {
        throw new Error("This new slot is already booked.");
      });

      const command = new RescheduleBookingCommand('bk_reschedule_1', '2026-08-31', '14:00', { isTokenFlow: true });
      const handler = new RescheduleBookingCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow("This new slot is already booked.");
      expect(mockBooking.date).toBe('2026-08-10');
      expect(mockBooking.time).toBe('10:00');
    });

    it('O. Concurrent reschedule attempts cannot result in double-booking', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ expiresAt: new Date(Date.now() + 300000) }) // Active lock in place
        })
      };

      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new RescheduleBookingCommand('bk_reschedule_1', '2026-08-31', '14:00', { isTokenFlow: true });
      const handler = new RescheduleBookingCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow("This new slot is unavailable.");
    });
  });

  describe('AdminConfirmBookingCommand', () => {
    let mockBooking: Booking;

    beforeEach(() => {
      mockBooking = new Booking({
        id: 'bk_admin_confirm_1',
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '1234567890',
        date: '2026-08-15',
        time: '10:00',
        razorpayOrderId: 'order_123',
      });
      vi.clearAllMocks();
    });

    it('A. Admin manually confirms pending booking', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);

      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            id: 'evt_booking_bk_admin_confirm_1_confirmed',
            name: 'BookingConfirmed',
            status: 'pending',
            attempts: 0,
            payload: {
              bookingId: 'bk_admin_confirm_1',
              booking: mockBooking,
            }
          })
        }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (cb) => cb(mockTx as any));

      const command = new AdminConfirmBookingCommand('bk_admin_confirm_1', { role: 'admin', uid: 'admin_1' });
      const handler = new AdminConfirmBookingCommandHandler();
      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(mockBooking.status).toBe('confirmed');
      expect(sendEmailAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'booking-confirmed',
        bookingId: 'bk_admin_confirm_1'
      }));
    });

    it('B. Therapist manually confirms own booking', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);

      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ authId: 'therapist_uid_1' })
        }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (cb) => cb(mockTx as any));

      const command = new AdminConfirmBookingCommand('bk_admin_confirm_1', { role: 'therapist', uid: 'therapist_uid_1' });
      const handler = new AdminConfirmBookingCommandHandler();
      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(mockBooking.status).toBe('confirmed');
    });

    it('C. Therapist cannot confirm another therapist booking', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ authId: 'different_therapist' })
        }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (cb) => cb(mockTx as any));

      const command = new AdminConfirmBookingCommand('bk_admin_confirm_1', { role: 'therapist', uid: 'therapist_uid_1' });
      const handler = new AdminConfirmBookingCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow('Unauthorized to modify this booking');
    });

    it('D & E. Admin can confirm any booking without therapist ownership check', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (cb) => cb(mockTx as any));

      const command = new AdminConfirmBookingCommand('bk_admin_confirm_1', { role: 'admin', uid: 'admin_any' });
      const handler = new AdminConfirmBookingCommandHandler();
      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(mockTx.get).not.toHaveBeenCalled();
    });

    it('F & G. Manual confirmation releases locked_slots & writes audit log', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (cb) => cb(mockTx as any));

      const command = new AdminConfirmBookingCommand('bk_admin_confirm_1', { role: 'admin', uid: 'admin_1' });
      const handler = new AdminConfirmBookingCommandHandler();
      await handler.execute(command);

      expect(mockTx.delete).toHaveBeenCalled();
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'status_updated',
          status: 'confirmed',
          userId: 'admin_1'
        })
      );
    });

    it('H & I. Repeated manual confirmation is idempotent and cleans stale locks', async () => {
      mockBooking.status = 'confirmed';
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (cb) => cb(mockTx as any));

      const command = new AdminConfirmBookingCommand('bk_admin_confirm_1', { role: 'admin', uid: 'admin_1' });
      const handler = new AdminConfirmBookingCommandHandler();
      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(result.alreadyConfirmed).toBe(true);
      expect(mockTx.delete).toHaveBeenCalled();
      expect(sendEmailAction).not.toHaveBeenCalled();
    });

    it('M & N. Manual confirmation of cancelled or rejected booking is rejected', async () => {
      mockBooking.status = 'cancelled';
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (cb) => cb(mockTx as any));

      const command = new AdminConfirmBookingCommand('bk_admin_confirm_1', { role: 'admin', uid: 'admin_1' });
      const handler = new AdminConfirmBookingCommandHandler();

      await expect(handler.execute(command)).rejects.toThrow('Cannot confirm a cancelled or rejected booking');
    });

    it('J & K & L. Razorpay payment verification after manual confirmation updates payment state without duplicate email or error', async () => {
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);

      const mockTx1 = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            id: 'evt_booking_bk_admin_confirm_1_confirmed',
            name: 'BookingConfirmed',
            status: 'pending',
            attempts: 0,
            payload: {
              bookingId: 'bk_admin_confirm_1',
              booking: mockBooking,
            }
          })
        }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (cb) => cb(mockTx1 as any));

      const adminCmd = new AdminConfirmBookingCommand('bk_admin_confirm_1', { role: 'admin', uid: 'admin_1' });
      const adminHandler = new AdminConfirmBookingCommandHandler();
      await adminHandler.execute(adminCmd);

      expect(mockBooking.status).toBe('confirmed');
      expect(mockBooking.paymentStatus).toBe('pending');
      expect(sendEmailAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'booking-confirmed',
          bookingId: 'bk_admin_confirm_1',
        })
      );

      vi.clearAllMocks();
      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestoreBookingRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(firestorePaymentRepository, 'findByOrderId').mockResolvedValue(
        new Payment({ id: 'pay_1', bookingId: 'bk_admin_confirm_1', razorpayOrderId: 'order_123', status: 'pending' })
      );
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);

      const mockTx2 = {
        get: vi.fn().mockImplementation(async () => ({
          exists: true,
          data: () => ({
            id: 'evt_booking_bk_admin_confirm_1_confirmed',
            name: 'BookingConfirmed',
            status: 'processed',
            attempts: 1,
            payload: {
              bookingId: 'bk_admin_confirm_1',
              booking: mockBooking,
            }
          })
        })),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementation(async (cb) => cb(mockTx2 as any));

      const confirmPaymentCmd = new ConfirmBookingCommand('pay_razorpay_123', 'order_123', 'sig_123', 'verify_api');
      const confirmPaymentHandler = new ConfirmBookingCommandHandler();
      const payResult = await confirmPaymentHandler.execute(confirmPaymentCmd);

      expect(payResult.success).toBe(true);
      expect(mockBooking.status).toBe('confirmed');
      expect(mockBooking.paymentStatus).toBe('paid');
      expect(mockBooking.razorpayPaymentId).toBe('pay_razorpay_123');
      expect(sendEmailAction).not.toHaveBeenCalled();
    });
  });
});
