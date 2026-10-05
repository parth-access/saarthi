/**
 * Turning a therapist's schedule into the sentences an operator reads.
 *
 * The rules that matter here are the ones about *honesty*, and they are all
 * testable, so they live outside the components:
 *
 *  - **A day with no rule and a day with a switched-off rule are different
 *    things.** Both offer nothing, but one has never been set up and the other
 *    was deliberately closed. Reading them as the same would hide an accident.
 *  - **"Open" means slots exist.** A rule can be active and still produce no
 *    bookable start times — a window shorter than one session, an end before the
 *    start, an unparseable time — and that is the failure most worth naming,
 *    because the roster would otherwise count the day as worked.
 *  - **A cadence that differs from the 45-minute session is stated, not
 *    corrected.** The console shows what it found.
 *  - **An override says what it does to a specific date**, in the same words the
 *    availability endpoint would act on.
 *
 * Times are IST throughout — the platform has no other timezone — so no
 * conversion happens here, only formatting.
 */
import type {
  AdminScheduleOverride,
  ScheduleSummary,
  ScheduledDay,
} from '@/domains/admin/therapistSchedule';
import { STANDARD_SLOT_MINUTES } from '@/domains/admin/therapistSchedule';

/** Sunday first, matching `dayOfWeek` 0–6 as stored. */
export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function weekdayName(dayOfWeek: number): string {
  return WEEKDAY_NAMES[dayOfWeek] ?? `Day ${dayOfWeek}`;
}

export function weekdayShort(dayOfWeek: number): string {
  return WEEKDAY_SHORT[dayOfWeek] ?? `${dayOfWeek}`;
}

/** How a day reads at a glance. `problem` is the state that needs a person. */
export type DayState = 'closed' | 'disabled' | 'open' | 'problem';

export interface DayReading {
  readonly state: DayState;
  /** The short label on the day's row. */
  readonly label: string;
  /** One line saying what an operator is looking at. Never invented. */
  readonly detail: string;
}

/**
 * Reads one day of the built weekly schedule.
 *
 * `problem` is reserved for the case that would otherwise lie: an active rule
 * that yields no slots. The rule looks set up, the day looks worked, and no
 * client can book — so it is called out rather than shown as merely closed.
 */
export function readDay(day: ScheduledDay): DayReading {
  if (day.rules.length === 0) {
    return { state: 'closed', label: 'No hours set', detail: 'No recurring rule covers this day.' };
  }
  if (!day.open) {
    return {
      state: 'disabled',
      label: 'Switched off',
      detail:
        day.rules.length === 1
          ? 'A rule exists for this day but is switched off, so nothing is bookable.'
          : `${day.rules.length} rules exist for this day, all switched off, so nothing is bookable.`,
    };
  }
  if (day.slots.length === 0) {
    return {
      state: 'problem',
      label: 'Active, but no slots',
      detail:
        'This day has an active rule that produces no bookable start times — check the window, the session length and the breaks. No one can book it.',
    };
  }
  return {
    state: 'open',
    label: `${day.slots.length} ${day.slots.length === 1 ? 'slot' : 'slots'}`,
    detail: `${day.slots.length} bookable start ${day.slots.length === 1 ? 'time' : 'times'}, from ${day.slots[0]} to ${day.slots[day.slots.length - 1]}.`,
  };
}

/** The working window a rule describes, as a range. */
export function describeWindow(startTime: string, endTime: string): string {
  const start = startTime.trim();
  const end = endTime.trim();
  if (start.length === 0 || end.length === 0) return 'Hours not recorded';
  return `${start} – ${end}`;
}

/** The breaks a rule carves out, or null when there are none. */
export function describeBreaks(breaks: readonly { startTime: string; endTime: string }[]): string | null {
  if (breaks.length === 0) return null;
  const parts = breaks
    .filter((b) => b.startTime.trim().length > 0 && b.endTime.trim().length > 0)
    .map((b) => `${b.startTime} – ${b.endTime}`);
  if (parts.length === 0) return null;
  return parts.length === 1 ? `Break ${parts[0]}` : `Breaks ${parts.join(', ')}`;
}

/**
 * The cadence, in words. Says the session length and the gap plainly, and — when
 * they differ from the standard — says what the standard is, so an operator can
 * tell a deliberate choice from a stale default without opening the editor.
 */
export function describeCadence(slotDuration: number, cooldownGap: number): string {
  const duration = Number.isFinite(slotDuration) && slotDuration > 0
    ? `${slotDuration}-minute sessions`
    : 'Session length not usable';
  const gap = Number.isFinite(cooldownGap) && cooldownGap > 0 ? `, ${cooldownGap}-minute gap` : '';
  const standard =
    slotDuration === STANDARD_SLOT_MINUTES && (!Number.isFinite(cooldownGap) || cooldownGap <= 0);
  return standard ? `${duration}${gap}` : `${duration}${gap} (standard is ${STANDARD_SLOT_MINUTES} minutes, no gap)`;
}

/** What an override does to its date, in the endpoint's own terms. */
export function describeOverride(override: AdminScheduleOverride): string {
  if (override.type === 'blocked') {
    return override.reason
      ? `Closed all day — ${override.reason}`
      : 'Closed all day. No slots are offered, whatever the weekly rules say.';
  }
  const window =
    override.startTime && override.endTime
      ? `${override.startTime} – ${override.endTime}`
      : 'hours not recorded';
  const cadence =
    override.slotDuration === null
      ? ` Session length is not set on this override, so the availability endpoint falls back to 60 minutes — not the ${STANDARD_SLOT_MINUTES}-minute standard.`
      : '';
  return `Replaces the weekly rules for this date: ${window}.${cadence}${
    override.reason ? ` ${override.reason}` : ''
  }`;
}

/** The roster's one-line read of a therapist's schedule. */
export function summarizeForRoster(summary: ScheduleSummary | null): {
  readonly text: string;
  readonly warning: string | null;
} {
  if (!summary) {
    return {
      text: 'Schedule could not be read',
      warning: 'This is a failed read, not an empty schedule. Open the therapist to retry.',
    };
  }
  if (summary.openDays === 0) {
    return {
      text: 'No working days',
      warning: summary.hasInactiveRule
        ? 'Every rule for this therapist is switched off, so nothing can be booked.'
        : 'No availability rules are set, so nothing can be booked.',
    };
  }
  return {
    text: `${summary.openDays} working ${summary.openDays === 1 ? 'day' : 'days'} a week`,
    warning: summary.hasCadenceDrift
      ? `Some hours do not use the ${STANDARD_SLOT_MINUTES}-minute session cadence.`
      : null,
  };
}

/** Active/inactive, said once so the roster and the detail cannot word it differently. */
export function describeActiveStatus(active: boolean): { readonly label: string; readonly detail: string } {
  return active
    ? { label: 'Accepting bookings', detail: 'This therapist is offered to clients on the booking page.' }
    : {
        label: 'Not accepting bookings',
        detail:
          'This therapist is hidden from the booking page. Existing bookings are unaffected and still need running.',
      };
}
