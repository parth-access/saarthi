/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateBookingCommand, CreateBookingCommandHandler } from './CreateBookingCommand';
import { LockSlotCommand, LockSlotCommandHandler } from './LockSlotCommand';
import { GeneratePaymentLinkCommand, GeneratePaymentLinkCommandHandler } from './GeneratePaymentLinkCommand';
import { StartPaymentCommand, StartPaymentCommandHandler } from './StartPaymentCommand';
import { ConfirmBookingCommand, ConfirmBookingCommandHandler } from './ConfirmBookingCommand';
import { CancelBookingCommand, CancelBookingCommandHandler } from './CancelBookingCommand';
import { adminDb } from '@/lib/firebase/admin';
import { firestoreBookingRepository, Booking } from '@/domains/booking';
import { firestorePaymentRepository, Payment, razorpayGateway } from '@/domains/payment';
import { sendEmailAction } from '@/app/api/email/emailSender';
import { EventBus } from '@/shared/events/EventBus';
import { registerListeners } from '@/shared/events/listeners';

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
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: vi.fn(),
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
    EventBus.clear();
    registerListeners(EventBus);
  });

  describe('CreateBookingCommand', () => {
    it('should successfully handle CreateBookingCommand', async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        delete: vi.fn(),
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
    });
  });

  describe('LockSlotCommand', () => {
    it('should lock a slot successfully', async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
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

  describe('GeneratePaymentLinkCommand', () => {
    it('should generate a payment link and trigger email', async () => {
      const mockBooking = new Booking({
        id: 'bk_1',
        therapistId: 'therapist_1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '9999999999',
        age: 25,
        date: '2026-07-20',
        time: '11:00',
        message: 'Stress management',
        sessionMode: 'online',
        status: 'pending',
      });

      vi.spyOn(firestoreBookingRepository, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(firestorePaymentRepository, 'save').mockResolvedValue(undefined);

      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new GeneratePaymentLinkCommand('bk_1');
      const handler = new GeneratePaymentLinkCommandHandler();
      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(sendEmailAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'booking-payment-link',
        bookingId: 'bk_1'
      }));
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
        status: 'payment_initiated',
        email: 'jane@example.com',
        therapistId: 'therapist_1',
        name: 'Jane Doe'
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
      };
      vi.mocked(adminDb.runTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockTx as any);
      });

      const command = new ConfirmBookingCommand('bk_1', 'pay_123', 'order_123', 'sig_123', 'direct');
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
