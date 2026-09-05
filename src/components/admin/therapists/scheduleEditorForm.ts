'use client';

/**
 * The editor's form state, and the conversion from what a person typed into what
 * the endpoint accepts.
 *
 * An HTML form holds strings. The endpoint takes numbers, and its zod schema is
 * deliberately strict — an empty select is not `0`, and `Number('')` is `0`, which
 * is exactly the silent coercion that would store a rule offering nothing. So the
 * parsing lives here, in one tested place, rather than at each input.
 *
 * The load-bearing decision in this module: **the local check is the server's
 * check.** `checkRuleDraft` and `checkOverrideDraft` are imported from the domain
 * and run on the same draft the request will carry, against the same stored rows
 * the server will read. This is not validation duplicated for convenience — a
 * second, hand-written approximation would drift, and the drift would show up as
 * an editor that accepts something the server then refuses, or worse, one that
 * refuses something legitimate. The server re-runs both checks inside its
 * transaction regardless; nothing here is a security boundary.
 *
 * `previewSlots` exists for the same reason the detail screen computes its grid in
 * the browser: the start times a draft would produce are the only honest answer to
 * "what am I about to do to this day", and they come from `generateTimeSlots` —
 * the function the booking page itself calls.
 */
import {
  ALLOWED_SLOT_MINUTES,
  cadenceWarning,
  checkOverrideDraft,
  checkRuleDraft,
  isClockTime,
  type ScheduleOverrideDraft,
  type ScheduleRuleDraft,
} from '@/domains/admin/therapistScheduleWrite';
import type { AdminScheduleOverride, AdminScheduleRule } from '@/domains/admin/therapistSchedule';
import { STANDARD_COOLDOWN_MINUTES, STANDARD_SLOT_MINUTES } from '@/domains/admin/therapistSchedule';
import { generateTimeSlots } from '@/shared/scheduling/slots';

/** A break as the form holds it, before either time is known to be valid. */
export interface BreakFormState {
  startTime: string;
  endTime: string;
}

export interface RuleFormState {
  /** The row being replaced, or null for a new rule. */
  readonly ruleId: string | null;
  dayOfWeek: number;
  isActive: boolean;
  startTime: string;
  endTime: string;
  /** The select's value: `''` until chosen, so it cannot become 0 by accident. */
  slotDuration: string;
  cooldownGap: string;
  breaks: BreakFormState[];
}

export interface OverrideFormState {
  readonly overrideId: string | null;
  date: string;
  type: 'blocked' | 'available';
  startTime: string;
  endTime: string;
  slotDuration: string;
  cooldownGap: string;
  breaks: BreakFormState[];
  reason: string;
}

export const SLOT_CHOICES = ALLOWED_SLOT_MINUTES;

/** A new rule for one weekday, pre-filled with the practice's own cadence. */
export function blankRuleForm(dayOfWeek: number): RuleFormState {
  return {
    ruleId: null,
    dayOfWeek,
    isActive: true,
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: String(STANDARD_SLOT_MINUTES),
    cooldownGap: String(STANDARD_COOLDOWN_MINUTES),
    breaks: [],
  };
}

/**
 * A stored rule, as the form holds it.
 *
 * A `slotDuration` the practice does not offer becomes an empty select rather than
 * a fifth option: the operator is then made to choose, instead of unknowingly
 * saving back a value that was already wrong.
 */
export function ruleFormFrom(rule: AdminScheduleRule): RuleFormState {
  const known = (ALLOWED_SLOT_MINUTES as readonly number[]).includes(rule.slotDuration);
  return {
    ruleId: rule.id,
    dayOfWeek: rule.dayOfWeek,
    isActive: rule.isActive,
    startTime: rule.startTime,
    endTime: rule.endTime,
    slotDuration: known ? String(rule.slotDuration) : '',
    cooldownGap: Number.isFinite(rule.cooldownGap) ? String(rule.cooldownGap) : '0',
    breaks: rule.breaks.map((entry) => ({ startTime: entry.startTime, endTime: entry.endTime })),
  };
}

export function blankOverrideForm(date: string): OverrideFormState {
  return {
    overrideId: null,
    date,
    // Closing a date is the common case and the safe default: it removes slots
    // rather than inventing them.
    type: 'blocked',
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: String(STANDARD_SLOT_MINUTES),
    cooldownGap: String(STANDARD_COOLDOWN_MINUTES),
    breaks: [],
    reason: '',
  };
}

export function overrideFormFrom(override: AdminScheduleOverride): OverrideFormState {
  const known =
    override.slotDuration !== null &&
    (ALLOWED_SLOT_MINUTES as readonly number[]).includes(override.slotDuration);
  return {
    overrideId: override.id,
    date: override.date,
    type: override.type,
    startTime: override.startTime ?? '09:00',
    endTime: override.endTime ?? '17:00',
    // A stored `available` override with no length falls back to 60 minutes in the
    // availability endpoint, not 45. It is presented as unset so the operator picks
    // deliberately rather than saving the fallback in.
    slotDuration: known ? String(override.slotDuration) : '',
    cooldownGap: override.cooldownGap === null ? '0' : String(override.cooldownGap),
    breaks: override.breaks.map((entry) => ({ startTime: entry.startTime, endTime: entry.endTime })),
    reason: override.reason ?? '',
  };
}

/** An integer from a form field, or null — never `Number('')`, which is 0. */
function intOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function usableBreaks(breaks: readonly BreakFormState[]): { startTime: string; endTime: string }[] {
  // A row where both fields are still empty is an unfilled row, not a bad break:
  // the operator added it and has not typed yet. A half-filled one is passed
  // through so the domain check names it.
  return breaks
    .filter((entry) => entry.startTime.trim().length > 0 || entry.endTime.trim().length > 0)
    .map((entry) => ({ startTime: entry.startTime.trim(), endTime: entry.endTime.trim() }));
}

export type FormCheck<T> =
  | { readonly ok: true; readonly draft: T; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly problem: string };

/**
 * The rule a form describes, checked against everything already stored.
 *
 * `existing` is every stored rule for this therapist and is what makes the overlap
 * check real; passing an empty array would make the editor accept a rule the server
 * refuses. The rule being edited excludes itself by id.
 */
export function checkRuleForm(
  form: RuleFormState,
  existing: readonly AdminScheduleRule[]
): FormCheck<ScheduleRuleDraft> {
  const slotDuration = intOrNull(form.slotDuration);
  if (slotDuration === null) {
    return { ok: false, problem: `Choose a session length: ${ALLOWED_SLOT_MINUTES.join(', ')} minutes.` };
  }
  const cooldownGap = intOrNull(form.cooldownGap);
  if (cooldownGap === null) {
    return { ok: false, problem: 'The gap between sessions must be a whole number of minutes — 0 for none.' };
  }

  const draft: ScheduleRuleDraft = {
    dayOfWeek: form.dayOfWeek,
    isActive: form.isActive,
    startTime: form.startTime.trim(),
    endTime: form.endTime.trim(),
    slotDuration,
    cooldownGap,
    breaks: usableBreaks(form.breaks),
  };

  const check = checkRuleDraft(draft, existing, form.ruleId);
  if (!check.ok) return { ok: false, problem: check.problem };
  return { ok: true, draft, warnings: check.warnings };
}

export function checkOverrideForm(
  form: OverrideFormState,
  existing: readonly AdminScheduleOverride[]
): FormCheck<ScheduleOverrideDraft> {
  const blocked = form.type === 'blocked';
  const reason = form.reason.trim();

  // A closed day carries no hours at all, so nothing typed into the hour fields is
  // read. Dropping them here — rather than sending them for the server to drop —
  // keeps this check running on exactly what will be stored.
  if (blocked) {
    const draft: ScheduleOverrideDraft = {
      date: form.date.trim(),
      type: 'blocked',
      startTime: null,
      endTime: null,
      slotDuration: null,
      cooldownGap: null,
      breaks: [],
      reason: reason.length > 0 ? reason : null,
    };
    const check = checkOverrideDraft(draft, existing, form.overrideId);
    return check.ok ? { ok: true, draft, warnings: check.warnings } : { ok: false, problem: check.problem };
  }

  const slotDuration = intOrNull(form.slotDuration);
  if (slotDuration === null) {
    return {
      ok: false,
      problem: `Choose a session length for this date: ${ALLOWED_SLOT_MINUTES.join(', ')} minutes. Stored without one, the booking page falls back to 60-minute sessions.`,
    };
  }
  const cooldownGap = intOrNull(form.cooldownGap);
  if (cooldownGap === null) {
    return { ok: false, problem: 'The gap between sessions must be a whole number of minutes — 0 for none.' };
  }

  const draft: ScheduleOverrideDraft = {
    date: form.date.trim(),
    type: 'available',
    startTime: form.startTime.trim(),
    endTime: form.endTime.trim(),
    slotDuration,
    cooldownGap,
    breaks: usableBreaks(form.breaks),
    reason: reason.length > 0 ? reason : null,
  };

  const check = checkOverrideDraft(draft, existing, form.overrideId);
  if (!check.ok) return { ok: false, problem: check.problem };
  return { ok: true, draft, warnings: check.warnings };
}

/**
 * The start times a draft would offer, generated by the same function the booking
 * page calls. Empty when the draft is not yet coherent — which is the honest
 * answer, and the same answer a client would get.
 *
 * The window is checked with the domain's own `isClockTime` before generating,
 * because `timeToMinutes` is looser than the stored format: it reads `9:00` as
 * 09:00 and `25:00` as a time past midnight. Without this the preview would draw a
 * full grid for a window the check refuses to store, which teaches an operator
 * that an unpadded time works.
 */
export function previewSlots(form: RuleFormState | OverrideFormState): readonly string[] {
  if ('type' in form && form.type === 'blocked') return [];
  const slotDuration = intOrNull(form.slotDuration);
  const cooldownGap = intOrNull(form.cooldownGap);
  if (slotDuration === null || cooldownGap === null) return [];
  const startTime = form.startTime.trim();
  const endTime = form.endTime.trim();
  if (!isClockTime(startTime) || !isClockTime(endTime)) return [];
  return generateTimeSlots(startTime, endTime, slotDuration, cooldownGap, usableBreaks(form.breaks));
}

/**
 * The cadence note for a draft, or null. Read straight off the form so the note
 * appears as the select changes, before anything is submitted.
 */
export function formCadenceWarning(form: RuleFormState | OverrideFormState): string | null {
  if ('type' in form && form.type === 'blocked') return null;
  const slotDuration = intOrNull(form.slotDuration);
  const cooldownGap = intOrNull(form.cooldownGap);
  if (slotDuration === null || cooldownGap === null) return null;
  return cadenceWarning(slotDuration, cooldownGap);
}

/**
 * Whether an edit would change anything at all.
 *
 * Submitting an untouched form is harmless — the server would store identical
 * values — but it costs a booking scan and writes an audit entry saying a change
 * happened when none did, which is exactly the noise that makes a trail unreadable.
 */
export function ruleFormIsUnchanged(form: RuleFormState, original: AdminScheduleRule | null): boolean {
  if (!original) return false;
  const check = checkRuleForm(form, []);
  if (!check.ok) return false;
  const draft = check.draft;
  return (
    draft.dayOfWeek === original.dayOfWeek &&
    draft.isActive === original.isActive &&
    draft.startTime === original.startTime &&
    draft.endTime === original.endTime &&
    draft.slotDuration === original.slotDuration &&
    draft.cooldownGap === original.cooldownGap &&
    draft.breaks.length === original.breaks.length &&
    draft.breaks.every(
      (entry, index) =>
        entry.startTime === original.breaks[index]?.startTime &&
        entry.endTime === original.breaks[index]?.endTime
    )
  );
}
