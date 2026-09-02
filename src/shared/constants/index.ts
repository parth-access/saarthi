export const BOOKING_LIFETIME_MS = 15 * 60 * 1000; // 15 minutes to pay
export const MAX_RETRY_ATTEMPTS = 3;
export const BOOKING_WINDOW_DAYS = 14; // Maximum advance booking window in days

/**
 * Counselling session length in minutes. The Google Calendar event builder uses
 * the same 50-minute block (googleCalendarService.ts) — this constant is the
 * shared source for user-facing "start–end" and duration display. It is NOT the
 * slot-generation interval (that is configured per therapist and is separate).
 */
export const SESSION_DURATION_MINUTES = 50;

/**
 * Client intake age bounds.
 *
 * These are read off the existing product, not invented: the "Teen" session type
 * is described in `SessionTypeStep` as "adolescents (13–19)", which sets the
 * floor, and the intake input already carried `max={120}`.
 *
 * They exist as constants because there was previously NO age validation on the
 * server at all — `bookingSchema` accepted `z.union([z.string(), z.number()])`,
 * so any value (1, 0, -5, 1e9, 'abc') was persisted verbatim and then rendered
 * to admins. See `src/shared/validation/age.ts` for the parser these bound.
 */
export const MIN_CLIENT_AGE = 13;
export const MAX_CLIENT_AGE = 120;


