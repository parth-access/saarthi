import { Booking } from '../entities/Booking';
import { Transaction } from 'firebase-admin/firestore';

export interface BookingRepository {
  generateId(): string;
  create(booking: Booking, transaction?: Transaction): Promise<void>;
  lockSlot(
    therapistId: string,
    date: string,
    time: string,
    lockId: string,
    expiresAt: Date,
    transaction?: Transaction
  ): Promise<boolean>;
  releaseSlot(
    therapistId: string,
    date: string,
    time: string,
    lockId: string,
    transaction?: Transaction
  ): Promise<void>;
  findById(bookingId: string, transaction?: Transaction): Promise<Booking | null>;
  findByToken(token: string): Promise<Booking | null>;
  /**
   * Finds stale/expired bookings awaiting payment or pending beyond a threshold timeout.
   */
  findStaleBookings(timeoutThreshold: Date, limitCount?: number): Promise<Booking[]>;
  /**
   * @deprecated Use findStaleBookings instead.
   */
  findExpiredLocks(timeoutThreshold: Date): Promise<Booking[]>;
  save(booking: Booking, transaction?: Transaction): Promise<void>;
  findAll(limitCount?: number): Promise<Booking[]>;
  findByTherapistId(therapistId: string, limitCount?: number): Promise<Booking[]>;
  findActiveBookingsByTherapistAndDate(therapistId: string, date: string): Promise<Booking[]>;
  findByOrderId(orderId: string): Promise<Booking | null>;
}
