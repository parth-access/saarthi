import { Booking } from '../entities/Booking';
import { BookingRepository } from '../repository/BookingRepository';
import { Transaction } from 'firebase-admin/firestore';

export class BookingDomainService {
  constructor(private readonly bookingRepository: BookingRepository) {}

  /**
   * Registers a new booking in the system, setting its initial state and saving it.
   */
  async createBooking(booking: Booking, transaction?: Transaction): Promise<void> {
    await this.bookingRepository.create(booking, transaction);
  }

  /**
   * Moves booking status to awaiting_payment.
   */
  async awaitPayment(booking: Booking, transaction?: Transaction): Promise<void> {
    booking.awaitPayment();
    await this.bookingRepository.save(booking, transaction);
  }

  /**
   * Initiates the payment state on a booking.
   */
  async initiatePayment(booking: Booking, transaction?: Transaction): Promise<void> {
    booking.initiatePayment();
    await this.bookingRepository.save(booking, transaction);
  }

  /**
   * Confirms payment for a booking and saves it.
   */
  async confirmPayment(
    booking: Booking,
    verifiedAt: Date | string | unknown,
    razorpayPaymentId?: string,
    transaction?: Transaction
  ): Promise<void> {
    booking.confirmPayment(verifiedAt, razorpayPaymentId);
    await this.bookingRepository.save(booking, transaction);
  }

  /**
   * Completes a booking and saves it.
   */
  async completeBooking(booking: Booking, transaction?: Transaction): Promise<void> {
    booking.complete();
    await this.bookingRepository.save(booking, transaction);
  }

  /**
   * Cancels a booking with an optional reason and saves it.
   */
  async cancelBooking(booking: Booking, reason?: string, transaction?: Transaction): Promise<void> {
    booking.cancel(reason);
    await this.bookingRepository.save(booking, transaction);
  }

  /**
   * Declines a booking and saves it.
   */
  async declineBooking(
    booking: Booking,
    reason: string,
    declinedBy?: string,
    customNote?: string,
    timestamp?: unknown,
    transaction?: Transaction
  ): Promise<void> {
    booking.decline(reason, declinedBy, customNote, timestamp);
    await this.bookingRepository.save(booking, transaction);
  }

  /**
   * Marks a booking as expired and saves it.
   */
  async expireBooking(booking: Booking, transaction?: Transaction): Promise<void> {
    booking.expire();
    await this.bookingRepository.save(booking, transaction);
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
  ): Promise<void> {
    booking.reschedule(newDate, newTime, rescheduledAt, newUtcDateTime);
    await this.bookingRepository.save(booking, transaction);
  }
}
