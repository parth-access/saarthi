/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { CreateOutboxEventInput, OutboxEvent } from './OutboxEvent';
import { logger } from '@/shared/logger';

export class OutboxService {
  static readonly COLLECTION_NAME = 'outbox_events';

  /**
   * Atomically records a deterministic outbox event within a Firestore transaction using insert-only semantics.
   * If the event already exists (e.g. from a prior transaction attempt, client retry, or replay),
   * it leaves the existing event and its status untouched to prevent resurrection of processed events.
   *
   * @throws Error if adminDb is uninitialized to ensure reliable durability.
   */
  static async recordEventInTransaction<T = Record<string, any>>(
    transaction: Transaction,
    input: CreateOutboxEventInput<T>
  ): Promise<string> {
    if (!adminDb) {
      logger.error('[OutboxService] adminDb not initialized, cannot record outbox event in transaction', { eventId: input.id });
      throw new Error('[OutboxService] Database not initialized for durable transactional outbox recording');
    }

    const docRef = adminDb.collection(this.COLLECTION_NAME).doc(input.id);
    const existing = await transaction.get(docRef);

    // Idempotency: Never overwrite, re-assert, or reset status of an existing outbox event
    if (existing?.exists) {
      return input.id;
    }
    
    transaction.set(docRef, {
      id: input.id,
      name: input.name,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: input.payload,
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
      payload: input.payload,
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
