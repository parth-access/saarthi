import { Booking } from '../entities/Booking';
import { BookingStatus } from '@/types';

export interface BookingDomainEvent {
  name: string;
  timestamp: Date;
  data: {
    bookingId: string;
    booking: Booking;
    previousStatus: BookingStatus;
    targetStatus: BookingStatus;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export type BookingDomainEventListener = (event: BookingDomainEvent) => void | Promise<void>;

export class BookingEvents {
  private static listeners: Record<string, BookingDomainEventListener[]> = {};

  static subscribe(eventName: string, listener: BookingDomainEventListener): void {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName].push(listener);
  }

  static async dispatch(event: BookingDomainEvent): Promise<void> {
    const eventListeners = this.listeners[event.name] || [];
    for (const listener of eventListeners) {
      try {
        await listener(event);
      } catch (err) {
        console.error(`Error in domain event listener for ${event.name}:`, err);
      }
    }
  }

  static clear(): void {
    this.listeners = {};
  }
}

// For backwards compatibility
export const DomainEvents = BookingEvents;
export type DomainEvent = BookingDomainEvent;
export type DomainEventListener = BookingDomainEventListener;
