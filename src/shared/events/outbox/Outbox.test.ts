/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDeterministicEventId } from './OutboxEvent';
import { OutboxService } from './OutboxService';
import { OutboxProcessor } from './OutboxProcessor';
import { EventBus } from '../EventBus';
import { adminDb } from '@/lib/firebase/admin';

vi.mock('@/lib/firebase/admin', () => {
  const store = new Map<string, any>();

  const createDocRef = (path: string) => {
    return {
      id: path.split('/').pop(),
      path,
      get: vi.fn(async () => {
        const data = store.get(path);
        return {
          exists: !!data,
          data: () => data,
        };
      }),
      set: vi.fn(async (data: any, options?: any) => {
        if (options?.merge && store.has(path)) {
          store.set(path, { ...store.get(path), ...data });
        } else {
          store.set(path, data);
        }
      }),
      create: vi.fn(async (data: any) => {
        // Mirror Firestore: create fails if the document already exists.
        if (store.has(path)) {
          const err: any = new Error(`Cannot create document ${path}: already exists`);
          err.code = 6; // ALREADY_EXISTS
          throw err;
        }
        store.set(path, data);
      }),
      update: vi.fn(async (data: any) => {
        const existing = store.get(path) || {};
        store.set(path, { ...existing, ...data });
      }),
      delete: vi.fn(async () => {
        store.delete(path);
      }),
    };
  };

  const collection = (colName: string) => ({
    doc: (docId?: string) => {
      const id = docId || `mock_doc_${Math.random().toString(36).substring(2, 9)}`;
      return createDocRef(`${colName}/${id}`);
    },
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({
      get: vi.fn(async () => {
        const docs = Array.from(store.entries())
          .filter(([key]) => key.startsWith(`${colName}/`))
          .map(([key, data]) => ({
            id: key.split('/').pop(),
            data: () => data,
          }));
        return { docs, empty: docs.length === 0, size: docs.length };
      }),
    }),
    get: vi.fn(async () => {
      const docs = Array.from(store.entries())
        .filter(([key]) => key.startsWith(`${colName}/`))
        .map(([key, data]) => ({
          id: key.split('/').pop(),
          data: () => data,
        }));
      return { docs, empty: docs.length === 0, size: docs.length };
    }),
  });

  return {
    adminDb: {
      collection,
      runTransaction: vi.fn(async (updateFunction: any) => {
        const transaction = {
          get: vi.fn(async (ref: any) => ref.get()),
          set: vi.fn((ref: any, data: any, options?: any) => ref.set(data, options)),
          // Mirror firebase-admin: transaction.create is synchronous (buffers the
          // write) and fails the transaction if the document already exists.
          create: vi.fn((ref: any, data: any) => {
            if (store.has(ref.path)) {
              const err: any = new Error(`Cannot create document ${ref.path}: already exists`);
              err.code = 6; // ALREADY_EXISTS
              throw err;
            }
            store.set(ref.path, data);
          }),
          update: vi.fn((ref: any, data: any) => ref.update(data)),
          delete: vi.fn((ref: any) => ref.delete()),
        };
        return updateFunction(transaction);
      }),
      _store: store,
      _clear: () => store.clear(),
    },
  };
});

describe('Transactional Outbox Pattern', () => {
  beforeEach(() => {
    (adminDb as any)._clear();
    vi.clearAllMocks();
  });

  describe('generateDeterministicEventId', () => {
    it('produces identical IDs for the same aggregate and state transition', () => {
      const id1 = generateDeterministicEventId('booking', 'bk_123', 'awaiting_payment');
      const id2 = generateDeterministicEventId('booking', 'bk_123', 'awaiting_payment');
      expect(id1).toBe(id2);
      expect(id1).toBe('outbox_booking_bk_123_awaiting_payment');
    });

    it('produces distinct IDs for different transitions or aggregates', () => {
      const id1 = generateDeterministicEventId('booking', 'bk_123', 'awaiting_payment');
      const id2 = generateDeterministicEventId('booking', 'bk_123', 'confirmed');
      const id3 = generateDeterministicEventId('booking', 'bk_456', 'awaiting_payment');
      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
    });
  });

  describe('OutboxService.recordEventInTransaction', () => {
    it('records the event once and refuses to duplicate it on command replay (insert-only)', async () => {
      const eventId = generateDeterministicEventId('booking', 'bk_retry_test', 'awaiting_payment');
      const mockPayload = {
        id: eventId,
        name: 'BookingAwaitingPayment',
        aggregateType: 'booking' as const,
        aggregateId: 'bk_retry_test',
        payload: { bookingId: 'bk_retry_test', targetStatus: 'awaiting_payment' }
      };

      // First committed transaction records the event.
      await adminDb.runTransaction(async (t) => {
        await OutboxService.recordEventInTransaction(t, mockPayload);
      });

      // A replayed command that reaches this method again with the same deterministic
      // id aborts (ALREADY_EXISTS) rather than silently no-oping — insert-only, so the
      // event can never be overwritten or reset. (Real Firestore auto-retries re-run the
      // callback before any commit, so they never collide.)
      await expect(
        adminDb.runTransaction(async (t) => {
          await OutboxService.recordEventInTransaction(t, mockPayload);
        })
      ).rejects.toThrow(/already exists/i);

      // Exactly one untouched outbox document exists with the deterministic ID.
      const eventDoc = await adminDb.collection('outbox_events').doc(eventId).get();
      expect(eventDoc.exists).toBe(true);
      expect(eventDoc.data()?.id).toBe(eventId);
      expect(eventDoc.data()?.status).toBe('pending');
      expect(eventDoc.data()?.attempts).toBe(0);
    });

    it('never resurrects or overwrites an already processed outbox event on command replay', async () => {
      const eventId = generateDeterministicEventId('booking', 'bk_resurrect_test', 'confirmed');
      const mockPayload = {
        id: eventId,
        name: 'BookingConfirmed',
        aggregateType: 'booking' as const,
        aggregateId: 'bk_resurrect_test',
        payload: { bookingId: 'bk_resurrect_test', targetStatus: 'confirmed' }
      };

      // 1. Initial record and successful processing
      await OutboxService.recordEvent(mockPayload);
      vi.spyOn(EventBus, 'publish').mockResolvedValueOnce({ success: true, errors: [] });
      await OutboxProcessor.processEvent(eventId);

      const processedDoc = await adminDb.collection('outbox_events').doc(eventId).get();
      expect(processedDoc.data()?.status).toBe('processed');

      // 2. Command replay tries to record the same event again in a transaction.
      //    Insert-only semantics abort the transaction instead of touching the doc.
      await expect(
        adminDb.runTransaction(async (t) => {
          await OutboxService.recordEventInTransaction(t, mockPayload);
        })
      ).rejects.toThrow(/already exists/i);

      // 3. Confirm status is still strictly 'processed', never reset to 'pending'
      const docAfterReplay = await adminDb.collection('outbox_events').doc(eventId).get();
      expect(docAfterReplay.data()?.status).toBe('processed');
    });
  });

  describe('OutboxProcessor.processEvent', () => {
    it('claims pending event, dispatches to EventBus, and marks as processed', async () => {
      const eventId = generateDeterministicEventId('booking', 'bk_process_1', 'confirmed');
      const eventData = {
        id: eventId,
        name: 'BookingConfirmed',
        aggregateType: 'booking' as const,
        aggregateId: 'bk_process_1',
        payload: { bookingId: 'bk_process_1', targetStatus: 'confirmed' }
      };

      await OutboxService.recordEvent(eventData);

      const publishSpy = vi.spyOn(EventBus, 'publish').mockResolvedValueOnce({ success: true, errors: [] });

      const result = await OutboxProcessor.processEvent(eventId);

      expect(result.status).toBe('processed');
      expect(publishSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        name: 'BookingConfirmed',
        payload: expect.objectContaining({ bookingId: 'bk_process_1' })
      }), expect.anything());

      // Verify updated status in DB
      const updatedDoc = await adminDb.collection('outbox_events').doc(eventId).get();
      expect(updatedDoc.data()?.status).toBe('processed');
      expect(updatedDoc.data()?.processedAt).toBeDefined();
    });

    it('skips duplicate processing if event is already processed', async () => {
      const eventId = generateDeterministicEventId('booking', 'bk_dup_1', 'confirmed');
      await OutboxService.recordEvent({
        id: eventId,
        name: 'BookingConfirmed',
        aggregateType: 'booking' as const,
        aggregateId: 'bk_dup_1',
        payload: { bookingId: 'bk_dup_1' }
      });

      const publishSpy = vi.spyOn(EventBus, 'publish').mockResolvedValueOnce({ success: true, errors: [] });

      // First run
      const result1 = await OutboxProcessor.processEvent(eventId);
      expect(result1.status).toBe('processed');

      // Second run (duplicate attempt)
      const result2 = await OutboxProcessor.processEvent(eventId);
      expect(result2.status).toBe('already_processed');
      expect(publishSpy).toHaveBeenCalledTimes(1); // Not called again
    });

    it('handles listener failures by incrementing attempt count and resetting to pending for retry', async () => {
      const eventId = generateDeterministicEventId('booking', 'bk_fail_1', 'confirmed');
      await OutboxService.recordEvent({
        id: eventId,
        name: 'BookingConfirmed',
        aggregateType: 'booking' as const,
        aggregateId: 'bk_fail_1',
        payload: { bookingId: 'bk_fail_1' },
        maxAttempts: 3
      });

      vi.spyOn(EventBus, 'publish').mockRejectedValueOnce(new Error('Network error sending webhook'));

      const result = await OutboxProcessor.processEvent(eventId);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Network error sending webhook');

      const doc = await adminDb.collection('outbox_events').doc(eventId).get();
      expect(doc.data()?.status).toBe('pending');
      expect(doc.data()?.attempts).toBe(1);
      expect(doc.data()?.lastError).toContain('Network error sending webhook');
      expect(doc.data()?.nextAttemptAt).toBeDefined();
    });

    it('marks event as dead when max attempts are exceeded', async () => {
      const eventId = generateDeterministicEventId('booking', 'bk_fail_max', 'confirmed');
      await OutboxService.recordEvent({
        id: eventId,
        name: 'BookingConfirmed',
        aggregateType: 'booking' as const,
        aggregateId: 'bk_fail_max',
        payload: { bookingId: 'bk_fail_max' },
        maxAttempts: 1
      });

      vi.spyOn(EventBus, 'publish').mockRejectedValueOnce(new Error('Persistent downstream failure'));

      const result = await OutboxProcessor.processEvent(eventId);
      expect(result.status).toBe('dead');

      const doc = await adminDb.collection('outbox_events').doc(eventId).get();
      expect(doc.data()?.status).toBe('dead');
      expect(doc.data()?.attempts).toBe(1);
      expect(doc.data()?.lastError).toContain('Persistent downstream failure');
    });

    it('observes listener failure when EventBus listener throws an exception', async () => {
      EventBus.clear();
      const failingListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener internal unhandled exception');
      });
      EventBus.subscribe('BookingFailedListenerTest', failingListener);

      const eventId = generateDeterministicEventId('booking', 'bk_listener_fail', 'failed');
      await OutboxService.recordEvent({
        id: eventId,
        name: 'BookingFailedListenerTest',
        aggregateType: 'booking' as const,
        aggregateId: 'bk_listener_fail',
        payload: { bookingId: 'bk_listener_fail' },
        maxAttempts: 3
      });

      const result = await OutboxProcessor.processEvent(eventId);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Listener internal unhandled exception');

      const doc = await adminDb.collection('outbox_events').doc(eventId).get();
      expect(doc.data()?.status).toBe('pending');
      expect(doc.data()?.attempts).toBe(1);
      expect(doc.data()?.nextAttemptAt).toBeDefined();
    });

    it('skips processing an event if nextAttemptAt is in the future (not due yet)', async () => {
      const eventId = generateDeterministicEventId('booking', 'bk_future_backoff', 'confirmed');
      const futureDate = new Date(Date.now() + 60000); // 1 minute into future

      await OutboxService.recordEvent({
        id: eventId,
        name: 'BookingConfirmed',
        aggregateType: 'booking' as const,
        aggregateId: 'bk_future_backoff',
        payload: { bookingId: 'bk_future_backoff' },
        nextAttemptAt: futureDate
      });

      // Manually set attempts to 1 to simulate a previously failed attempt scheduled in future
      const docRef = adminDb.collection('outbox_events').doc(eventId);
      await docRef.update({ attempts: 1, nextAttemptAt: futureDate });

      const publishSpy = vi.spyOn(EventBus, 'publish');
      const result = await OutboxProcessor.processEvent(eventId);

      expect(result.status).toBe('not_due');
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  describe('Exponential Backoff Calculations', () => {
    it('calculates bounded exponential backoff correctly', async () => {
      const { calculateBackoffDelay } = await import('./OutboxEvent');
      expect(calculateBackoffDelay(1, 10000, 3600000)).toBe(10000); // 10s
      expect(calculateBackoffDelay(2, 10000, 3600000)).toBe(20000); // 20s
      expect(calculateBackoffDelay(3, 10000, 3600000)).toBe(40000); // 40s
      expect(calculateBackoffDelay(4, 10000, 3600000)).toBe(80000); // 80s
      expect(calculateBackoffDelay(10, 10000, 60000)).toBe(60000); // capped at maxDelayMs
    });
  });

  describe('OutboxProcessor.processBatch', () => {
    it('processes batch of pending events and skips not due ones', async () => {
      const id1 = generateDeterministicEventId('booking', 'bk_batch_1', 'awaiting_payment');
      const id2 = generateDeterministicEventId('booking', 'bk_batch_2', 'awaiting_payment');
      const id3 = generateDeterministicEventId('booking', 'bk_batch_3_future', 'awaiting_payment');

      await OutboxService.recordEvent({
        id: id1,
        name: 'BookingAwaitingPayment',
        aggregateType: 'booking' as const,
        aggregateId: 'bk_batch_1',
        payload: { bookingId: 'bk_batch_1' }
      });

      await OutboxService.recordEvent({
        id: id2,
        name: 'BookingAwaitingPayment',
        aggregateType: 'booking' as const,
        aggregateId: 'bk_batch_2',
        payload: { bookingId: 'bk_batch_2' }
      });

      await OutboxService.recordEvent({
        id: id3,
        name: 'BookingAwaitingPayment',
        aggregateType: 'booking' as const,
        aggregateId: 'bk_batch_3_future',
        payload: { bookingId: 'bk_batch_3_future' }
      });
      // Set id3 as a future retry
      await adminDb.collection('outbox_events').doc(id3).update({
        attempts: 1,
        nextAttemptAt: new Date(Date.now() + 100000)
      });

      vi.spyOn(EventBus, 'publish').mockResolvedValue({ success: true, errors: [] });

      const batchResult = await OutboxProcessor.processBatch(10);
      expect(batchResult.processed).toBe(2);
      expect(batchResult.skipped).toBe(1);
      expect(batchResult.failed).toBe(0);
    });
  });
});
