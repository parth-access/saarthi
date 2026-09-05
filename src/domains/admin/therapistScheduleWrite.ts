/**
 * Writing a therapist's schedule: what the admin console is allowed to store, and
 * what a change would cost.
 *
 * The read side of this section computes the bookable grid. This module owns the
 * other half — deciding whether a proposed rule or override is *storable*, and
 * telling an operator what applying it would do to bookings that already exist.
 * All of it is pure, because every one of these judgements is load-bearing and
 * must be tested directly.
 *
 * Four facts about the surrounding system shape everything here:
 *
 *  1. **A recurring rule has no `slotDuration` fallback anywhere.** The public
 *     lister and the booking validator both read the raw field, and the shared
 *     generator returns nothing for a non-positive or non-finite duration. A rule
 *     stored without a usable duration is therefore not "default 45" — it is a
 *     day that silently offers zero slots. So the duration is required, and
 *     restricted to the lengths the practice actually runs.
 *  2. **An `available` override *does* have one, and it is 60, not 45.** Both the
 *     lister and the validator read `slotDuration || 60`. An override written
 *     without a duration quietly becomes 60-minute sessions, so this module
 *     requires it explicitly rather than letting the fallback decide.
 *  3. **Two overrides on one date resolve by whichever document comes back
 *     first.** Both readers use `.find()` over an unordered fetch, so a `blocked`
 *     and an `available` override for the same day are settled by auto-id
 *     ordering, not by intent. One override per date is therefore enforced here.
 *  4. **Emptying the schedule does not close the therapist — it opens them.** The
 *     booking validator returns `true` unconditionally when a therapist has no
 *     rules *and* no overrides, while the lister offers nothing. Removing the last
 *     piece of configuration flips a therapist from "bookable nowhere" to
 *     "bookable at any time a client asks for". That is the single most dangerous
 *     outcome of a schedule edit, so it is detected and reported as its own
 *     consequence rather than folded in with the rest.
 *
 * Nothing here mutates a booking, and nothing here decides on the operator's
 * behalf: a change with consequences is described and handed back for a person to
 * confirm.
 */
import { generateTimeSlots, timeToMinutes, type AvailabilityBreak } from '@/shared/scheduling/slots';
import {
  STANDARD_COOLDOWN_MINUTES,
  STANDARD_SLOT_MINUTES,
  type AdminScheduleOverride,
  type AdminScheduleRule,
} from './therapistSchedule';

/**
 * The session lengths an admin may store.
 *
 * 45 is the practice's session and the only length the rest of the platform is
 * built around; the others are kept because the existing therapist-facing editor
 * offers them and removing a length would silently invalidate schedules already
 * in production. Choosing anything but 45 is allowed and warned about — see
 * `cadenceWarning`.
 */
export const ALLOWED_SLOT_MINUTES = [30, 45, 60, 90] as const;
export type AllowedSlotMinutes = (typeof ALLOWED_SLOT_MINUTES)[number];

/** A gap longer than this is almost certainly a typo, not a roster. */
export const MAX_COOLDOWN_MINUTES = 120;

/** The most bookings one impact check will read before it admits it stopped. */
export const STRANDED_SCAN_LIMIT = 200;

/**
 * A rule as an admin proposes it. Deliberately not `AdminScheduleRule`: a draft
 * has no id until it is stored, and `slotDuration` is narrowed to the lengths the
 * console accepts rather than any number Firestore happens to hold.
 */
export interface ScheduleRuleDraft {
  readonly dayOfWeek: number;
  readonly isActive: boolean;
  readonly startTime: string;
  readonly endTime: string;
  readonly slotDuration: number;
  readonly cooldownGap: number;
  readonly breaks: readonly AvailabilityBreak[];
}

/** An override as an admin proposes it. `blocked` carries nothing but a reason. */
export interface ScheduleOverrideDraft {
  readonly date: string;
  readonly type: 'blocked' | 'available';
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly slotDuration: number | null;
  readonly cooldownGap: number | null;
  readonly breaks: readonly AvailabilityBreak[];
  readonly reason: string | null;
}

/**
 * The outcome of checking a draft. A rejection carries one sentence, because the
 * operator needs to know what to change, not a tree of codes. Warnings do not
 * block: they are the divergences a person is allowed to choose deliberately.
 */
export type DraftCheck =
  | { readonly ok: true; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly problem: string };

/**
 * Every kind of change this endpoint can make. Keeping them in one union means the
 * impact check, the audit record and the UI all name an action the same way.
 */
export type ScheduleWriteAction = 'save_rule' | 'delete_rule' | 'save_override' | 'delete_override';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A zero-padded 24-hour clock time.
 *
 * Exported because the editor's slot preview needs the same answer this module's
 * own checks use. `timeToMinutes` is deliberately looser — it reads `9:00` as 540
 * and `25:00` as 1500 — so a preview built on the generator alone would draw a
 * grid for a window the check then refuses to store. Named for the clock rather
 * than `isTime`, which reads too close to `isTimeOffered` below.
 */
export function isClockTime(value: string): boolean {
  return HHMM.test(value);
}

/**
 * The cadence note, or null when the draft matches the practice's session.
 *
 * This is the user-facing half of the "keep the choice, state the cost" policy:
 * a 60-minute session is storable, and an operator who stores one is told what
 * they have just changed about the day.
 */
export function cadenceWarning(slotDuration: number, cooldownGap: number): string | null {
  const parts: string[] = [];
  if (slotDuration !== STANDARD_SLOT_MINUTES) {
    parts.push(
      `Sessions here will be ${slotDuration} minutes, not the ${STANDARD_SLOT_MINUTES}-minute session the rest of Saarthi is built around.`
    );
  }
  if (cooldownGap !== STANDARD_COOLDOWN_MINUTES) {
    parts.push(`A ${cooldownGap}-minute gap is inserted between sessions, which the standard does not have.`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(' ')} This is allowed — it changes how many start times the day offers.`;
}

/** Overlapping [start, end) minute ranges, used for both breaks and rules. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * The window and break checks both a rule and an `available` override need.
 * Returns one sentence, or null when the shape is storable.
 */
function checkWindow(
  startTime: string,
  endTime: string,
  breaks: readonly AvailabilityBreak[]
): string | null {
  if (!isClockTime(startTime) || !isClockTime(endTime)) {
    return 'Start and end must be zero-padded 24-hour times, like 09:00 and 17:00.';
  }
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (end <= start) return 'The end time must be later than the start time.';

  const ranges: { start: number; end: number; label: string }[] = [];
  for (const entry of breaks) {
    if (!isClockTime(entry.startTime) || !isClockTime(entry.endTime)) {
      return 'Every break needs a zero-padded 24-hour start and end.';
    }
    const bStart = timeToMinutes(entry.startTime);
    const bEnd = timeToMinutes(entry.endTime);
    const label = `${entry.startTime} – ${entry.endTime}`;
    if (bEnd <= bStart) return `The break ${label} ends before it starts.`;
    if (bStart < start || bEnd > end) {
      return `The break ${label} falls outside the working window ${startTime} – ${endTime}.`;
    }
    for (const seen of ranges) {
      if (overlaps(bStart, bEnd, seen.start, seen.end)) {
        return `The breaks ${seen.label} and ${label} overlap each other.`;
      }
    }
    ranges.push({ start: bStart, end: bEnd, label });
  }
  return null;
}

/**
 * Whether a proposed recurring rule may be stored.
 *
 * `existing` is every rule already stored for this therapist, and `replacingId`
 * the one being edited (so a rule never conflicts with itself). Two rejections
 * here are the ones that matter operationally:
 *
 *  - **A window that produces no start times.** Storable in Firestore, invisible
 *    to clients, and indistinguishable from a working day on the roster. It is
 *    rejected rather than warned about, because there is no reading of it that an
 *    operator could have intended.
 *  - **A window overlapping another active rule on the same weekday.** The lister
 *    unions overlapping grids, so the result is a day whose start times come from
 *    two rules at once and cannot be reasoned about from either.
 */
export function checkRuleDraft(
  draft: ScheduleRuleDraft,
  existing: readonly AdminScheduleRule[],
  replacingId: string | null = null
): DraftCheck {
  if (!Number.isInteger(draft.dayOfWeek) || draft.dayOfWeek < 0 || draft.dayOfWeek > 6) {
    return { ok: false, problem: 'Pick a weekday.' };
  }
  if (!(ALLOWED_SLOT_MINUTES as readonly number[]).includes(draft.slotDuration)) {
    return {
      ok: false,
      problem: `A session must be ${ALLOWED_SLOT_MINUTES.join(', ')} minutes. A rule stored without a usable length offers no start times at all.`,
    };
  }
  if (!Number.isInteger(draft.cooldownGap) || draft.cooldownGap < 0 || draft.cooldownGap > MAX_COOLDOWN_MINUTES) {
    return { ok: false, problem: `The gap between sessions must be 0 to ${MAX_COOLDOWN_MINUTES} minutes.` };
  }

  const windowProblem = checkWindow(draft.startTime, draft.endTime, draft.breaks);
  if (windowProblem) return { ok: false, problem: windowProblem };

  const slots = generateTimeSlots(draft.startTime, draft.endTime, draft.slotDuration, draft.cooldownGap, [
    ...draft.breaks,
  ]);
  if (slots.length === 0) {
    return {
      ok: false,
      problem: `${draft.startTime} – ${draft.endTime} fits no ${draft.slotDuration}-minute session once the breaks and gap are taken out, so this rule would offer nothing. Widen the window or shorten the session.`,
    };
  }

  if (draft.isActive) {
    const start = timeToMinutes(draft.startTime);
    const end = timeToMinutes(draft.endTime);
    for (const rule of existing) {
      if (rule.id === replacingId) continue;
      if (!rule.isActive || rule.dayOfWeek !== draft.dayOfWeek) continue;
      const otherStart = timeToMinutes(rule.startTime);
      const otherEnd = timeToMinutes(rule.endTime);
      if (!Number.isFinite(otherStart) || !Number.isFinite(otherEnd)) continue;
      if (overlaps(start, end, otherStart, otherEnd)) {
        return {
          ok: false,
          problem: `This overlaps an active rule already on this day (${rule.startTime} – ${rule.endTime}). Two overlapping rules produce a merged set of start times that neither one describes — edit that rule instead, or make this one start after it ends.`,
        };
      }
    }
  }

  const warning = cadenceWarning(draft.slotDuration, draft.cooldownGap);
  return { ok: true, warnings: warning ? [warning] : [] };
}

/** A real calendar date, not merely a string shaped like one. `2026-02-30` fails. */
export function isCalendarDate(value: string): boolean {
  if (!YMD.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const stamp = new Date(Date.UTC(year, month - 1, day));
  return (
    stamp.getUTCFullYear() === year && stamp.getUTCMonth() === month - 1 && stamp.getUTCDate() === day
  );
}

/**
 * Whether a proposed date override may be stored.
 *
 * The date is checked as a real calendar date, not just a matching pattern: an
 * impossible date is accepted by every regex in the codebase and then fails much
 * later, at the point a booking is converted to UTC.
 *
 * One override per date is enforced because both readers resolve a same-date
 * collision with `.find()` over an unordered fetch — a `blocked` and an
 * `available` override on one day are settled by auto-id ordering, which is not
 * something an operator can see or predict.
 */
export function checkOverrideDraft(
  draft: ScheduleOverrideDraft,
  existing: readonly AdminScheduleOverride[],
  replacingId: string | null = null
): DraftCheck {
  if (!isCalendarDate(draft.date)) {
    return { ok: false, problem: 'Give a real date as YYYY-MM-DD.' };
  }

  const clash = existing.find((row) => row.date === draft.date && row.id !== replacingId);
  if (clash) {
    return {
      ok: false,
      problem: `${draft.date} already has an override (${clash.type === 'blocked' ? 'closed' : 'replacement hours'}). Only one override per date can be relied on — edit or remove that one first.`,
    };
  }

  if (draft.type === 'blocked') {
    return { ok: true, warnings: [] };
  }

  if (draft.startTime === null || draft.endTime === null) {
    return { ok: false, problem: 'Replacement hours need a start and an end time.' };
  }
  if (draft.slotDuration === null) {
    return {
      ok: false,
      problem: `Give the session length. An override stored without one is read as 60 minutes by the booking flow — not the ${STANDARD_SLOT_MINUTES}-minute session.`,
    };
  }
  if (!(ALLOWED_SLOT_MINUTES as readonly number[]).includes(draft.slotDuration)) {
    return { ok: false, problem: `A session must be ${ALLOWED_SLOT_MINUTES.join(', ')} minutes.` };
  }
  const cooldown = draft.cooldownGap ?? 0;
  if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > MAX_COOLDOWN_MINUTES) {
    return { ok: false, problem: `The gap between sessions must be 0 to ${MAX_COOLDOWN_MINUTES} minutes.` };
  }

  const windowProblem = checkWindow(draft.startTime, draft.endTime, draft.breaks);
  if (windowProblem) return { ok: false, problem: windowProblem };

  const slots = generateTimeSlots(draft.startTime, draft.endTime, draft.slotDuration, cooldown, [
    ...draft.breaks,
  ]);
  if (slots.length === 0) {
    return {
      ok: false,
      problem: `${draft.startTime} – ${draft.endTime} fits no ${draft.slotDuration}-minute session, so this date would offer nothing while still overriding the weekly hours. Close the day instead, or widen the window.`,
    };
  }

  const warning = cadenceWarning(draft.slotDuration, cooldown);
  return { ok: true, warnings: warning ? [warning] : [] };
}

/**
 * The statuses a booking can hold and still be a session someone is expecting.
 *
 * Deliberately wider than the four-status set `/api/availability` uses to decide
 * which times are taken. That set exists to stop double-booking; this one exists
 * to stop an operator from stranding a client, and the two failures are not
 * symmetrical. Missing a stranded booking means someone turns up to a session
 * their therapist is no longer scheduled for; including one extra means an
 * operator reads a warning about a booking that was never really live. So this
 * follows the admin console's own reading of "still happening", which also counts
 * the part-paid statuses and a rescheduled session.
 */
export const ACTIVE_BOOKING_STATUSES: readonly string[] = [
  'pending',
  'pending_approval',
  'awaiting_payment',
  'pending_payment',
  'payment_initiated',
  'payment_started',
  'confirmed',
  'rescheduled',
];

/** A booking, narrowed to what deciding "would this still be offered" needs. */
export interface StrandCandidate {
  readonly id: string;
  readonly date: string;
  readonly time: string;
  readonly status: string;
  readonly clientName: string | null;
}

/**
 * Whether `date` at `time` would still be a bookable start time.
 *
 * A deliberate re-implementation of the order the public lister and the booking
 * validator both use, against a *proposed* rule set rather than the stored one:
 * a same-date override wins outright, a `blocked` one closes the day, an
 * `available` one replaces the weekly hours, and otherwise the day's active rules
 * are unioned. The weekday is derived in UTC for the same reason the validator
 * does it that way — so the server's own timezone cannot shift which day a date
 * falls on.
 */
export function isTimeOffered(
  rules: readonly AdminScheduleRule[],
  overrides: readonly AdminScheduleOverride[],
  date: string,
  time: string
): boolean {
  const override = overrides.find((row) => row.date === date);
  if (override?.type === 'blocked') return false;

  if (override?.type === 'available' && override.startTime && override.endTime) {
    const slots = generateTimeSlots(
      override.startTime,
      override.endTime,
      override.slotDuration ?? 60,
      override.cooldownGap ?? 0,
      [...override.breaks]
    );
    return slots.includes(time);
  }

  const [year, month, day] = date.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const slots = new Set<string>();
  for (const rule of rules) {
    if (!rule.isActive || rule.dayOfWeek !== dayOfWeek) continue;
    for (const slot of generateTimeSlots(rule.startTime, rule.endTime, rule.slotDuration, rule.cooldownGap, [
      ...rule.breaks,
    ])) {
      slots.add(slot);
    }
  }
  return slots.has(time);
}

/** A booking that the proposed schedule would no longer offer a slot for. */
export interface StrandedBooking {
  readonly id: string;
  readonly date: string;
  readonly time: string;
  readonly status: string;
  readonly clientName: string | null;
}

/**
 * What applying a change would do, beyond storing it.
 *
 * `stranded` is the list a person must see before confirming. `atLeast` says the
 * booking scan hit its cap, so the list is a floor rather than a total — a count
 * presented as exact when it was truncated is worse than no count at all.
 */
export interface ScheduleImpact {
  readonly stranded: readonly StrandedBooking[];
  readonly atLeast: boolean;
  readonly scanLimit: number;
  /**
   * True when the change would leave the therapist with no rules and no
   * overrides. The booking validator treats that state as "available at any
   * time", so this is the one impact that makes a therapist *more* bookable.
   */
  readonly losesAllConfiguration: boolean;
  /** True when a person must confirm before this is applied. */
  readonly needsConfirmation: boolean;
}

/**
 * Compares the schedule as it is against the schedule as proposed, over bookings
 * that are still live on or after `fromDate`.
 *
 * A booking is only reported when the current schedule offers its time and the
 * proposed one does not: an appointment already sitting outside the stored hours
 * was stranded before this edit, and blaming an operator for it would train them
 * to click through the warning.
 */
export function assessScheduleImpact(input: {
  readonly current: { readonly rules: readonly AdminScheduleRule[]; readonly overrides: readonly AdminScheduleOverride[] };
  readonly proposed: { readonly rules: readonly AdminScheduleRule[]; readonly overrides: readonly AdminScheduleOverride[] };
  readonly bookings: readonly StrandCandidate[];
  readonly fromDate: string;
  readonly atLeast: boolean;
  readonly scanLimit?: number;
}): ScheduleImpact {
  const { current, proposed, bookings, fromDate, atLeast } = input;

  const stranded = bookings
    .filter(
      (booking) =>
        typeof booking.date === 'string' &&
        booking.date >= fromDate &&
        ACTIVE_BOOKING_STATUSES.includes(booking.status) &&
        isTimeOffered(current.rules, current.overrides, booking.date, booking.time) &&
        !isTimeOffered(proposed.rules, proposed.overrides, booking.date, booking.time)
    )
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))
    .map(
      (booking): StrandedBooking => ({
        id: booking.id,
        date: booking.date,
        time: booking.time,
        status: booking.status,
        clientName: booking.clientName,
      })
    );

  const losesAllConfiguration = proposed.rules.length === 0 && proposed.overrides.length === 0;

  return {
    stranded,
    atLeast,
    scanLimit: input.scanLimit ?? STRANDED_SCAN_LIMIT,
    losesAllConfiguration,
    needsConfirmation: stranded.length > 0 || losesAllConfiguration || atLeast,
  };
}

/**
 * The rule set as it would be after a save or a delete.
 *
 * Saving with an id that already exists replaces that rule; saving without one
 * appends. Kept pure and separate from the Firestore write so the impact check
 * runs against exactly the set that is about to be stored.
 */
export function projectRules(
  existing: readonly AdminScheduleRule[],
  change:
    | { readonly kind: 'save'; readonly rule: AdminScheduleRule }
    | { readonly kind: 'delete'; readonly ruleId: string }
): readonly AdminScheduleRule[] {
  if (change.kind === 'delete') return existing.filter((rule) => rule.id !== change.ruleId);
  const replaced = existing.some((rule) => rule.id === change.rule.id);
  return replaced
    ? existing.map((rule) => (rule.id === change.rule.id ? change.rule : rule))
    : [...existing, change.rule];
}

/** The override set as it would be after a save or a delete. */
export function projectOverrides(
  existing: readonly AdminScheduleOverride[],
  change:
    | { readonly kind: 'save'; readonly override: AdminScheduleOverride }
    | { readonly kind: 'delete'; readonly overrideId: string }
): readonly AdminScheduleOverride[] {
  if (change.kind === 'delete') return existing.filter((row) => row.id !== change.overrideId);
  const replaced = existing.some((row) => row.id === change.override.id);
  return replaced
    ? existing.map((row) => (row.id === change.override.id ? change.override : row))
    : [...existing, change.override];
}

/**
 * The impact in sentences, for the confirmation an operator reads.
 *
 * Says what stays true as prominently as what changes: the reason this dialog can
 * be confirmed at all is that no booking is touched, and an operator who does not
 * know that will either refuse a safe change or expect Saarthi to have cancelled
 * something it did not.
 */
export function describeImpact(impact: ScheduleImpact): readonly string[] {
  const lines: string[] = [];

  if (impact.stranded.length > 0) {
    const count = impact.stranded.length;
    lines.push(
      `${count} ${count === 1 ? 'booking sits' : 'bookings sit'} at a time this schedule would no longer offer.`
    );
    lines.push(
      `${count === 1 ? 'It is' : 'They are'} not cancelled, moved or changed by this — ${count === 1 ? 'it stays' : 'they stay'} exactly as ${count === 1 ? 'it is' : 'they are'}, and the session${count === 1 ? '' : 's'} still ${count === 1 ? 'needs' : 'need'} running or rescheduling by hand.`
    );
  }

  if (impact.losesAllConfiguration) {
    lines.push(
      'This removes the last of this therapist’s schedule. With no rules and no overrides stored, the booking page offers nothing — but the booking check treats the therapist as available at any time, so a direct booking attempt for any hour would be accepted. Leave at least one rule in place, or switch the therapist off instead.'
    );
  }

  if (impact.atLeast) {
    lines.push(
      `Only the first ${impact.scanLimit} bookings for this therapist were read, so there may be affected sessions this list does not show.`
    );
  }

  return lines;
}
