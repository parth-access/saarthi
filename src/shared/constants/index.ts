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

