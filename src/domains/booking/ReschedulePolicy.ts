/**
 * Rescheduling policy for clients, as the terms state it: a client may move a
 * session up to 24 hours before it starts. Admins and therapists are not bound
 * by it (they reschedule for emergencies and illness).
 *
 * Pure and dependency-free so the dashboard, the manage-booking page and the
 * server command all apply the SAME rule, the way RefundPolicy is shared.
 */
export const RESCHEDULE_CUTOFF_HOURS = 24;
export const RESCHEDULE_CUTOFF_MS = RESCHEDULE_CUTOFF_HOURS * 60 * 60 * 1000;

export const RESCHEDULE_CUTOFF_MESSAGE =
  `Sessions can be rescheduled up to ${RESCHEDULE_CUTOFF_HOURS} hours before they start. ` +
  'Please contact support if you need help with this session.';

/**
 * Whether a client may still reschedule a session that starts at
 * `sessionStartMs`, checked at `nowMs`.
 *
 * Mirrors RefundPolicy exactly: the boundary is inclusive (exactly 24 hours
 * ahead is still allowed, just as it still earns the 50% refund), and an
 * unknown start time (NaN) fails closed, so the client is sent to support.
 */
export function canClientReschedule(sessionStartMs: number, nowMs: number): boolean {
  if (!Number.isFinite(sessionStartMs) || !Number.isFinite(nowMs)) {
    return false;
  }
  return sessionStartMs - nowMs >= RESCHEDULE_CUTOFF_MS;
}
