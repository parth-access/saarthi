/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { TxWriter } from '@/shared/firestore/transactionPhases';
import { CreateOutboxEventInput, OutboxEvent } from './OutboxEvent';
import { pruneUndefined } from '@/shared/utils/firestoreSafe';
import { logger } from '@/shared/logger';

export class OutboxService {
  static readonly COLLECTION_NAME = 'outbox_events';

  /**
   * Atomically records a deterministic outbox event within a Firestore transaction using insert-only semantics.
   *
   * Uses a WRITE-ONLY `transaction.create` (never a read) so this stays legal when
   * invoked after the aggregate write — Firestore requires all reads in a transaction
   * to precede all writes, and every caller records the event after saving its
   * aggregate. (A prior read+set here threw "Firestore transactions require all reads
   * to be executed before all writes." and aborted booking creation.)
   *
   * `create` is inherently insert-only: if the deterministic event id already exists
   * (a genuine command replay), the commit fails with ALREADY_EXISTS and the whole
   * transaction aborts, so a processed event is never overwritten, re-asserted, or reset
   * to pending. Firestore's own transaction auto-retries never collide because they
   * re-run the callback before anything is committed. Upstream idempotency guards
   * (e.g. confirm's "already paid" early exit, create's lockId short-circuit) intercept
   * real replays before they reach this method.
   *
   * The parameter is typed {@link TxWriter} (not `Transaction`) so this method
   * structurally cannot regain a read: `transaction.get` is not even in scope.
   *
   * `payload` is the one free-form part of the document — every caller builds it
   * from optional domain fields — so it is run through {@link pruneUndefined}
   * first. This app does not enable `ignoreUndefinedProperties`, so a single
   * `undefined` in there makes the client reject the document and abort the
   * caller's entire transaction with it. That is exactly how declining a booking
   * with no custom note (`payload.customNote: undefined`, passed by
   * `/api/bookings/cancel-self`, `/api/bookings/decline` and the admin
   * update-status route) returned a 500 while the booking itself saved fine:
   * `BookingMapper.toPersistence` strips undefined for the aggregate, and nothing
   * did for the event.
   *
   * @throws Error if adminDb is uninitialized to ensure reliable durability.
   */
  static async recordEventInTransaction<T = Record<string, any>>(
    transaction: TxWriter,
    input: CreateOutboxEventInput<T>
  ): Promise<string> {
    if (!adminDb) {
      logger.error('[OutboxService] adminDb not initialized, cannot record outbox event in transaction', { eventId: input.id });
      throw new Error('[OutboxService] Database not initialized for durable transactional outbox recording');
    }

    const docRef = adminDb.collection(this.COLLECTION_NAME).doc(input.id);

    transaction.create(docRef, {
      id: input.id,
      name: input.name,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: pruneUndefined(input.payload),
      status: 'pending',
      attempts: 0,
      maxAttempts: input.maxAttempts || 5,
      nextAttemptAt: input.nextAttemptAt || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastAttemptAt: null,
      processedAt: null,
      error: null,
      lastError: null
    });

    return input.id;
  }

  /**
   * Records an outbox event outside of an active transaction using insert-only semantics.
   *
   * `payload` is pruned of `undefined` for the same reason as
   * {@link recordEventInTransaction} — the two paths must not disagree about what
   * a recordable event is.
   *
   * @throws Error if adminDb is uninitialized.
   */
  static async recordEvent<T = Record<string, any>>(
    input: CreateOutboxEventInput<T>
  ): Promise<string> {
    if (!adminDb) {
      logger.error('[OutboxService] adminDb not initialized, cannot record outbox event', { eventId: input.id });
      throw new Error('[OutboxService] Database not initialized for durable outbox recording');
    }

    const docRef = adminDb.collection(this.COLLECTION_NAME).doc(input.id);
    const existing = await docRef.get();

    if (existing.exists) {
      return input.id;
    }

    await docRef.set({
      id: input.id,
      name: input.name,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: pruneUndefined(input.payload),
      status: 'pending',
      attempts: 0,
      maxAttempts: input.maxAttempts || 5,
      nextAttemptAt: input.nextAttemptAt || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastAttemptAt: null,
      processedAt: null,
      error: null,
      lastError: null
    });

    return input.id;
  }

  /**
   * Fetches an outbox event by ID.
   */
  static async findById(id: string): Promise<OutboxEvent | null> {
    if (!adminDb) return null;
    const doc = await adminDb.collection(this.COLLECTION_NAME).doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as OutboxEvent;
  }
}
