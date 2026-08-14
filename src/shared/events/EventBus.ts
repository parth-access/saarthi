/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';
import { registerListeners } from './listeners';

export interface AppEvent<TPayload = any> {
  readonly name: string;
  readonly timestamp: Date;
  readonly payload: TPayload;
  correlationId?: string;
}

export type EventListener<T = any> = (event: AppEvent<T>) => void | Promise<void>;

export interface PublishOptions {
  throwOnError?: boolean;
}

export interface PublishResult {
  success: boolean;
  errors: Error[];
}

export class EventBus {
  private static listeners: Record<string, EventListener[]> = {};
  private static isInitialized = false;

  static subscribe<T = any>(eventName: string, listener: EventListener<T>): void {
    if (typeof listener !== 'function') {
      throw new TypeError(`EventBus.subscribe requires a valid listener function for event "${eventName}", received ${typeof listener}`);
    }
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName].push(listener);
  }

  static async publish<T = any>(event: AppEvent<T>, options?: PublishOptions): Promise<PublishResult> {
    // Ensure listeners are registered before any publishing happens
    this.ensureInitialized();

    const correlationId = event.correlationId || 
                          (event.payload as any)?.correlationId || 
                          (event.payload as any)?.booking?.correlationId || 
                          `corr_${crypto.randomUUID()}`;

    const enrichedEvent: AppEvent<T> = {
      ...event,
      correlationId
    };

    const errors: Error[] = [];
    const eventListeners = this.listeners[event.name] || [];
    for (const listener of eventListeners) {
      try {
        await listener(enrichedEvent);
      } catch (err: any) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        errors.push(errorObj);
        console.error(`[EventBus] Error in listener for event ${event.name}:`, err);
      }
    }

    if (errors.length > 0 && options?.throwOnError) {
      const combinedMessage = errors.map(e => e.message).join('; ');
      const aggError = new Error(`[EventBus] ${errors.length} listener(s) failed for event "${event.name}": ${combinedMessage}`);
      (aggError as any).errors = errors;
      throw aggError;
    }

    return {
      success: errors.length === 0,
      errors
    };
  }

  static clear(): void {
    this.listeners = {};
    this.isInitialized = false;
  }

  private static ensureInitialized(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    
    // In standard production/dev (non-test) environments, statically register listeners once
    const isTest = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true');
    if (!isTest) {
      try {
        registerListeners(EventBus);
      } catch (err) {
        console.error('[EventBus] Failed to initialize event listeners:', err);
      }
    }
  }
}

