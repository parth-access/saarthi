import { BookingStatus } from '@/types';
import { Booking } from '../entities/Booking';
import { InvalidBookingTransitionError } from '../errors/InvalidBookingTransitionError';
import { DomainEvents } from '../events/BookingEvents';
import { EventBus } from '@/shared/events/EventBus';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['slot_locked', 'awaiting_payment', 'pending_payment', 'cancelled', 'rejected'],
  pending: ['slot_locked', 'awaiting_payment', 'pending_payment', 'cancelled', 'rejected', 'pending_approval'],
  slot_locked: ['awaiting_payment', 'pending_payment', 'cancelled', 'rejected', 'expired'],
  awaiting_payment: ['payment_initiated', 'pending_payment', 'confirmed', 'cancelled', 'rejected', 'expired'],
  pending_payment: ['payment_initiated', 'awaiting_payment', 'confirmed', 'cancelled', 'rejected', 'expired'],
  pending_approval: ['awaiting_payment', 'pending_payment', 'confirmed', 'cancelled', 'rejected'],
  payment_initiated: ['confirmed', 'awaiting_payment', 'pending_payment', 'cancelled', 'rejected', 'expired'],
  confirmed: ['completed', 'cancelled', 'rejected', 'rescheduled', 'no_show'],
  rescheduled: ['confirmed', 'cancelled', 'rejected', 'completed', 'no_show'],
  completed: [],
  cancelled: ['awaiting_payment', 'pending_payment'], // Allows customer payment retries to regenerate payment link
  rejected: [],
  expired: ['slot_locked', 'awaiting_payment'],
  no_show: [],
};

export interface TransitionOptions {
  metadata?: Record<string, unknown>;
  skipEventBus?: boolean;
}

export class BookingStateMachine {
  static normalizeStatus(status: string): string {
    if (!status) return 'draft';
    const norm = status.toLowerCase().trim().replace(/\s+/g, '_');
    if (norm === 'locked') return 'slot_locked';
    if (norm === 'payment_started') return 'payment_initiated';
    return norm;
  }

  static canTransition(from: string, to: string): boolean {
    const normFrom = this.normalizeStatus(from);
    const normTo = this.normalizeStatus(to);

    const allowed = VALID_TRANSITIONS[normFrom] || [];
    return allowed.includes(normTo);
  }

  static transition(
    booking: Booking,
    targetState: BookingStatus,
    metadataOrOptions?: Record<string, unknown> | TransitionOptions
  ): void {
    if (!this.canTransition(booking.status, targetState)) {
      throw new InvalidBookingTransitionError(
        `Cannot transition booking ${booking.id} from status '${booking.status}' to '${targetState}'`
      );
    }

    const previousStatus = booking.status;
    booking.status = targetState;

    const normTo = this.normalizeStatus(targetState);
    const camelTo = normTo.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
    const eventName = `Booking${camelTo.charAt(0).toUpperCase() + camelTo.slice(1)}`;

    let metadata: Record<string, unknown> | undefined;
    let skipEventBus = false;

    if (metadataOrOptions) {
      if (typeof metadataOrOptions === 'object' && ('skipEventBus' in metadataOrOptions || 'metadata' in metadataOrOptions)) {
        const opts = metadataOrOptions as TransitionOptions;
        skipEventBus = Boolean(opts.skipEventBus);
        metadata = opts.metadata;
      } else {
        metadata = metadataOrOptions as Record<string, unknown>;
      }
    }

    if (!skipEventBus) {
      // Safe non-PII payload to prevent exposing sensitive client mental-health disclosures to general listeners
      const sanitizedBookingSummary = {
        id: booking.id,
        therapistId: booking.therapistId,
        userId: booking.userId,
        date: booking.date,
        time: booking.time,
        sessionMode: booking.sessionMode,
        sessionType: booking.sessionType,
        status: targetState,
        paymentStatus: booking.paymentStatus,
        paymentAmount: booking.paymentAmount,
        paymentCurrency: booking.paymentCurrency,
        razorpayOrderId: booking.razorpayOrderId,
        razorpayPaymentId: booking.razorpayPaymentId
      };

      const eventPayload = {
        bookingId: booking.id,
        booking: sanitizedBookingSummary,
        previousStatus,
        targetStatus: targetState,
        metadata,
      };

      // Safely dispatch domain events without allowing listener exceptions to corrupt caller workflow
      try {
        DomainEvents.dispatch({
          name: eventName,
          timestamp: new Date(),
          data: {
            ...eventPayload,
            booking: booking as any, // Retain full instance reference for internal domain handlers
          },
        }).catch((err) => {
          console.error(`[BookingStateMachine] Async error in DomainEvents for ${eventName}:`, err);
        });
      } catch (err) {
        console.error(`[BookingStateMachine] Synchronous error in DomainEvents dispatch for ${eventName}:`, err);
      }

      try {
        EventBus.publish({
          name: eventName,
          timestamp: new Date(),
          payload: eventPayload
        }).catch((err) => {
          console.error(`[BookingStateMachine] Async error in central EventBus for ${eventName}:`, err);
        });
      } catch (err) {
        console.error(`[BookingStateMachine] Failed to publish event to central EventBus:`, err);
      }
    }
  }
}

