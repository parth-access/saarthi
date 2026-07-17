import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firestoreBookingRepository } from './repository/FirestoreBookingRepository';
import { adminDb } from '@/lib/firebase/admin';
import { Booking } from './entities/Booking';
import { Transaction, CollectionReference, DocumentData } from 'firebase-admin/firestore';

// Mock the admin database
vi.mock('@/lib/firebase/admin', () => {
  const mockDoc = vi.fn();
  const mockCollectionRef = {
    doc: mockDoc,
    where: vi.fn(),
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

describe('FirestoreBookingRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateId', () => {
    it('should generate a string starting with bk_ and of correct length', () => {
      const id = firestoreBookingRepository.generateId();
      expect(id).toMatch(/^bk_\d{8}_[A-Z0-9]{5}$/);
    });

    it('should generate unique IDs on consecutive calls', () => {
      const id1 = firestoreBookingRepository.generateId();
      const id2 = firestoreBookingRepository.generateId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('create', () => {
    it('should set the document data directly if no transaction is provided', async () => {
      const booking = { id: 'test-id', name: 'John Doe', status: 'pending' } as unknown as Booking;
      const mockSet = vi.fn().mockResolvedValue(undefined);
      const mockDocRef = { set: mockSet };
      
      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValueOnce({
        doc: vi.fn().mockReturnValue(mockDocRef),
      } as unknown as CollectionReference<DocumentData>);

      await firestoreBookingRepository.create(booking);

      expect(adminDb.collection).toHaveBeenCalledWith('bookings');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-id',
          name: 'John Doe',
          status: 'pending',
          createdAt: expect.anything(),
          updatedAt: expect.anything(),
        })
      );
    });

    it('should use transaction.set if transaction is provided', async () => {
      const booking = { id: 'test-id', name: 'John Doe', status: 'pending' } as unknown as Booking;
      const mockDocRef = { id: 'test-id' };
      
      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValueOnce({
        doc: vi.fn().mockReturnValue(mockDocRef),
      } as unknown as CollectionReference<DocumentData>);

      const mockTransaction = {
        set: vi.fn(),
      } as unknown as Transaction;

      await firestoreBookingRepository.create(booking, mockTransaction);

      expect(adminDb.collection).toHaveBeenCalledWith('bookings');
      expect(mockTransaction.set).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          id: 'test-id',
          name: 'John Doe',
          status: 'pending',
          createdAt: expect.anything(),
          updatedAt: expect.anything(),
        })
      );
    });
  });

  describe('lockSlot', () => {
    it('should lock the slot when transaction is provided and slot is available', async () => {
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
      } as unknown as Transaction;

      const result = await firestoreBookingRepository.lockSlot(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'lock-123',
        new Date(),
        mockTransaction
      );

      expect(result).toBe(true);
      expect(mockTransaction.set).toHaveBeenCalled();
    });

    it('should return false if slot is already booked', async () => {
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ bookingId: 'existing-booking' }),
        }),
        set: vi.fn(),
      } as unknown as Transaction;

      const result = await firestoreBookingRepository.lockSlot(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'lock-123',
        new Date(),
        mockTransaction
      );

      expect(result).toBe(false);
      expect(mockTransaction.set).not.toHaveBeenCalled();
    });
  });

  describe('releaseSlot', () => {
    it('should delete the slot document if lock matches and no booking exists', async () => {
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ lockId: 'lock-123' }),
        }),
        delete: vi.fn(),
      } as unknown as Transaction;

      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue({
        doc: vi.fn().mockReturnValue({}),
      } as unknown as CollectionReference<DocumentData>);

      await firestoreBookingRepository.releaseSlot(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'lock-123',
        mockTransaction
      );

      expect(mockTransaction.delete).toHaveBeenCalled();
    });

    it('should not delete the slot document if lock does not match', async () => {
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ lockId: 'other-lock' }),
        }),
        delete: vi.fn(),
      } as unknown as Transaction;

      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue({
        doc: vi.fn().mockReturnValue({}),
      } as unknown as CollectionReference<DocumentData>);

      await firestoreBookingRepository.releaseSlot(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'lock-123',
        mockTransaction
      );

      expect(mockTransaction.delete).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should retrieve a booking by its id and return it', async () => {
      const mockBooking = { id: 'bk_123', name: 'Patient' };
      const mockGet = vi.fn().mockResolvedValue({
        exists: true,
        id: 'bk_123',
        data: () => mockBooking,
      });

      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue({
        doc: vi.fn().mockReturnValue({ get: mockGet }),
      } as unknown as CollectionReference<DocumentData>);

      const booking = await firestoreBookingRepository.findById('bk_123');

      expect(booking).toEqual(new Booking({ id: 'bk_123', name: 'Patient', status: 'pending' }));
    });

    it('should return null if booking is not found', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        exists: false,
      });

      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue({
        doc: vi.fn().mockReturnValue({ get: mockGet }),
      } as unknown as CollectionReference<DocumentData>);

      const booking = await firestoreBookingRepository.findById('bk_invalid');

      expect(booking).toBeNull();
    });
  });

  describe('findByToken', () => {
    it('should retrieve a booking by token and return it', async () => {
      const mockBooking = { id: 'bk_123', name: 'Patient', bookingToken: 'tok_abc' };
      const mockGet = vi.fn().mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'bk_123',
            data: () => mockBooking,
          },
        ],
      });

      const collectionMock = vi.mocked(adminDb.collection);
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: mockGet,
      };
      collectionMock.mockReturnValue(mockQuery as unknown as CollectionReference<DocumentData>);

      const booking = await firestoreBookingRepository.findByToken('tok_abc');

      expect(booking).toEqual(new Booking({ id: 'bk_123', name: 'Patient', bookingToken: 'tok_abc', status: 'pending' }));
    });
  });

  describe('save', () => {
    it('should update the document data with merge if no transaction is provided', async () => {
      const booking = { id: 'test-id', name: 'John Doe', status: 'confirmed' } as unknown as Booking;
      const mockSet = vi.fn().mockResolvedValue(undefined);
      const mockDocRef = { set: mockSet };
      
      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValueOnce({
        doc: vi.fn().mockReturnValue(mockDocRef),
      } as unknown as CollectionReference<DocumentData>);

      await firestoreBookingRepository.save(booking);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-id',
          name: 'John Doe',
          status: 'confirmed',
          updatedAt: expect.anything(),
        }),
        { merge: true }
      );
    });
  });
});

