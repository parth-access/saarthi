/**
 * What the admin schedule endpoint accepts, and what it says back.
 *
 * Separate from the route because these are the decisions a mistake in would be
 * invisible in production: the shape a browser is allowed to submit, and the
 * sentence an operator reads before they confirm a change that cannot be undone
 * by clicking again.
 *
 * The schema is deliberately stricter than the Firestore documents it produces.
 * Stored rules in this project are permissive — a missing `slotDuration`, an
 * absent `isActive`, a break with empty times — because the read path has to
 * tolerate whatever is already there. This endpoint is the point at which new data
 * enters, and it refuses to add another lenient row: every field a rule needs to
 * produce start times is required here, `.strict()` rejects anything the console
 * did not mean to send, and the domain checks in `therapistScheduleWrite` run
 * afterwards on top.
 *
 * Nothing in this module reaches Firestore or decides authorization.
 */
import { z } from 'zod';
import {
  ALLOWED_SLOT_MINUTES,
  MAX_COOLDOWN_MINUTES,
  type ScheduleOverrideDraft,
  type ScheduleRuleDraft,
} from '@/domains/admin/therapistScheduleWrite';

/** Zero-padded 24-hour time, matching the booking schemas exactly. */
const IST_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const IST_DATE = /^\d{4}-\d{2}-\d{2}$/;

const time = z.string().regex(IST_TIME, 'Times must be zero-padded 24-hour HH:MM, like 09:00.');

/**
 * At most 12 breaks in a day. Not a business rule — a bound, so a malformed client
 * cannot make one request generate an unbounded amount of slot arithmetic.
 */
const breaks = z
  .array(z.object({ startTime: time, endTime: time }).strict())
  .max(12, 'A day cannot have more than 12 breaks.')
  .default([]);

const slotDuration = z
  .number()
  .int()
  .refine((value) => (ALLOWED_SLOT_MINUTES as readonly number[]).includes(value), {
    message: `A session must be ${ALLOWED_SLOT_MINUTES.join(', ')} minutes.`,
  });

const cooldownGap = z.number().int().min(0).max(MAX_COOLDOWN_MINUTES);

const rulePayload = z
  .object({
    dayOfWeek: z.number().int().min(0, 'Pick a weekday.').max(6, 'Pick a weekday.'),
    isActive: z.boolean(),
    startTime: time,
    endTime: time,
    slotDuration,
    cooldownGap,
    breaks,
  })
  .strict();

/**
 * An override's hours are nullable rather than optional, and `slotDuration` is
 * required on an `available` day even though Firestore would accept it missing.
 * The reason is in `therapistScheduleWrite`: both readers fall back to
 * `slotDuration || 60`, so an omitted length silently becomes a 60-minute session
 * rather than the practice's 45.
 */
const overridePayload = z
  .object({
    date: z.string().regex(IST_DATE, 'A date must be YYYY-MM-DD.'),
    type: z.enum(['blocked', 'available']),
    startTime: time.nullable().default(null),
    endTime: time.nullable().default(null),
    slotDuration: slotDuration.nullable().default(null),
    cooldownGap: cooldownGap.nullable().default(null),
    breaks,
    reason: z.string().trim().max(300).nullable().default(null),
  })
  .strict();

/**
 * `acknowledgeImpact` is the second half of the warn-then-confirm protocol. A
 * request without it that has consequences is answered with the consequences and
 * nothing is written; the same request with it applies. It is not a force flag —
 * the impact is recomputed on the confirming request, so a booking made in the
 * seconds between the two is still counted.
 */
const acknowledgeImpact = z.boolean().default(false);

/** A document id as it comes back from a read — bounded, and never a path. */
const docId = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !value.includes('/'), { message: 'That is not a valid id.' });

export const adminScheduleWriteSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('save_rule'),
      /** Absent for a new rule; present to replace the rule stored under it. */
      ruleId: docId.nullable().default(null),
      rule: rulePayload,
      acknowledgeImpact,
    })
    .strict(),
  z.object({ action: z.literal('delete_rule'), ruleId: docId, acknowledgeImpact }).strict(),
  z
    .object({
      action: z.literal('save_override'),
      overrideId: docId.nullable().default(null),
      override: overridePayload,
      acknowledgeImpact,
    })
    .strict(),
  z.object({ action: z.literal('delete_override'), overrideId: docId, acknowledgeImpact }).strict(),
]);

export type AdminScheduleWriteRequest = z.infer<typeof adminScheduleWriteSchema>;

/**
 * The validated payload as the domain checks want it.
 *
 * A separate step rather than one schema doing both, because the domain draft type
 * belongs to `therapistScheduleWrite` (which knows nothing about HTTP) and the
 * schema belongs here. Keeping the seam explicit means the checks that decide
 * whether a rule is storable are tested against plain objects, with no zod in the
 * way.
 */
export function toRuleDraft(payload: z.infer<typeof rulePayload>): ScheduleRuleDraft {
  return {
    dayOfWeek: payload.dayOfWeek,
    isActive: payload.isActive,
    startTime: payload.startTime,
    endTime: payload.endTime,
    slotDuration: payload.slotDuration,
    cooldownGap: payload.cooldownGap,
    breaks: payload.breaks,
  };
}

export function toOverrideDraft(payload: z.infer<typeof overridePayload>): ScheduleOverrideDraft {
  // A blocked day carries no hours, so anything sent alongside `type: 'blocked'`
  // is dropped here rather than stored. Otherwise a day that reads as closed would
  // hold live-looking hours, and a later edit flipping the type back to available
  // would resurrect times nobody reviewed.
  const blocked = payload.type === 'blocked';
  return {
    date: payload.date,
    type: payload.type,
    startTime: blocked ? null : payload.startTime,
    endTime: blocked ? null : payload.endTime,
    slotDuration: blocked ? null : payload.slotDuration,
    cooldownGap: blocked ? null : payload.cooldownGap,
    breaks: blocked ? [] : payload.breaks,
    reason: payload.reason,
  };
}

/** What an operator is told a successful write did. One sentence, past tense. */
export function describeApplied(request: AdminScheduleWriteRequest): string {
  switch (request.action) {
    case 'save_rule':
      return request.ruleId ? 'Working hours updated.' : 'Working hours added.';
    case 'delete_rule':
      return 'Working hours removed.';
    case 'save_override':
      return request.override.type === 'blocked'
        ? `${request.override.date} is now closed.`
        : `${request.override.date} now uses its own hours.`;
    case 'delete_override':
      return 'The date exception was removed — this day follows the weekly hours again.';
  }
}


