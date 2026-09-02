import { MAX_CLIENT_AGE, MIN_CLIENT_AGE } from '@/shared/constants';

/**
 * Canonical client-age handling, shared by the intake form, the server validator,
 * the create command and every read/display path.
 *
 * Why this module exists
 * ----------------------
 * Age had four independent, disagreeing implementations, and every one of them
 * *fabricated* a value rather than refusing a bad one:
 *
 *   - `bookingFormSchema`  accepted any string whose `parseInt` was `> 0`, so '1'
 *                          and '18abc' both passed.
 *   - `bookingSchema`      (server) was `z.union([z.string(), z.number()]).optional()`
 *                          — no shape check, no range check, no integer check.
 *   - `BookingSystem`      sent `parseInt(age, 10) || 25`, inventing 25 for anything
 *                          unparseable, including an empty field.
 *   - `mapBooking`         read it back as `data?.age || 0`, inventing 0 for absent.
 *
 * So an implausible age was never rejected at the boundary — it was stored and
 * then rendered to admins as fact (the reported `MALE, 1Y` for an 18-year-old).
 * A single strict parser plus explicit bounds means an implausible age now fails
 * the request instead of silently becoming a number nobody typed.
 *
 * Parsing is deliberately strict, NOT `parseInt`: `parseInt('18abc')` is 18 and
 * `parseInt('1e3')` is 1, both of which quietly accept input the user did not
 * mean. Only a bare run of digits is a valid age.
 */

/** Digits only, 1-3 of them. No sign, no decimal point, no exponent, no units. */
const AGE_SHAPE = /^\d{1,3}$/;

/**
 * Parses an intake age into an integer, or `null` when the input is not a plain
 * whole number. Range is NOT applied here — `isValidClientAge` does that — so
 * that read paths can surface an implausible stored value (e.g. a legacy `1`)
 * instead of dropping it and hiding the data problem.
 */
export function parseAgeInput(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return AGE_SHAPE.test(trimmed) ? Number(trimmed) : null;
  }
  return null;
}

/** True when `value` is an integer inside the intake bounds. */
export function isValidClientAge(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_CLIENT_AGE &&
    value <= MAX_CLIENT_AGE
  );
}

/** The single message shown for a rejected age, client-side and server-side. */
export const AGE_RANGE_MESSAGE = `Age must be a whole number between ${MIN_CLIENT_AGE} and ${MAX_CLIENT_AGE}`;

/**
 * Parses and range-checks in one step. Returns `null` for anything that must not
 * be persisted, so callers can `throw`/`400` rather than substitute a default.
 */
export function parseValidClientAge(raw: unknown): number | null {
  const parsed = parseAgeInput(raw);
  return parsed !== null && isValidClientAge(parsed) ? parsed : null;
}
