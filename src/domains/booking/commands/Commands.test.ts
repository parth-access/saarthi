/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateBookingCommand, CreateBookingCommandHandler } from './CreateBookingCommand';
import { GeneratePaymentLinkCommand, GeneratePaymentLinkCommandHandler } from './GeneratePaymentLinkCommand';
import { LockSlotCommand, LockSlotCommandHandler } from './LockSlotCommand';
import { StartPaymentCommand, StartPaymentCommandHandler } from './StartPaymentCommand';
import { ConfirmBookingCommand, ConfirmBookingCommandHandler } from './ConfirmBookingCommand';
import { CancelBookingCommand, CancelBookingCommandHandler } from './CancelBookingCommand';
import { adminDb } from '@/lib/firebase/admin';
import { firestoreBookingRepository, Booking } from '@/domains/booking';
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

    it('9. GeneratePaymentLinkCommand: blocks concurrent order creation when orderCreationInProgress is true', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        date: '2026-07-20',
        time: '11:00',
        status: 'awaiting_payment',
        orderCreationInProgress: true,
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

      await expect(handler.execute(command)).rejects.toThrow('Payment order creation is already in progress');
      expect(razorpayGateway.createOrder).not.toHaveBeenCalled();
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
    it('should confirm payment and transition booking to confirmed', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        status: 'payment_initiated', paymentStatus: 'pending',
        email: 'jane@example.com',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        razorpayOrderId: 'order_123'
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      const mockPayment = new Payment({
        id: 'order_123',
        bookingId: 'bk_1',
        amount: 1500,
        currency: 'INR',
        status: 'pending'
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
      expect(sendEmailAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'booking-confirmed',
        bookingId: 'bk_1'
      }));
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
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ authId: 'therapist_abc' })
        }),
        set: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
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
});
