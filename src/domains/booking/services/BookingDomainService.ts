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

    try {
      await this.bookingRepository.save(booking, transaction);

      const eventId = generateDeterministicEventId('booking', booking.id, 'awaiting_payment');
      const outboxPayload = {
        id: eventId,
        name: 'BookingAwaitingPayment',
        aggregateType: 'booking' as const,
        aggregateId: booking.id,
        payload: {
          bookingId: booking.id,
          therapistId: booking.therapistId,
          date: booking.date,
          time: booking.time,
          sessionMode: booking.sessionMode,
          previousStatus,
          targetStatus: 'awaiting_payment'
        }
      };

      if (transaction) {
        await OutboxService.recordEventInTransaction(transaction, outboxPayload);
      } else {
        await OutboxService.recordEvent(outboxPayload);
      }

      return eventId;
    } catch (err) {
      booking.status = previousStatus;
      throw err;
    }
  }

  /**
   * Initiates the payment state on a booking and registers a durable outbox event.
   */
  async initiatePayment(booking: Booking, transaction?: Transaction): Promise<string> {
    const previousStatus = booking.status;
    booking.initiatePayment({ skipEventBus: true });

    try {
      await this.bookingRepository.save(booking, transaction);

      const eventId = generateDeterministicEventId('booking', booking.id, 'payment_initiated');
      const outboxPayload = {
        id: eventId,
        name: 'BookingPaymentInitiated',
        aggregateType: 'booking' as const,
        aggregateId: booking.id,
        payload: {
          bookingId: booking.id,
          therapistId: booking.therapistId,
          date: booking.date,
          time: booking.time,
          sessionMode: booking.sessionMode,
          previousStatus,
          targetStatus: 'payment_initiated'
        }
      };

      if (transaction) {
        await OutboxService.recordEventInTransaction(transaction, outboxPayload);
      } else {
        await OutboxService.recordEvent(outboxPayload);
      }

      return eventId;
    } catch (err) {
      booking.status = previousStatus;
      throw err;
    }
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
    const previousPaymentStatus = booking.paymentStatus;
    const previousPaymentId = booking.razorpayPaymentId;
    const previousVerifiedAt = booking.paymentVerifiedAt;

    booking.confirmPayment(verifiedAt, razorpayPaymentId, { skipEventBus: true });

    try {
      await this.bookingRepository.save(booking, transaction);

      const eventId = generateDeterministicEventId('booking', booking.id, 'confirmed');
      const outboxPayload = {
        id: eventId,
        name: 'BookingConfirmed',
        aggregateType: 'booking' as const,
        aggregateId: booking.id,
        payload: {
          bookingId: booking.id,
          therapistId: booking.therapistId,
          date: booking.date,
          time: booking.time,
          sessionMode: booking.sessionMode,
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
        await OutboxService.recordEventInTransaction(transaction, outboxPayload);
      } else {
        await OutboxService.recordEvent(outboxPayload);
      }

      return eventId;
    } catch (err) {
      booking.status = previousStatus;
      booking.paymentStatus = previousPaymentStatus;
      booking.razorpayPaymentId = previousPaymentId;
      booking.paymentVerifiedAt = previousVerifiedAt;
      throw err;
    }
  }

  /**
   * Completes a booking, saves it, and registers a durable outbox event.
   */
  async completeBooking(booking: Booking, transaction?: Transaction): Promise<string> {
    const previousStatus = booking.status;
    booking.complete({ skipEventBus: true });

    try {
      await this.bookingRepository.save(booking, transaction);

      const eventId = generateDeterministicEventId('booking', booking.id, 'completed');
      const outboxPayload = {
        id: eventId,
        name: 'BookingCompleted',
        aggregateType: 'booking' as const,
        aggregateId: booking.id,
        payload: {
          bookingId: booking.id,
          therapistId: booking.therapistId,
          date: booking.date,
          time: booking.time,
          previousStatus,
          targetStatus: 'completed'
        }
      };

      if (transaction) {
        await OutboxService.recordEventInTransaction(transaction, outboxPayload);
      } else {
        await OutboxService.recordEvent(outboxPayload);
      }

      return eventId;
    } catch (err) {
      booking.status = previousStatus;
      throw err;
    }
  }

  /**
   * Marks a booking as no_show, saves it, and registers a durable outbox event.
   */
  async markNoShow(booking: Booking, reason?: string, transaction?: Transaction): Promise<string> {
    const previousStatus = booking.status;
    const previousNoShowReason = booking.noShowReason;
    const previousDeclineReason = booking.declineReason;

    booking.markNoShow(reason, { skipEventBus: true });

    try {
      await this.bookingRepository.save(booking, transaction);

      const eventId = generateDeterministicEventId('booking', booking.id, 'no_show');
      const outboxPayload = {
        id: eventId,
        name: 'BookingNoShow',
        aggregateType: 'booking' as const,
        aggregateId: booking.id,
        payload: {
          bookingId: booking.id,
          therapistId: booking.therapistId,
          previousStatus,
          targetStatus: 'no_show',
          reason
        }
      };

      if (transaction) {
        await OutboxService.recordEventInTransaction(transaction, outboxPayload);
      } else {
        await OutboxService.recordEvent(outboxPayload);
      }

      return eventId;
    } catch (err) {
      booking.status = previousStatus;
      booking.noShowReason = previousNoShowReason;
      booking.declineReason = previousDeclineReason;
      throw err;
    }
  }

  /**
   * Cancels a booking with an optional reason, saves it, and registers a durable outbox event.
   */
  async cancelBooking(booking: Booking, reason?: string, transaction?: Transaction): Promise<string> {
    const previousStatus = booking.status;
    const previousDeclineReason = booking.declineReason;

    booking.cancel(reason, { skipEventBus: true });

    try {
      await this.bookingRepository.save(booking, transaction);

      const eventId = generateDeterministicEventId('booking', booking.id, 'cancelled');
      const outboxPayload = {
        id: eventId,
        name: 'BookingCancelled',
        aggregateType: 'booking' as const,
        aggregateId: booking.id,
        payload: {
          bookingId: booking.id,
          therapistId: booking.therapistId,
          previousStatus,
          targetStatus: 'cancelled',
          reason
        }
      };

      if (transaction) {
        await OutboxService.recordEventInTransaction(transaction, outboxPayload);
      } else {
        await OutboxService.recordEvent(outboxPayload);
      }

      return eventId;
    } catch (err) {
      booking.status = previousStatus;
      booking.declineReason = previousDeclineReason;
      throw err;
    }
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
    const previousDeclineReason = booking.declineReason;
    const previousDeclineCustomNote = booking.declineCustomNote;
    const previousDeclinedBy = booking.declinedBy;
    const previousDeclinedAt = booking.declinedAt;

    booking.decline(reason, declinedBy, customNote, timestamp, { skipEventBus: true });

    try {
      await this.bookingRepository.save(booking, transaction);

      const eventId = generateDeterministicEventId('booking', booking.id, 'rejected');
      const outboxPayload = {
        id: eventId,
        name: 'BookingRejected',
        aggregateType: 'booking' as const,
        aggregateId: booking.id,
        payload: {
          bookingId: booking.id,
          therapistId: booking.therapistId,
          previousStatus,
          targetStatus: 'rejected',
          reason,
          declinedBy,
          customNote,
          timestamp
        }
      };

      if (transaction) {
        await OutboxService.recordEventInTransaction(transaction, outboxPayload);
      } else {
        await OutboxService.recordEvent(outboxPayload);
      }

      return eventId;
    } catch (err) {
      booking.status = previousStatus;
      booking.declineReason = previousDeclineReason;
      booking.declineCustomNote = previousDeclineCustomNote;
      booking.declinedBy = previousDeclinedBy;
      booking.declinedAt = previousDeclinedAt;
      throw err;
    }
  }

  /**
   * Marks a booking as expired and saves it.
   */
  async expireBooking(booking: Booking, transaction?: Transaction): Promise<string> {
    const previousStatus = booking.status;
    booking.expire({ skipEventBus: true });

    try {
      await this.bookingRepository.save(booking, transaction);

      const eventId = generateDeterministicEventId('booking', booking.id, 'expired');
      const outboxPayload = {
        id: eventId,
        name: 'BookingExpired',
        aggregateType: 'booking' as const,
        aggregateId: booking.id,
        payload: {
          bookingId: booking.id,
          therapistId: booking.therapistId,
          previousStatus,
          targetStatus: 'expired'
        }
      };

      if (transaction) {
        await OutboxService.recordEventInTransaction(transaction, outboxPayload);
      } else {
        await OutboxService.recordEvent(outboxPayload);
      }

      return eventId;
    } catch (err) {
      booking.status = previousStatus;
      throw err;
    }
  }

  /**
   * Reschedules a booking to a new date/time and saves it.
   * Note: The deterministic eventId includes `${newDate}_${newTime}` so rescheduling
   * to the same target slot is idempotent while distinct reschedule operations are unique.
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
    const previousOriginalDate = booking.originalDate;
    const previousOriginalTime = booking.originalTime;
    const previousUtcDateTime = booking.utcDateTime;
    const previousRescheduledAt = booking.rescheduledAt;

    booking.reschedule(newDate, newTime, rescheduledAt, newUtcDateTime);

    try {
      await this.bookingRepository.save(booking, transaction);

      const eventId = generateDeterministicEventId('booking', booking.id, 'rescheduled', `${newDate}_${newTime}`);
      const outboxPayload = {
        id: eventId,
        name: 'BookingRescheduled',
        aggregateType: 'booking' as const,
        aggregateId: booking.id,
        payload: {
          bookingId: booking.id,
          therapistId: booking.therapistId,
          previousDate,
          previousTime,
          date: newDate,
          time: newTime,
          rescheduledAt,
          newUtcDateTime
        }
      };

      if (transaction) {
        await OutboxService.recordEventInTransaction(transaction, outboxPayload);
      } else {
        await OutboxService.recordEvent(outboxPayload);
      }

      return eventId;
    } catch (err) {
      booking.date = previousDate;
      booking.time = previousTime;
      booking.originalDate = previousOriginalDate;
      booking.originalTime = previousOriginalTime;
      booking.utcDateTime = previousUtcDateTime;
      booking.rescheduledAt = previousRescheduledAt;
      throw err;
    }
  }
}


