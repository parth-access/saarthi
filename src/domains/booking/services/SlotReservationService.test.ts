import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlotReservationService } from './SlotReservationService';
import { adminDb } from '@/lib/firebase/admin';
import { Transaction, CollectionReference, DocumentData, Timestamp } from 'firebase-admin/firestore';

// Mock the admin database
vi.mock('@/lib/firebase/admin', () => {
  const mockDoc = vi.fn((id) => ({ id }));
  const mockCollectionRef = {
    doc: mockDoc,
    where: vi.fn(),
    get: vi.fn(),
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

describe('SlotReservationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminDb.collection).mockImplementation(() => {
      const createDocMock = (id?: string): unknown => {
        return {
          id: id || 'mock-id',
          collection: vi.fn(() => ({
            doc: vi.fn((subId?: string) => createDocMock(subId)),
          })),
        };
      };
      return {
        doc: vi.fn((id?: string) => createDocMock(id)),
        where: vi.fn().mockReturnThis(),
        get: vi.fn(),
      } as unknown as CollectionReference<DocumentData>;
    });
  });

  describe('getSlotId', () => {
    it('should correctly format slot ID and replace slashes', () => {
      const slotId = SlotReservationService.getSlotId('therapist-1', '2026/07/16', '10:00');
      expect(slotId).toBe('therapist-1_2026-07-16_10:00');
    });
  });

  describe('acquireLock', () => {
    it('should successfully acquire a lock when slot does not exist', async () => {
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
      } as unknown as Transaction;

      const runTransactionMock = vi.mocked(adminDb.runTransaction);
      runTransactionMock.mockImplementationOnce(async (callback: (t: Transaction) => Promise<unknown>) => {
        return callback(mockTransaction);
      });

      const mockSet = vi.fn();
      const mockDocRef = { set: mockSet };
      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef),
      } as unknown as CollectionReference<DocumentData>);

      const result = await SlotReservationService.acquireLock(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'user-123',
        5,
        'custom-lock-123'
      );

      expect(result.success).toBe(true);
      expect(result.lockId).toBe('custom-lock-123');
      expect(mockTransaction.set).toHaveBeenCalled();
    });

    it('should fail to acquire a lock if slot is already booked', async () => {
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ bookingId: 'booking-123' }),
        }),
      } as unknown as Transaction;

      const runTransactionMock = vi.mocked(adminDb.runTransaction);
      runTransactionMock.mockImplementationOnce(async (callback: (t: Transaction) => Promise<unknown>) => {
        return callback(mockTransaction);
      });

      const result = await SlotReservationService.acquireLock(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'user-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('already booked');
    });

    it('should fail to acquire lock if reserved by another user', async () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 5);

      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            userId: 'other-user',
            lockId: 'other-lock',
            expiresAt: Timestamp.fromDate(futureDate),
          }),
        }),
      } as unknown as Transaction;

      const runTransactionMock = vi.mocked(adminDb.runTransaction);
      runTransactionMock.mockImplementationOnce(async (callback: (t: Transaction) => Promise<unknown>) => {
        return callback(mockTransaction);
      });

      const result = await SlotReservationService.acquireLock(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'user-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('reserved by another user');
    });

    it('should overwrite lock if existing lock is expired', async () => {
      const pastDate = new Date();
      pastDate.setMinutes(pastDate.getMinutes() - 5);

      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            userId: 'other-user',
            lockId: 'other-lock',
            expiresAt: Timestamp.fromDate(pastDate),
          }),
        }),
        set: vi.fn(),
      } as unknown as Transaction;

      const runTransactionMock = vi.mocked(adminDb.runTransaction);
      runTransactionMock.mockImplementationOnce(async (callback: (t: Transaction) => Promise<unknown>) => {
        return callback(mockTransaction);
      });

      const result = await SlotReservationService.acquireLock(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'user-123'
      );

      expect(result.success).toBe(true);
      expect(mockTransaction.set).toHaveBeenCalled();
    });
  });

  describe('releaseLock', () => {
    it('should successfully release lock if lockId matches and no booking exists', async () => {
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ lockId: 'lock-123', userId: 'user-123' }),
        }),
        delete: vi.fn(),
        set: vi.fn(),
      } as unknown as Transaction;

      const runTransactionMock = vi.mocked(adminDb.runTransaction);
      runTransactionMock.mockImplementationOnce(async (callback: (t: Transaction) => Promise<unknown>) => {
        return callback(mockTransaction);
      });

      const result = await SlotReservationService.releaseLock(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'lock-123',
        'user-123'
      );

      expect(result).toBe(true);
      expect(mockTransaction.delete).toHaveBeenCalled();
    });

    it('should fail to release if lockId mismatches', async () => {
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ lockId: 'different-lock', userId: 'user-123' }),
        }),
        delete: vi.fn(),
      } as unknown as Transaction;

      const runTransactionMock = vi.mocked(adminDb.runTransaction);
      runTransactionMock.mockImplementationOnce(async (callback: (t: Transaction) => Promise<unknown>) => {
        return callback(mockTransaction);
      });

      const result = await SlotReservationService.releaseLock(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'lock-123',
        'user-123'
      );

      expect(result).toBe(false);
      expect(mockTransaction.delete).not.toHaveBeenCalled();
    });
  });

  describe('extendLock', () => {
    it('should successfully extend lock if lockId matches', async () => {
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ lockId: 'lock-123', userId: 'user-123' }),
        }),
        update: vi.fn(),
        set: vi.fn(),
      } as unknown as Transaction;

      const runTransactionMock = vi.mocked(adminDb.runTransaction);
      runTransactionMock.mockImplementationOnce(async (callback: (t: Transaction) => Promise<unknown>) => {
        return callback(mockTransaction);
      });

      const result = await SlotReservationService.extendLock(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'lock-123',
        10
      );

      expect(result).toBe(true);
      expect(mockTransaction.update).toHaveBeenCalled();
    });
  });

  describe('recoverLock', () => {
    it('should recover lock successfully if active and matching', async () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 10);

      const mockGet = vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          lockId: 'lock-123',
          userId: 'user-123',
          expiresAt: Timestamp.fromDate(futureDate),
        }),
      });

      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue({
        doc: vi.fn().mockReturnValue({ get: mockGet }),
      } as unknown as CollectionReference<DocumentData>);

      const result = await SlotReservationService.recoverLock(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'lock-123',
        'user-123'
      );

      expect(result.success).toBe(true);
      expect(result.lockId).toBe('lock-123');
    });

    it('should fail to recover if lock has expired', async () => {
      const pastDate = new Date();
      pastDate.setMinutes(pastDate.getMinutes() - 10);

      const mockGet = vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          lockId: 'lock-123',
          userId: 'user-123',
          expiresAt: Timestamp.fromDate(pastDate),
        }),
      });

      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue({
        doc: vi.fn().mockReturnValue({ get: mockGet }),
      } as unknown as CollectionReference<DocumentData>);

      const result = await SlotReservationService.recoverLock(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'lock-123',
        'user-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  describe('expireLock', () => {
    it('should expire lock and cancel pending booking', async () => {
      const mockTransaction = {
        get: vi.fn().mockImplementation(async (ref: { id: string }) => {
          if (ref.id === 'test-booking-id') {
            return {
              exists: true,
              data: () => ({ status: 'awaiting_payment' }),
            };
          }
          return {
            exists: true,
            id: 'slot-id',
            data: () => ({ lockId: 'lock-123', bookingId: 'test-booking-id' }),
          };
        }),
        delete: vi.fn(),
        update: vi.fn(),
        set: vi.fn(),
      } as unknown as Transaction;

      const runTransactionMock = vi.mocked(adminDb.runTransaction);
      runTransactionMock.mockImplementationOnce(async (callback: (t: Transaction) => Promise<unknown>) => {
        return callback(mockTransaction);
      });

      const result = await SlotReservationService.expireLock(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'lock-123'
      );

      expect(result).toBe(true);
      expect(mockTransaction.delete).toHaveBeenCalled();
      expect(mockTransaction.update).toHaveBeenCalled();
    });
  });

  describe('cleanExpiredLocks', () => {
    it('should search for and expire multiple locks', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        docs: [
          {
            data: () => ({
              therapistId: 'therapist-1',
              date: '2026-07-16',
              time: '10:00',
              lockId: 'lock-1',
            }),
          },
          {
            data: () => ({
              therapistId: 'therapist-1',
              date: '2026-07-16',
              time: '11:00',
              lockId: 'lock-2',
            }),
          },
        ],
      });

      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        get: mockGet,
      } as unknown as CollectionReference<DocumentData>);

      // Spy on expireLock
      const expireLockSpy = vi.spyOn(SlotReservationService, 'expireLock').mockResolvedValue(true);

      const result = await SlotReservationService.cleanExpiredLocks();

      expect(result.cleanedCount).toBe(2);
      expect(expireLockSpy).toHaveBeenCalledTimes(2);

      expireLockSpy.mockRestore();
    });
  });
});
