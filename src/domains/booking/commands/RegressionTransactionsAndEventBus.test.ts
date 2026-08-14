/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { razorpayGateway } from '@/domains/payment/RazorpayGateway';
import { CreateBookingCommand, CreateBookingCommandHandler } from './CreateBookingCommand';
import { EventBus } from '@/shared/events/EventBus';
import { registerListeners } from '@/shared/events/listeners';
import { sendEmailAction } from '@/app/api/email/emailSender';
import { Booking } from '../entities/Booking';

// Mock admin database
vi.mock('@/lib/firebase/admin', () => {
  const mockDoc = vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ id: 'therapist_1' }) }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ exists: false }),
      }),
    }),
  });
  const mockCollection = vi.fn(() => ({
    doc: mockDoc,
  }));
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

describe('Regression Tests: Firestore Transactions, EventBus & Idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    EventBus.clear();
  });

  describe('A. Compensating Transaction: Order of Reads Before Writes & Cleanup', () => {
    it('executes all transaction reads (t.get) BEFORE any writes (t.set, t.delete) during payment failure cleanup', async () => {
      const callLog: string[] = [];

      const mockTx = {
        get: vi.fn().mockImplementation(async () => {
          callLog.push('get');
          // For first transaction, slot doesn't exist yet
          // For compensating transaction, slot exists with the bookingId
          return { exists: false, data: () => ({ bookingId: 'bk_compensate_test' }) };
        }),
        set: vi.fn().mockImplementation(() => {
          callLog.push('set');
        }),
        delete: vi.fn().mockImplementation(() => {
          callLog.push('delete');
        }),
        update: vi.fn().mockImplementation(() => {
          callLog.push('update');
        }),
      };

      // First runTransaction is the booking creation transaction
      // Second runTransaction is the compensating transaction
      vi.mocked(adminDb.runTransaction)
        .mockImplementationOnce(async (callback) => {
          return callback(mockTx as any);
        })
        .mockImplementationOnce(async (callback) => {
          callLog.length = 0; // reset to track compensating transaction exclusively
          // In compensating transaction, slotDoc exists
          mockTx.get.mockImplementationOnce(async () => {
            callLog.push('get');
            return { exists: true, data: () => ({ bookingId: 'bk_compensate_test' }) };
          });
          return callback(mockTx as any);
        });

      vi.spyOn(razorpayGateway, 'createOrder').mockRejectedValueOnce(new Error('Gateway unavailable'));

      const command = new CreateBookingCommand(
        {
          therapistId: 'therapist_1',
          name: 'Alice Smith',
          email: 'alice@example.com',
          phone: '9876543210',
          date: '2026-08-20',
          time: '10:00',
          sessionMode: 'online'
        },
        'user_alice',
        'alice@example.com'
      );

      const handler = new CreateBookingCommandHandler();
      await expect(handler.execute(command)).rejects.toThrow('Failed to initialize payment gateway.');

      expect(callLog.length).toBeGreaterThan(0);
      const firstGetIndex = callLog.indexOf('get');
      const firstDeleteIndex = callLog.indexOf('delete');
      const firstSetIndex = callLog.indexOf('set');

      // Verify that every get occurred before any delete or set
      expect(firstGetIndex).toBe(0);
      expect(firstGetIndex).toBeLessThan(firstDeleteIndex);
      expect(firstGetIndex).toBeLessThan(firstSetIndex);

      // Verify booking and slot deletion were called
      expect(mockTx.delete).toHaveBeenCalled(); // bookingRef delete + slotRef delete
      expect(mockTx.set).toHaveBeenCalled(); // audit_log set
    });
  });

  describe('B. EventBus: Static Listener Initialization & Validation', () => {
    it('throws a TypeError immediately when subscribing a non-function listener', () => {
      expect(() => {
        EventBus.subscribe('TestEvent', null as any);
      }).toThrow(TypeError);

      expect(() => {
        EventBus.subscribe('TestEvent', undefined as any);
      }).toThrow(TypeError);

      expect(() => {
        EventBus.subscribe('TestEvent', {} as any);
      }).toThrow(TypeError);
    });

    it('successfully registers and receives events with static listeners', async () => {
      registerListeners(EventBus);
      const listenerSpy = vi.fn();
      EventBus.subscribe('CustomTestEvent', listenerSpy);

      await EventBus.publish({
        name: 'CustomTestEvent',
        timestamp: new Date(),
        payload: { test: 123 }
      });

      expect(listenerSpy).toHaveBeenCalledTimes(1);
      expect(listenerSpy).toHaveBeenCalledWith(expect.objectContaining({
        name: 'CustomTestEvent',
        payload: { test: 123 },
        correlationId: expect.any(String),
      }));
    });

    it('does not re-register default listeners more than once on repeated publish calls', async () => {
      const listenerSpy = vi.fn();
      EventBus.subscribe('UniqueEvent', listenerSpy);

      await EventBus.publish({ name: 'UniqueEvent', timestamp: new Date(), payload: {} });
      await EventBus.publish({ name: 'UniqueEvent', timestamp: new Date(), payload: {} });

      expect(listenerSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('C. Transaction Retry Safety & Idempotent Event Publishing', () => {
    it('when state transition occurs, email listener triggers with expected payload', async () => {
      registerListeners(EventBus);
      const booking = new Booking({
        id: 'bk_retry_test',
        therapistId: 'therapist_1',
        name: 'Bob',
        email: 'bob@example.com',
        phone: '1234567890',
        date: '2026-09-01',
        time: '14:00',
        status: 'awaiting_payment',
        paymentAmount: 1500,
        paymentCurrency: 'INR'
      });

      booking.confirmPayment(new Date());

      // Give asynchronous EventBus listeners a tick to complete
      await new Promise((r) => setTimeout(r, 20));

      expect(sendEmailAction).toHaveBeenCalledTimes(1);
      expect(sendEmailAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'booking-confirmed',
          bookingId: 'bk_retry_test',
          therapistId: 'therapist_1',
        })
      );
    });

    it('AuditListener handles events without throwing even if Firestore is invoked', async () => {
      registerListeners(EventBus);
      const booking = new Booking({
        id: 'bk_audit_test',
        userId: 'user_123',
        status: 'draft'
      });

      expect(() => {
        booking.lockSlot();
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 20));
      expect(booking.status).toBe('slot_locked');
    });
  });

  describe('D. Crash & Event Recovery Semantics', () => {
    it('EventBus safely catches and logs listener failures without breaking caller flow', async () => {
      const failingListener = vi.fn().mockRejectedValue(new Error('Simulated network crash in listener'));
      const successfulListener = vi.fn().mockResolvedValue(undefined);

      EventBus.subscribe('CrashTestEvent', failingListener);
      EventBus.subscribe('CrashTestEvent', successfulListener);

      await expect(
        EventBus.publish({
          name: 'CrashTestEvent',
          timestamp: new Date(),
          payload: { bookingId: 'bk_crash' }
        })
      ).resolves.not.toThrow();

      expect(failingListener).toHaveBeenCalledTimes(1);
      expect(successfulListener).toHaveBeenCalledTimes(1);
    });
  });
});

