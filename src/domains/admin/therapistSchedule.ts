/**
 * A therapist's working schedule, as the admin console reads it.
 *
 * The console shows a therapist's recurring weekly rules and date overrides, and
 * — the reason this module exists — the *bookable grid* those rules actually
 * produce. That grid is not stored anywhere: it is computed from the rule's
 * window, cadence and breaks by the one canonical generator, `generateTimeSlots`
 * in `@/shared/scheduling/slots`. Computing it here, over already-narrowed rows,
 * means the slots an operator sees are the exact slots the booking flow offers —
 * the lister and this view cannot drift, because they call the same function.
 *
 * The other job is cadence honesty. A Saarthi session is 45 minutes long
 * (`SESSION_DURATION_MINUTES`), and the production rules generate the matching
 * 45-minute cadence (`slotDuration: 45, cooldownGap: 0`). The data model does
 * not enforce that — a rule may carry any duration/gap — so a rule that has
 * drifted (a 60-minute session, a 15-minute gap) is not wrong to store but is
 * worth flagging, because it silently changes how many slots a day offers. This
 * module classifies each rule against the standard rather than rewriting it: the
 * console surfaces the divergence and lets a person decide.
 *
 * Pure and DOM-free, so every rule here is tested directly. The server narrows
 * Firestore documents to these shapes; the browser runs this logic over them.
 */
import { SESSION_DURATION_MINUTES } from '@/shared/constants';
import { generateTimeSlots, timeToMinutes, type AvailabilityBreak } from '@/shared/scheduling/slots';

export type { AvailabilityBreak } from '@/shared/scheduling/slots';

/**
 * The cadence the console treats as standard, tied to the session length so the
 * two cannot drift apart. A rule matching this produces the contiguous
 * 45-minute grid the platform is built around.
 */
export const STANDARD_SLOT_MINUTES = SESSION_DURATION_MINUTES;
export const STANDARD_COOLDOWN_MINUTES = 0;

/** A recurring weekly rule, narrowed to what the schedule view reads. */
export interface AdminScheduleRule {
  readonly id: string;
  /** 0 = Sunday … 6 = Saturday. */
  readonly dayOfWeek: number;
  readonly isActive: boolean;
  /** 'HH:MM', 24h. */
  readonly startTime: string;
  readonly endTime: string;
  readonly slotDuration: number;
  readonly cooldownGap: number;
  readonly breaks: readonly AvailabilityBreak[];
}

/** A date-specific override, narrowed. `blocked` closes the day; `available` replaces it. */
export interface AdminScheduleOverride {
  readonly id: string;
  /** 'YYYY-MM-DD'. */
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
 * How a rule's cadence reads against the 45-minute standard. `standard` is true
 * only when a session is 45 minutes with no gap; otherwise `notes` says, in
 * plain words, each way it diverges — never as an error, only as something a
 * person should see before it quietly reshapes the day's slots.
 */
export interface CadenceReading {
  readonly standard: boolean;
  readonly slotDuration: number;
  readonly cooldownGap: number;
  readonly notes: readonly string[];
}

export function classifyCadence(slotDuration: number, cooldownGap: number): CadenceReading {
  const notes: string[] = [];
  const duration = Number(slotDuration);
  const cooldown = Number(cooldownGap);

  if (!Number.isFinite(duration) || duration <= 0) {
    notes.push('The session length is not a usable number.');
  } else if (duration !== STANDARD_SLOT_MINUTES) {
    notes.push(`${duration}-minute sessions (the standard is ${STANDARD_SLOT_MINUTES}).`);
  }

  const safeCooldown = Number.isFinite(cooldown) ? cooldown : 0;
  if (safeCooldown > 0) {
    notes.push(`${safeCooldown}-minute gap between sessions (the standard is none).`);
  } else if (safeCooldown < 0) {
    notes.push('The gap between sessions is negative.');
  }

  return {
    standard: notes.length === 0,
    slotDuration: duration,
    cooldownGap: safeCooldown,
    notes,
  };
}

/** One weekday, with its rules and the bookable grid they actually produce. */
export interface ScheduledDay {
  /** 0 = Sunday … 6 = Saturday. */
  readonly dayOfWeek: number;
  readonly rules: readonly AdminScheduleRule[];
  /** True when at least one active rule covers this day. */
  readonly open: boolean;
  /** The union of start times every active rule offers, sorted and de-duplicated. */
  readonly slots: readonly string[];
  /** True when every active rule matches the 45-minute standard. */
  readonly standard: boolean;
  /** Every distinct cadence note across the day's active rules. */
  readonly cadenceNotes: readonly string[];
  /** A rule exists for this day but is switched off, so it offers nothing. */
  readonly hasInactiveRule: boolean;
}

/** The grid a single rule produces, via the one canonical generator. */
export function previewRuleSlots(rule: AdminScheduleRule): string[] {
  return generateTimeSlots(rule.startTime, rule.endTime, rule.slotDuration, rule.cooldownGap, [
    ...rule.breaks,
  ]);
}

function sortTimes(times: Iterable<string>): string[] {
  return [...times].sort((a, b) => {
    const am = timeToMinutes(a);
    const bm = timeToMinutes(b);
    if (!Number.isFinite(am) || !Number.isFinite(bm)) return String(a).localeCompare(String(b));
    return am - bm;
  });
}

/**
 * The seven weekdays, Sunday first, each carrying its rules and combined grid.
 *
 * A day with more than one active rule (a split roster) has its slots unioned —
 * the same union `/api/availability` computes — so the preview matches what the
 * booking flow would offer. Inactive rules are surfaced (the day shows it has a
 * rule that is switched off) but contribute no slots, so a disabled block never
 * reads as bookable time.
 */
export function buildWeeklySchedule(rules: readonly AdminScheduleRule[]): readonly ScheduledDay[] {
  return Array.from({ length: 7 }, (_, dayOfWeek): ScheduledDay => {
    const forDay = rules.filter((rule) => rule.dayOfWeek === dayOfWeek);
    const active = forDay.filter((rule) => rule.isActive);

    const slotSet = new Set<string>();
    const noteSet = new Set<string>();
    let standard = true;

    for (const rule of active) {
      for (const slot of previewRuleSlots(rule)) slotSet.add(slot);
      const cadence = classifyCadence(rule.slotDuration, rule.cooldownGap);
      if (!cadence.standard) {
        standard = false;
        for (const note of cadence.notes) noteSet.add(note);
      }
    }

    return {
      dayOfWeek,
      rules: forDay,
      open: active.length > 0,
      slots: sortTimes(slotSet),
      standard: active.length > 0 ? standard : true,
      cadenceNotes: [...noteSet],
      hasInactiveRule: forDay.length > active.length,
    };
  });
}

/**
 * A one-line read of a therapist's whole schedule, for the roster. Counts the
 * days that are genuinely open and whether any active rule has drifted from the
 * standard cadence, without pulling the full grid into the list.
 */
export interface ScheduleSummary {
  readonly openDays: number;
  readonly hasCadenceDrift: boolean;
  readonly hasInactiveRule: boolean;
}

export function summarizeSchedule(rules: readonly AdminScheduleRule[]): ScheduleSummary {
  const week = buildWeeklySchedule(rules);
  return {
    openDays: week.filter((day) => day.open).length,
    hasCadenceDrift: week.some((day) => day.open && !day.standard),
    hasInactiveRule: week.some((day) => day.hasInactiveRule),
  };
}
