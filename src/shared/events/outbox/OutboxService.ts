/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { CreateOutboxEventInput, OutboxEvent } from './OutboxEvent';
import { logger } from '@/shared/logger';

export class OutboxService {
  static readonly COLLECTION_NAME = 'outbox_events';

  /**
   * Atomically records a deterministic outbox event within a Firestore transaction.
   * If the transaction retries, it repeatedly targets the same deterministic document ID,
   * completely preventing duplicate event emission.
   */
  static recordEventInTransaction<T = Record<string, any>>(
    transaction: Transaction,
    input: CreateOutboxEventInput<T>
  ): string {
    if (!adminDb) {
      logger.warn('[OutboxService] adminDb not initialized, skipping outbox recording in transaction');
      return input.id;
    }

    const docRef = adminDb.collection(this.COLLECTION_NAME).doc(input.id);
    
    // Use merge: true so retry calls safely re-assert the event definition without throwing
    transaction.set(
      docRef,
      {
        id: input.id,
        name: input.name,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload,
        status: 'pending',
        attempts: 0,
        maxAttempts: input.maxAttempts || 5,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        error: null
      },
      { merge: true }
    );

    return input.id;
  }

  /**
   * Records an outbox event outside of an active transaction.
   */
  static async recordEvent<T = Record<string, any>>(
    input: CreateOutboxEventInput<T>
  ): Promise<string> {
    if (!adminDb) {
      logger.warn('[OutboxService] adminDb not initialized, skipping outbox recording');
      return input.id;
    }

    const docRef = adminDb.collection(this.COLLECTION_NAME).doc(input.id);
    await docRef.set(
      {
        id: input.id,
        name: input.name,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload,
        status: 'pending',
        attempts: 0,
        maxAttempts: input.maxAttempts || 5,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        error: null
      },
      { merge: true }
    );

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
