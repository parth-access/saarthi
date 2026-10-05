/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firestoreBookingRepository, BookingMapper } from './repository/FirestoreBookingRepository';
import { adminDb } from '@/lib/firebase/admin';
import { Booking } from './entities/Booking';
import { Transaction, CollectionReference, DocumentData, Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore } from '@/shared/firestore/testing/fakeFirestore';

// Mock the admin database
vi.mock('@/lib/firebase/admin', () => {
  const mockDoc = vi.fn();
  const mockCollectionRef = {
    doc: mockDoc,
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
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
    it('should generate a string starting with bk_, YYYYMMDD, and 8 hex/alphanumeric chars', () => {
      const id = firestoreBookingRepository.generateId();
      expect(id).toMatch(/^bk_\d{8}_[A-Z0-9]{8}$/);
    });

    it('should generate unique IDs on consecutive calls', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(firestoreBookingRepository.generateId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('BookingMapper', () => {
    it('toPersistence should strip id and preserve other properties', () => {
      const booking = new Booking({
        id: 'bk_12345678_ABCDEF12',
        name: 'Jane Doe',
        email: 'jane@example.com',
        status: 'confirmed',
        paymentStatus: 'paid',
        noShowReason: 'Traffic delay'
      });
      const persistence = BookingMapper.toPersistence(booking);
      expect(persistence).not.toHaveProperty('id');
      expect(persistence.name).toBe('Jane Doe');
      expect(persistence.email).toBe('jane@example.com');
      expect(persistence.status).toBe('confirmed');
      expect(persistence.paymentStatus).toBe('paid');
      expect(persistence.noShowReason).toBe('Traffic delay');
    });

    it('toEntity should instantiate Booking with correct values', () => {
      const mockDoc = {
        id: 'bk_999',
        data: () => ({
          name: 'Jane Doe',
          email: 'jane@example.com',
          status: 'confirmed',
          paymentStatus: 'paid',
        })
      };
      const entity = BookingMapper.toEntity(mockDoc as any);
      expect(entity.id).toBe('bk_999');
      expect(entity.name).toBe('Jane Doe');
      expect(entity.status).toBe('confirmed');
      expect(entity.paymentStatus).toBe('paid');
    });

    describe('rescheduleHistory — self-service reschedule regression (production 500)', () => {
      const RESCHEDULED_AT = Timestamp.fromDate(new Date('2026-09-03T12:00:00.000Z'));

      const rescheduledBookingWithoutReason = () => {
        const booking = new Booking({
          id: 'bk_1',
          therapistId: 'th_1',
          status: 'confirmed',
          date: '2026-09-04',
          time: '09:00',
        });
        // What `/api/bookings/reschedule-self` does today: no reason is ever
        // supplied anywhere in the reschedule flow.
        booking.reschedule('2026-09-04', '09:45', RESCHEDULED_AT);
        return booking;
      };

      it('omits the optional reason key from the persisted entry', () => {
        const booking = rescheduledBookingWithoutReason();
        const persisted = BookingMapper.toPersistence(booking) as {
          rescheduleHistory: Record<string, unknown>[];
        };

        const entry = persisted.rescheduleHistory[0];
        // `toEqual` would ignore a `reason: undefined` property, so assert the
        // key is *absent* — that is the data-contract fix.
        expect('reason' in entry).toBe(false);
        expect(entry).toEqual({
          previousDate: '2026-09-04',
          previousTime: '09:00',
          newDate: '2026-09-04',
          newTime: '09:45',
          rescheduledAt: RESCHEDULED_AT,
        });
      });

      it('keeps the reason key when a reason was provided', () => {
        const booking = rescheduledBookingWithoutReason();
        booking.reschedule('2026-09-05', '11:00', RESCHEDULED_AT, undefined, 'Client requested morning slot');

        const persisted = BookingMapper.toPersistence(booking) as {
          rescheduleHistory: Record<string, unknown>[];
        };
        expect(persisted.rescheduleHistory[1].reason).toBe('Client requested morning slot');
      });

      it('the serialized write passes Firestore validation with no undefined inside the array', async () => {
        // The fake enforces the real client's serializer rule this project does
        // not opt out of: before the fix, this write threw the exact production
        // error — `Cannot use "undefined" as a Firestore value (found in field
        // "rescheduleHistory.`0`.reason")` — aborting the whole transaction.
        const db = new FakeFirestore();
        const booking = rescheduledBookingWithoutReason();
        const persisted = BookingMapper.toPersistence(booking);

        await db.runTransaction(async (tx) => {
          tx.create(db.collection('bookings').doc('bk_1'), persisted as Record<string, unknown>);
        });

        const stored = db.docs.get('bookings/bk_1') as {
          rescheduleHistory: Record<string, unknown>[];
        };
        expect(stored.rescheduleHistory).toHaveLength(1);
        expect('reason' in stored.rescheduleHistory[0]).toBe(false);
        expect(stored.rescheduleHistory[0]).toMatchObject({
          previousDate: '2026-09-04',
          newDate: '2026-09-04',
          newTime: '09:45',
        });
      });
    });
  });

  describe('create', () => {
    it('should check document existence and throw if booking ID already exists (non-transactional)', async () => {
      const booking = new Booking({ id: 'bk_existing', name: 'John Doe', status: 'pending' });
      
      const mockDocRef = { id: 'bk_existing' };
      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef),
      } as unknown as CollectionReference<DocumentData>);

      const runTransactionMock = vi.mocked(adminDb.runTransaction);
      runTransactionMock.mockImplementation(async (callback: any) => {
        const mockTx = {
          get: vi.fn().mockResolvedValue({ exists: true }),
          set: vi.fn(),
        };
        return callback(mockTx);
      });

      await expect(firestoreBookingRepository.create(booking)).rejects.toThrow('Booking with ID bk_existing already exists.');
    });

    it('should create booking inside transaction if it does not exist', async () => {
      const booking = new Booking({ id: 'bk_new', name: 'John Doe', status: 'pending' });
      const mockDocRef = { id: 'bk_new' };
      
      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef),
      } as unknown as CollectionReference<DocumentData>);

      const mockTransaction = {
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
      } as unknown as Transaction;

      await firestoreBookingRepository.create(booking, mockTransaction);

      expect(mockTransaction.get).toHaveBeenCalledWith(mockDocRef);
      expect(mockTransaction.set).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'John Doe',
          status: 'pending',
          createdAt: expect.anything(),
          updatedAt: expect.anything(),
        })
      );
    });

    it('should throw inside transaction if booking already exists', async () => {
      const booking = new Booking({ id: 'bk_new', name: 'John Doe', status: 'pending' });
      const mockDocRef = { id: 'bk_new' };
      
      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef),
      } as unknown as CollectionReference<DocumentData>);

      const mockTransaction = {
        get: vi.fn().mockResolvedValue({ exists: true }),
        set: vi.fn(),
      } as unknown as Transaction;

      await expect(firestoreBookingRepository.create(booking, mockTransaction)).rejects.toThrow('Booking with ID bk_new already exists.');
      expect(mockTransaction.set).not.toHaveBeenCalled();
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
        new Date(Date.now() + 600000),
        mockTransaction
      );

      expect(result).toBe(true);
      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          therapistId: 'therapist-1',
          date: '2026-07-16',
          time: '10:00',
          lockId: 'lock-123',
          expiresAt: expect.any(Timestamp),
        })
      );
    });

    it('should overwrite lock if existing lock is expired', async () => {
      const pastDate = new Date(Date.now() - 60000);
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            lockId: 'old-lock',
            expiresAt: { toDate: () => pastDate },
          }),
        }),
        set: vi.fn(),
      } as unknown as Transaction;

      const result = await firestoreBookingRepository.lockSlot(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'lock-123',
        new Date(Date.now() + 600000),
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

    it('should return false if slot is locked by another active lockId', async () => {
      const futureDate = new Date(Date.now() + 600000);
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            lockId: 'other-lock',
            expiresAt: { toDate: () => futureDate },
          }),
        }),
        set: vi.fn(),
      } as unknown as Transaction;

      const result = await firestoreBookingRepository.lockSlot(
        'therapist-1',
        '2026-07-16',
        '10:00',
        'lock-123',
        futureDate,
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

    it('should not delete the slot document if lockId matches but bookingId is present', async () => {
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ lockId: 'lock-123', bookingId: 'bk_confirmed' }),
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
    it('should retrieve a booking by its id and pin non-default fields', async () => {
      const mockBooking = {
        name: 'Patient',
        email: 'patient@example.com',
        status: 'confirmed',
        paymentStatus: 'paid',
        therapistId: 'th_123',
        noShowReason: 'Emergency'
      };
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

      expect(booking).not.toBeNull();
      expect(booking?.id).toBe('bk_123');
      expect(booking?.name).toBe('Patient');
      expect(booking?.email).toBe('patient@example.com');
      expect(booking?.status).toBe('confirmed');
      expect(booking?.paymentStatus).toBe('paid');
      expect(booking?.therapistId).toBe('th_123');
      expect(booking?.noShowReason).toBe('Emergency');
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

  describe('findByOrderId', () => {
    it('should retrieve a booking by razorpayOrderId', async () => {
      const mockBooking = { id: 'bk_123', razorpayOrderId: 'order_abc', status: 'awaiting_payment' };
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

      const booking = await firestoreBookingRepository.findByOrderId('order_abc');

      expect(booking).toEqual(new Booking({ id: 'bk_123', razorpayOrderId: 'order_abc', status: 'awaiting_payment' }));
    });
  });

  describe('findStaleBookings', () => {
    it('should query bookings with status in awaiting_payment/pending, threshold, and limit', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'bk_stale_1',
            data: () => ({ status: 'awaiting_payment', name: 'Stale User' }),
          },
        ],
      });

      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: mockGet,
      };

      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue(mockQuery as unknown as CollectionReference<DocumentData>);

      const threshold = new Date(Date.now() - 30 * 60 * 1000);
      const results = await firestoreBookingRepository.findStaleBookings(threshold, 100);

      expect(collectionMock).toHaveBeenCalledWith('bookings');
      expect(mockQuery.where).toHaveBeenCalledWith('status', 'in', ['awaiting_payment', 'pending']);
      expect(mockQuery.where).toHaveBeenCalledWith('createdAt', '<', expect.any(Timestamp));
      expect(mockQuery.limit).toHaveBeenCalledWith(100);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('bk_stale_1');
    });
  });

  describe('save', () => {
    it('should update document with merge and omit id from body', async () => {
      const booking = new Booking({ id: 'test-id', name: 'John Doe', status: 'confirmed' });
      const mockSet = vi.fn().mockResolvedValue(undefined);
      const mockDocRef = { set: mockSet };
      
      const collectionMock = vi.mocked(adminDb.collection);
      collectionMock.mockReturnValue({
        doc: vi.fn().mockReturnValue(mockDocRef),
      } as unknown as CollectionReference<DocumentData>);

      await firestoreBookingRepository.save(booking);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'John Doe',
          status: 'confirmed',
          updatedAt: expect.anything(),
        }),
        { merge: true }
      );
      const passedData = mockSet.mock.calls[0][0];
      expect(passedData).not.toHaveProperty('id');
    });
  });
});


