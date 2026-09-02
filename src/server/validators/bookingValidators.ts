import { z } from 'zod';
import { AGE_RANGE_MESSAGE, parseAgeInput, isValidClientAge } from '@/shared/validation/age';

/**
 * An IST calendar day, 'YYYY-MM-DD'. Shape only: `2026-02-30` matches this and is
 * rejected later by `istToUtcIsoString`, which round-trips the date instead of
 * letting `Date.UTC` roll it into March.
 */
const istDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

/**
 * A 24-hour wall-clock start time, 'HH:MM', zero-padded.
 *
 * Padding is mandatory rather than normalised because the slot reservation doc id
 * is `${therapistId}_${date}_${time}`: '9:00' and '09:00' would pin two different
 * documents for the same real instant, so two clients could each hold "the same"
 * slot. Every server-side producer of times (`minutesToTime`) already pads.
 */
const istTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM (24-hour, zero-padded)');

/**
 * Client intake age: a bounded whole number, accepted as a string or a number
 * because the intake form posts the raw `<input type="number">` string.
 *
 * This field used to be `z.union([z.string(), z.number()]).optional()` — no shape,
 * integer or range check whatsoever — so the server persisted whatever arrived and
 * the admin UI rendered it as fact. It transforms to a `number` so that everything
 * downstream of the boundary has one type, and it REJECTS rather than substitutes:
 * a request carrying an implausible age now fails with a 400 instead of quietly
 * storing an age nobody entered.
 */
const clientAge = z
  .union([z.string(), z.number()])
  .transform((raw, ctx) => {
    const parsed = parseAgeInput(raw);
    if (parsed === null || !isValidClientAge(parsed)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: AGE_RANGE_MESSAGE });
      return z.NEVER;
    }
    return parsed;
  });


export const bookingSchema = z.object({
  lockId: z.string().optional(),
  therapistId: z.string().min(1, "Therapist ID is required"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  date: istDate,
  time: istTime,
  sessionType: z.string().optional(),
  sessionMode: z.string().optional(),
  message: z.string().optional(),
  gender: z.string().optional(),
  age: clientAge.optional(),
  email: z.string().email("Valid email address is required"),
}).strict();

export const rescheduleBookingSchema = z.object({
  bookingId: z.string().min(1),
  therapistId: z.string().min(1),
  date: istDate,
  time: istTime,
  reason: z.string().optional()
}).strict();

export const declineBookingSchema = z.object({
  bookingId: z.string().min(1),
  reason: z.string().optional()
}).strict();

export const updateBookingStatusSchema = z.object({
  bookingId: z.string().min(1),
  status: z.enum(['approved', 'declined', 'completed', 'cancelled'])
}).strict();

export const lockSlotSchema = z.object({
  therapistId: z.string().min(1),
  date: istDate,
  time: istTime,
  lockId: z.string().optional()
}).strict();

