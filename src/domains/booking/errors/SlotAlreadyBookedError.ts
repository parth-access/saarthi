import { AppError } from '@/shared/errors';

/**
 * Raised when a booking confirmation attempts to permanently pin a slot that is
 * already permanently owned by a *different* confirmed booking. Prevents
 * double-booking (two confirmed+paid bookings on one slot) at confirm time.
 */
export class SlotAlreadyBookedError extends AppError {
  constructor(message: string = 'Slot is already booked by another confirmed booking', metadata?: Record<string, unknown>) {
    super(message, 'SLOT_ALREADY_BOOKED', 409, true, metadata);
  }
}
