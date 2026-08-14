/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { EventBus } from '../EventBus';
import { OutboxEvent, calculateBackoffDelay } from './OutboxEvent';
import { logger } from '@/shared/logger';

const LOCK_TIMEOUT_MS = 60000; // 60 seconds

export interface ProcessEventResult {
  success: boolean;
  status: 'processed' | 'already_processed' | 'failed' | 'in_progress' | 'not_found' | 'max_attempts_exceeded' | 'not_due';
  error?: string;
}

type ClaimResult =
  | { shouldProcess: false; reason: 'not_found' | 'already_processed' | 'not_due' | 'in_progress' | 'max_attempts_exceeded' }
  | { shouldProcess: true; event: OutboxEvent; reason: 'claimed' };

export class OutboxProcessor {
  static readonly COLLECTION_NAME = 'outbox_events';

  /**
   * Processes a single outbox event idempotently.
   * Employs an atomic claim transaction before invoking any listener side effects.
   */
  static async processEvent(eventId: string): Promise<ProcessEventResult> {
    if (!adminDb) {
      logger.warn('[OutboxProcessor] adminDb not initialized, skipping outbox processing', { eventId });
      return { success: false, status: 'failed', error: 'adminDb not initialized' };
    }

    const docRef = adminDb.collection(this.COLLECTION_NAME).doc(eventId);
    let eventToProcess: OutboxEvent;
    let attemptCount = 1;
    let maxAttempts = 5;

    // STEP 1: Atomic Claim Transaction
    try {
      const claimResult: ClaimResult = await adminDb.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (!doc.exists) {
          return { shouldProcess: false, reason: 'not_found' };
        }

        const data = doc.data() as OutboxEvent;
        if (data.status === 'processed') {
          return { shouldProcess: false, reason: 'already_processed' };
        }

        maxAttempts = data.maxAttempts || 5;
        const currentAttempts = data.attempts || 0;
        const now = Date.now();

        // Check if retry attempt is due according to exponential backoff
        const nextAttemptMillis = this.getMillis(data.nextAttemptAt);
        if (currentAttempts > 0 && nextAttemptMillis > now + 500) {
          return { shouldProcess: false, reason: 'not_due' };
        }

        if (data.status === 'processing') {
          const lastAttemptMillis = this.getMillis(data.lastAttemptAt);
          const isStale = !lastAttemptMillis || (now - lastAttemptMillis > LOCK_TIMEOUT_MS);
          if (!isStale) {
            return { shouldProcess: false, reason: 'in_progress' };
          }
        }

        if (currentAttempts >= maxAttempts) {
          return { shouldProcess: false, reason: 'max_attempts_exceeded' };
        }

        attemptCount = currentAttempts + 1;
        t.update(docRef, {
          status: 'processing',
          attempts: attemptCount,
          lastAttemptAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });

        return { shouldProcess: true, event: data, reason: 'claimed' };
      });

      if (!claimResult.shouldProcess) {
        return {
          success: claimResult.reason === 'already_processed',
          status: claimResult.reason
        };
      }

      eventToProcess = claimResult.event;
    } catch (err) {
      logger.error('[OutboxProcessor] Error claiming outbox event', { eventId, error: err });
      return {
        success: false,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err)
      };
    }

    // STEP 2: Dispatch to EventBus (strictly outside the claim transaction)
    try {
      const publishResult = await EventBus.publish({
        name: eventToProcess.name,
        timestamp: new Date(),
        payload: eventToProcess.payload,
        correlationId: eventToProcess.id
      }, { throwOnError: true });

      if (publishResult && !publishResult.success && publishResult.errors && publishResult.errors.length > 0) {
        throw new Error(publishResult.errors.map(e => e.message || String(e)).join('; '));
      }

      // STEP 3: Mark Processed
      await docRef.update({
        status: 'processed',
        processedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        nextAttemptAt: null,
        error: null
      });

      logger.info(`[OutboxProcessor] Successfully processed outbox event ${eventId} (${eventToProcess.name})`);
      return { success: true, status: 'processed' };
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      logger.error(`[OutboxProcessor] Failed to execute listeners for outbox event ${eventId}`, { error: err });
      
      const isMaxExceeded = attemptCount >= maxAttempts;
      const nextStatus = isMaxExceeded ? 'failed' : 'pending';
      const backoffDelayMs = calculateBackoffDelay(attemptCount);
      const nextAttemptDate = new Date(Date.now() + backoffDelayMs);

      try {
        await docRef.update({
          status: nextStatus,
          attempts: attemptCount,
          nextAttemptAt: isMaxExceeded ? null : nextAttemptDate,
          error: errMsg,
          lastError: errMsg,
          updatedAt: FieldValue.serverTimestamp()
        });
      } catch (updateErr) {
        logger.error('[OutboxProcessor] Failed to update outbox event error status', { eventId, updateErr });
      }
      return { success: false, status: 'failed', error: errMsg };
    }
  }

  /**
   * Processes a batch of pending or retryable outbox events.
   */
  static async processPendingEvents(limit: number = 10): Promise<{ processed: number; failed: number; skipped: number }> {
    if (!adminDb) return { processed: 0, failed: 0, skipped: 0 };

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    try {
      const snapshot = await adminDb.collection(this.COLLECTION_NAME)
        .where('status', 'in', ['pending', 'failed'])
        .limit(limit)
        .get();

      const now = Date.now();
      for (const doc of snapshot.docs) {
        const data = doc.data() as OutboxEvent;
        if (data.attempts >= (data.maxAttempts || 5)) {
          skipped++;
          continue;
        }

        // Check if nextAttemptAt is scheduled in the future
        const nextAttemptMillis = this.getMillis(data.nextAttemptAt);
        if (data.attempts > 0 && nextAttemptMillis > now) {
          skipped++;
          continue;
        }

        const res = await this.processEvent(doc.id);
        if (res.success || res.status === 'processed' || res.status === 'already_processed') {
          processed++;
        } else if (res.status === 'not_due' || res.status === 'in_progress') {
          skipped++;
        } else {
          failed++;
        }
      }
    } catch (err) {
      logger.error('[OutboxProcessor] Error processing pending outbox batch', { error: err });
    }

    return { processed, failed, skipped };
  }

  /**
   * Alias for processPendingEvents for cron job endpoints.
   */
  static async processBatch(limit: number = 25): Promise<{ processed: number; failed: number; skipped: number }> {
    return this.processPendingEvents(limit);
  }

  private static getMillis(val: any): number {
    if (!val) return 0;
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (val.seconds) return val.seconds * 1000;
    if (typeof val.toMillis === 'function') return val.toMillis();
    const t = new Date(val);
    return isNaN(t.getTime()) ? 0 : t.getTime();
  }
}

