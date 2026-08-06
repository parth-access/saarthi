/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';

export interface AppEvent<TPayload = any> {
  readonly name: string;
  readonly timestamp: Date;
  readonly payload: TPayload;
  correlationId?: string;
}

export type EventListener<T = any> = (event: AppEvent<T>) => void | Promise<void>;

export class EventBus {
  private static listeners: Record<string, EventListener[]> = {};
  private static isInitialized = false;

  static subscribe<T = any>(eventName: string, listener: EventListener<T>): void {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName].push(listener);
  }

  static async publish<T = any>(event: AppEvent<T>): Promise<void> {
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

    const eventListeners = this.listeners[event.name] || [];

    // Do not await sequentially to avoid blocking the main thread (next.js serverless functions execution path).
    // Instead use waitUntil or simple Promise.all to let it process without holding up response time.
    // If possible, Next.js requires waitUntil to keep the lambda alive if this is entirely disconnected.
    // Here we at least run them in parallel and don't strictly await unless necessary.
    Promise.allSettled(
      eventListeners.map(async (listener) => {
        try {
          await listener(enrichedEvent);
        } catch (err) {
          console.error(`[EventBus] Error in listener for event ${event.name}:`, err);
        }
      })
    );
  }

  static clear(): void {
    this.listeners = {};
    this.isInitialized = false;
  }

  private static ensureInitialized(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    
    // In standard production/dev (non-test) environments, dynamically register listeners
    const isTest = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true');
    if (!isTest) {
      try {
        /* eslint-disable-next-line @typescript-eslint/no-require-imports */
        const { registerListeners } = require('./listeners');
        registerListeners(EventBus);
      } catch (err) {
        console.error('[EventBus] Failed to initialize event listeners:', err);
      }
    }
  }
}
