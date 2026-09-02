import { Booking } from '../entities/Booking';
import { Transaction } from 'firebase-admin/firestore';
import type { TxReader, TxWriter } from '@/shared/firestore/transactionPhases';

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
  /** Read-only seam: safe to call from a transaction's read phase. */
  findById(bookingId: string, transaction?: TxReader): Promise<Booking | null>;
  findByToken(token: string): Promise<Booking | null>;
  /**
   * Finds stale/expired bookings awaiting payment or pending beyond a threshold timeout.
   */
  findStaleBookings(timeoutThreshold: Date, limitCount?: number): Promise<Booking[]>;
  /**
   * @deprecated Use findStaleBookings instead.
   */
  findExpiredLocks(timeoutThreshold: Date): Promise<Booking[]>;
  /**
   * Write-only seam: accepts a `TxWriter` so it can never be the thing that
   * sneaks a read into a transaction's write phase.
   */
  save(booking: Booking, transaction?: TxWriter): Promise<void>;
  findAll(limitCount?: number): Promise<Booking[]>;
  findByTherapistId(therapistId: string, limitCount?: number): Promise<Booking[]>;
  findActiveBookingsByTherapistAndDate(therapistId: string, date: string): Promise<Booking[]>;
  findByOrderId(orderId: string): Promise<Booking | null>;
  findBookingsNeedingCalendarRetry(limitCount?: number): Promise<Booking[]>;
  /**
   * Every booking belonging to one client, matched on either identity a booking
   * can carry. Server-side only: the caller must pass identities taken from a
   * *verified* session, never from the request body.
   */
  findByClient(identity: { uid?: string; email?: string }, limitCount?: number): Promise<Booking[]>;
}
