/* eslint-disable @typescript-eslint/no-explicit-any */
import { FirebaseTimestamp } from '@/types';

export type OutboxStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'dead';

export interface OutboxEvent<TPayload = Record<string, any>> {
  id: string;
  name: string;
  aggregateType: 'booking' | 'payment';
  aggregateId: string;
  payload: TPayload;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: FirebaseTimestamp | Date | string | any;
  updatedAt: FirebaseTimestamp | Date | string | any;
  lastAttemptAt?: FirebaseTimestamp | Date | string | any | null;
  nextAttemptAt?: FirebaseTimestamp | Date | string | any | null;
  processedAt?: FirebaseTimestamp | Date | string | any | null;
  error?: string | null;
  lastError?: string | null;
}

export interface CreateOutboxEventInput<TPayload = Record<string, any>> {
  id: string;
  name: string;
  aggregateType: 'booking' | 'payment';
  aggregateId: string;
  payload: TPayload;
  maxAttempts?: number;
  nextAttemptAt?: FirebaseTimestamp | Date | string | any | null;
}

/**
 * Calculates bounded exponential backoff delay in milliseconds.
 * Default base: 10 seconds, Max: 1 hour (3,600,000 ms).
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number = 10000,
  maxDelayMs: number = 3600000
): number {
  const exponent = Math.max(0, attempt - 1);
  const delay = baseDelayMs * Math.pow(2, exponent);
  return Math.min(delay, maxDelayMs);
}

/**
 * Generates a deterministic outbox event ID to guarantee idempotency across transaction retries.
 */
export function generateDeterministicEventId(
  aggregateType: 'booking' | 'payment',
  aggregateId: string,
  eventNameOrQualifier: string,
  extraQualifier?: string
): string {
  const cleanQualifier = extraQualifier ? `_${extraQualifier.replace(/[\/\s:]+/g, '-')}` : '';
  return `outbox_${aggregateType}_${aggregateId}_${eventNameOrQualifier}${cleanQualifier}`;
}
