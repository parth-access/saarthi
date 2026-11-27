import type { Booking } from '../entities/Booking';

/** Statuses in which a booking only holds its slot until `holdExpiresAt`. */
const HELD_UNTIL_PAID: ReadonlySet<string> = new Set(['pending', 'awaiting_payment']);

function toMillis(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  const v = value as { toMillis?: () => number; toDate?: () => Date };
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  return null;
}

/**
 * True when an unpaid booking's slot hold has run out, so the slot is free to
 * book again. CreateBookingCommand already accepts a new booking once the hold
 * lapses; availability uses this so the picker agrees instead of showing an
 * abandoned checkout as booked forever.
 *
 * A payment that still lands for the lapsed booking is handled where it
 * arrives: confirmed if the slot is still free, refunded if someone else took it.
 * A booking with no readable hold is left blocking, since nothing says it lapsed.
 */
export function hasLapsedUnpaidHold(
  booking: Pick<Booking, 'status' | 'paymentStatus' | 'holdExpiresAt'>,
  nowMs: number = Date.now()
): boolean {
  if (!HELD_UNTIL_PAID.has(booking.status)) return false;
  if (booking.paymentStatus === 'paid') return false;
  const expiresMs = toMillis(booking.holdExpiresAt);
  return expiresMs !== null && expiresMs <= nowMs;
}
