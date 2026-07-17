import { BookingStatus } from '@/types';
import { Booking } from '../entities/Booking';
import { InvalidBookingTransitionError } from '../errors/InvalidBookingTransitionError';
import { DomainEvents } from '../events/BookingEvents';
import { EventBus } from '@/shared/events/EventBus';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['slot_locked', 'awaiting_payment', 'cancelled', 'rejected'],
  pending: ['slot_locked', 'awaiting_payment', 'cancelled', 'rejected', 'pending_approval'],
  slot_locked: ['awaiting_payment', 'cancelled', 'rejected', 'expired'],
  awaiting_payment: ['payment_initiated', 'confirmed', 'cancelled', 'rejected', 'expired'],
  pending_approval: ['confirmed', 'cancelled', 'rejected'],
  payment_initiated: ['confirmed', 'awaiting_payment', 'cancelled', 'rejected'],
  confirmed: ['completed', 'cancelled', 'rejected'],
  completed: [],
  cancelled: [],
  rejected: [],
  expired: [],
};

export class BookingStateMachine {
  private static normalizeStatus(status: string): string {
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

  static transition(booking: Booking, targetState: BookingStatus, metadata?: Record<string, unknown>): void {
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

    DomainEvents.dispatch({
      name: eventName,
      timestamp: new Date(),
      data: {
        bookingId: booking.id,
        booking,
        previousStatus,
        targetStatus: targetState,
        metadata,
      },
    });

    try {
      EventBus.publish({
        name: eventName,
        timestamp: new Date(),
        payload: {
          bookingId: booking.id,
          booking,
          previousStatus,
          targetStatus: targetState,
          metadata,
        }
      });
    } catch (err) {
      console.error('[BookingStateMachine] Failed to publish event to central EventBus:', err);
    }
  }
}
