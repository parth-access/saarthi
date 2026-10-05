/**
 * Refund policy for Saarthi bookings.
 *
 * Double-booking refunds (payment captured for a slot that could not be honored)
 * are ALWAYS 100% and never routed through this policy.
 *
 * For customer/therapist/admin cancellations of an already-PAID booking, the
 * refund percentage is decided by how far ahead of the session start the
 * cancellation happens (measured at the moment of cancellation):
 *   - >= 48h before session  -> 100%
 *   - >= 24h and < 48h        -> 50%
 *   - < 24h before session    -> 0% (no refund)
 *
 * Pure, side-effect free, and fully unit-testable.
 */

export type RefundPercent = 0 | 50 | 100;

const HOUR_MS = 60 * 60 * 1000;
export const FULL_REFUND_CUTOFF_MS = 48 * HOUR_MS;
export const HALF_REFUND_CUTOFF_MS = 24 * HOUR_MS;

/**
 * Compute the cancellation refund percentage from the time remaining until the
 * session starts. Boundaries are inclusive of the higher tier (exactly 48h => 100%,
 * exactly 24h => 50%). If the session start cannot be determined (NaN), we fail
 * safe to 0% so we never over-refund on bad data — callers should log/flag this.
 */
export function computeRefundPercent(sessionStartMs: number, nowMs: number): RefundPercent {
  if (!Number.isFinite(sessionStartMs) || !Number.isFinite(nowMs)) {
    return 0;
  }
  const msUntilSession = sessionStartMs - nowMs;
  if (msUntilSession >= FULL_REFUND_CUTOFF_MS) return 100;
  if (msUntilSession >= HALF_REFUND_CUTOFF_MS) return 50;
  return 0;
}
