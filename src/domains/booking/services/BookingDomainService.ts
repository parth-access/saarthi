import { Booking } from '../entities/Booking';
import { BookingRepository } from '../repository/BookingRepository';
import { Transaction } from 'firebase-admin/firestore';
import { OutboxService, generateDeterministicEventId } from '@/shared/events/outbox';

export class BookingDomainService {
  constructor(private readonly bookingRepository: BookingRepository) {}

  /**
   * Registers a new booking in the system, setting its initial state and saving it.
   */
  async createBooking(booking: Booking, transaction?: Transaction): Promise<void> {
    await this.bookingRepository.create(booking, transaction);
  }

  /**
   * Moves booking status to awaiting_payment and registers a durable outbox event.
   */
  async awaitPayment(booking: Booking, transaction?: Transaction): Promise<string> {
    const previousStatus = booking.status;
    booking.awaitPayment({ skipEventBus: true });
    await this.bookingRepository.save(booking, transaction);

    const eventId = generateDeterministicEventId('booking', booking.id, 'awaiting_payment');
    const outboxPayload = {
      id: eventId,
      name: 'BookingAwaitingPayment',
      aggregateType: 'booking' as const,
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        booking: { ...booking },
        previousStatus,
        targetStatus: 'awaiting_payment'
      }
    };

    if (transaction) {
      OutboxService.recordEventInTransaction(transaction, outboxPayload);
    } else {
      await OutboxService.recordEvent(outboxPayload);
    }

    return eventId;
  }

  /**
   * Initiates the payment state on a booking and registers a durable outbox event.
   */
  async initiatePayment(booking: Booking, transaction?: Transaction): Promise<string> {
    const previousStatus = booking.status;
    booking.initiatePayment({ skipEventBus: true });
    await this.bookingRepository.save(booking, transaction);

    const eventId = generateDeterministicEventId('booking', booking.id, 'payment_initiated');
    const outboxPayload = {
      id: eventId,
      name: 'BookingPaymentInitiated',
      aggregateType: 'booking' as const,
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        booking: { ...booking },
        previousStatus,
        targetStatus: 'payment_initiated'
      }
    };

    if (transaction) {
      OutboxService.recordEventInTransaction(transaction, outboxPayload);
    } else {
      await OutboxService.recordEvent(outboxPayload);
    }

    return eventId;
  }

  /**
   * Confirms payment for a booking, saves it, and registers a durable outbox event.
   */
  async confirmPayment(
    booking: Booking,
    verifiedAt: Date | string | unknown,
    razorpayPaymentId?: string,
    transaction?: Transaction,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const previousStatus = booking.status;
    booking.confirmPayment(verifiedAt, razorpayPaymentId, { skipEventBus: true });
    await this.bookingRepository.save(booking, transaction);

    const eventId = generateDeterministicEventId('booking', booking.id, 'confirmed');
    const outboxPayload = {
      id: eventId,
      name: 'BookingConfirmed',
      aggregateType: 'booking' as const,
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        booking: { ...booking },
        previousStatus,
        targetStatus: 'confirmed',
        metadata: {
          ...metadata,
          verifiedAt,
          razorpayPaymentId
        }
      }
    };

    if (transaction) {
      OutboxService.recordEventInTransaction(transaction, outboxPayload);
    } else {
      await OutboxService.recordEvent(outboxPayload);
    }

    return eventId;
  }

  /**
   * Completes a booking, saves it, and registers a durable outbox event.
   */
  async completeBooking(booking: Booking, transaction?: Transaction): Promise<string> {
    const previousStatus = booking.status;
    booking.complete({ skipEventBus: true });
    await this.bookingRepository.save(booking, transaction);

    const eventId = generateDeterministicEventId('booking', booking.id, 'completed');
    const outboxPayload = {
      id: eventId,
      name: 'BookingCompleted',
      aggregateType: 'booking' as const,
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        booking: { ...booking },
        previousStatus,
        targetStatus: 'completed'
      }
    };

    if (transaction) {
      OutboxService.recordEventInTransaction(transaction, outboxPayload);
    } else {
      await OutboxService.recordEvent(outboxPayload);
    }

    return eventId;
  }

  /**
   * Cancels a booking with an optional reason, saves it, and registers a durable outbox event.
   */
  async cancelBooking(booking: Booking, reason?: string, transaction?: Transaction): Promise<string> {
    const previousStatus = booking.status;
    booking.cancel(reason, { skipEventBus: true });
    await this.bookingRepository.save(booking, transaction);

    const eventId = generateDeterministicEventId('booking', booking.id, 'cancelled');
    const outboxPayload = {
      id: eventId,
      name: 'BookingCancelled',
      aggregateType: 'booking' as const,
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        booking: { ...booking },
        previousStatus,
        targetStatus: 'cancelled',
        reason
      }
    };

    if (transaction) {
      OutboxService.recordEventInTransaction(transaction, outboxPayload);
    } else {
      await OutboxService.recordEvent(outboxPayload);
    }

    return eventId;
  }

  /**
   * Declines a booking, saves it, and registers a durable outbox event.
   */
  async declineBooking(
    booking: Booking,
    reason: string,
    declinedBy?: string,
    customNote?: string,
    timestamp?: unknown,
    transaction?: Transaction
  ): Promise<string> {
    const previousStatus = booking.status;
    booking.decline(reason, declinedBy, customNote, timestamp, { skipEventBus: true });
    await this.bookingRepository.save(booking, transaction);

    const eventId = generateDeterministicEventId('booking', booking.id, 'rejected');
    const outboxPayload = {
      id: eventId,
      name: 'BookingRejected',
      aggregateType: 'booking' as const,
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        booking: { ...booking },
        previousStatus,
        targetStatus: 'rejected',
        reason,
        declinedBy,
        customNote,
        timestamp
      }
    };

    if (transaction) {
      OutboxService.recordEventInTransaction(transaction, outboxPayload);
    } else {
      await OutboxService.recordEvent(outboxPayload);
    }

    return eventId;
  }

  /**
   * Marks a booking as expired and saves it.
   */
  async expireBooking(booking: Booking, transaction?: Transaction): Promise<string> {
    const previousStatus = booking.status;
    booking.expire({ skipEventBus: true });
    await this.bookingRepository.save(booking, transaction);

    const eventId = generateDeterministicEventId('booking', booking.id, 'expired');
    const outboxPayload = {
      id: eventId,
      name: 'BookingExpired',
      aggregateType: 'booking' as const,
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        booking: { ...booking },
        previousStatus,
        targetStatus: 'expired'
      }
    };

    if (transaction) {
      OutboxService.recordEventInTransaction(transaction, outboxPayload);
    } else {
      await OutboxService.recordEvent(outboxPayload);
    }

    return eventId;
  }

  /**
   * Reschedules a booking to a new date/time and saves it.
   */
  async rescheduleBooking(
    booking: Booking,
    newDate: string,
    newTime: string,
    rescheduledAt?: unknown,
    newUtcDateTime?: string,
    transaction?: Transaction
  ): Promise<string> {
    const previousDate = booking.date;
    const previousTime = booking.time;
    booking.reschedule(newDate, newTime, rescheduledAt, newUtcDateTime);
    await this.bookingRepository.save(booking, transaction);

    const eventId = generateDeterministicEventId('booking', booking.id, 'rescheduled', `${newDate}_${newTime}`);
    const outboxPayload = {
      id: eventId,
      name: 'BookingRescheduled',
      aggregateType: 'booking' as const,
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        booking: { ...booking },
        previousDate,
        previousTime,
        date: newDate,
        time: newTime,
        rescheduledAt,
        newUtcDateTime
      }
    };

    if (transaction) {
      OutboxService.recordEventInTransaction(transaction, outboxPayload);
    } else {
      await OutboxService.recordEvent(outboxPayload);
    }

    return eventId;
  }
}

