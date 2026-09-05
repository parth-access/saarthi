/**
 * How responses from `GET /api/admin/therapists` and `GET /api/admin/therapists/[id]`
 * become what the screens show — and what they refuse to show.
 *
 * The schedule view computes a therapist's bookable grid in the browser from the
 * rules these return, so the failure that matters is a malformed rule reaching
 * `buildWeeklySchedule`: a `dayOfWeek` that is not a weekday, a duration that is
 * not a number. The rules match the other admin parsers:
 *
 *  - **A malformed row is not a valid row.** Every field of every rule and
 *    override is narrowed; one wrong type rejects the whole payload rather than
 *    letting a bad rule silently reshape or vanish from a day.
 *  - **A missing scan is not an empty scan.** `roster`, `rules` and `overrides`
 *    must each be present and well-formed — either admitted data or an admitted
 *    failure — so a truncated body never reads as "no therapists" or "no hours".
 *  - **A 200 that says `success: false` is a failure.**
 *  - **The server's sentence wins on error.**
 *
 * Kept out of the hooks so the rules can be tested without a DOM.
 */
import type {
  AdminScheduleOverride,
  AdminScheduleRule,
  AvailabilityBreak,
  ScheduleSummary,
} from '@/domains/admin/therapistSchedule';

export type {
  AdminScheduleOverride,
  AdminScheduleRule,
  ScheduleSummary,
} from '@/domains/admin/therapistSchedule';

export { createLatestRequestGuard, type LatestRequestGuard } from '../bookings/adminBookingsResponse';

export const GENERIC_THERAPISTS_ERROR = 'We could not load therapists right now. Please try again.';
export const THERAPISTS_ACCESS_ERROR = 'Your session no longer has admin access. Sign in again to continue.';
export const THERAPISTS_SESSION_ERROR = 'Your session has expired. Reload the page to sign in again.';

/* ----- roster ----- */

export interface AdminTherapistRosterRow {
  readonly id: string;
  readonly name: string;
  readonly specialization: string | null;
  readonly active: boolean;
  readonly email: string | null;
  readonly summary: ScheduleSummary | null;
}

export type AdminTherapistRosterScan =
  | { readonly ok: true; readonly rows: readonly AdminTherapistRosterRow[] }
  | { readonly ok: false; readonly reason: string };

export interface AdminTherapistsPayload {
  readonly generatedAtIso: string;
  readonly roster: AdminTherapistRosterScan;
}

export type AdminTherapistsInterpretation =
  | { readonly ok: true; readonly payload: AdminTherapistsPayload }
  | { readonly ok: false; readonly error: string };

/* ----- detail ----- */

export interface AdminTherapistIdentity {
  readonly id: string;
  readonly name: string;
  readonly specialization: string | null;
  readonly experience: string | null;
  readonly bio: string | null;
  readonly active: boolean;
  readonly email: string | null;
}

export type RuleScan =
  | { readonly ok: true; readonly rows: readonly AdminScheduleRule[]; readonly unreadable: number }
  | { readonly ok: false; readonly reason: string };

export type OverrideScan =
  | { readonly ok: true; readonly rows: readonly AdminScheduleOverride[]; readonly unreadable: number }
  | { readonly ok: false; readonly reason: string };

export interface AdminTherapistDetailPayload {
  readonly generatedAtIso: string;
  readonly therapist: AdminTherapistIdentity;
  readonly rules: RuleScan;
  readonly overrides: OverrideScan;
}

export type AdminTherapistDetailInterpretation =
  | { readonly ok: true; readonly payload: AdminTherapistDetailPayload }
  | { readonly ok: false; readonly error: string };

/* ----- primitive narrowing ----- */

function messageIn(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const message = (body as { error?: unknown }).error;
  return typeof message === 'string' && message.trim().length > 0 ? message : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isBreak(value: unknown): value is AvailabilityBreak {
  if (!value || typeof value !== 'object') return false;
  const b = value as Record<string, unknown>;
  return typeof b.startTime === 'string' && typeof b.endTime === 'string';
}

function isBreakArray(value: unknown): value is AvailabilityBreak[] {
  return Array.isArray(value) && value.every(isBreak);
}

/** A recurring rule, every field narrowed. `dayOfWeek` must be a real weekday. */
function isScheduleRule(value: unknown): value is AdminScheduleRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Record<string, unknown>;
  return (
    isNonEmptyString(rule.id) &&
    typeof rule.dayOfWeek === 'number' &&
    Number.isInteger(rule.dayOfWeek) &&
    rule.dayOfWeek >= 0 &&
    rule.dayOfWeek <= 6 &&
    typeof rule.isActive === 'boolean' &&
    typeof rule.startTime === 'string' &&
    typeof rule.endTime === 'string' &&
    isFiniteNumber(rule.slotDuration) &&
    isFiniteNumber(rule.cooldownGap) &&
    isBreakArray(rule.breaks)
  );
}

/** A date override. Both `blocked` and `available` carry a date; the optional hours are nullable. */
function isScheduleOverride(value: unknown): value is AdminScheduleOverride {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    isNonEmptyString(o.id) &&
    isNonEmptyString(o.date) &&
    (o.type === 'blocked' || o.type === 'available') &&
    isNullableString(o.startTime) &&
    isNullableString(o.endTime) &&
    isNullableFiniteNumber(o.slotDuration) &&
    isNullableFiniteNumber(o.cooldownGap) &&
    isBreakArray(o.breaks) &&
    isNullableString(o.reason)
  );
}

function isSummary(value: unknown): value is ScheduleSummary {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    isFiniteNumber(s.openDays) &&
    typeof s.hasCadenceDrift === 'boolean' &&
    typeof s.hasInactiveRule === 'boolean'
  );
}

function isRosterRow(value: unknown): value is AdminTherapistRosterRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    isNonEmptyString(row.id) &&
    typeof row.name === 'string' &&
    isNullableString(row.specialization) &&
    typeof row.active === 'boolean' &&
    isNullableString(row.email) &&
    (row.summary === null || isSummary(row.summary))
  );
}

function isRosterScan(value: unknown): value is AdminTherapistRosterScan {
  if (!value || typeof value !== 'object') return false;
  const scan = value as Record<string, unknown>;
  if (scan.ok === true) return Array.isArray(scan.rows) && scan.rows.every(isRosterRow);
  if (scan.ok === false) return isNonEmptyString(scan.reason);
  return false;
}

function isRuleScan(value: unknown): value is RuleScan {
  if (!value || typeof value !== 'object') return false;
  const scan = value as Record<string, unknown>;
  if (scan.ok === true) {
    return Array.isArray(scan.rows) && scan.rows.every(isScheduleRule) && isFiniteNumber(scan.unreadable);
  }
  if (scan.ok === false) return isNonEmptyString(scan.reason);
  return false;
}

function isOverrideScan(value: unknown): value is OverrideScan {
  if (!value || typeof value !== 'object') return false;
  const scan = value as Record<string, unknown>;
  if (scan.ok === true) {
    return Array.isArray(scan.rows) && scan.rows.every(isScheduleOverride) && isFiniteNumber(scan.unreadable);
  }
  if (scan.ok === false) return isNonEmptyString(scan.reason);
  return false;
}

function isIdentity(value: unknown): value is AdminTherapistIdentity {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  return (
    isNonEmptyString(t.id) &&
    typeof t.name === 'string' &&
    isNullableString(t.specialization) &&
    isNullableString(t.experience) &&
    isNullableString(t.bio) &&
    typeof t.active === 'boolean' &&
    isNullableString(t.email)
  );
}

function transportError(status: number, body: unknown): string | null {
  if (status === 401 || status === 403) return THERAPISTS_ACCESS_ERROR;
  if (status < 200 || status >= 300) return messageIn(body) ?? GENERIC_THERAPISTS_ERROR;
  return null;
}

export function interpretAdminTherapistsResponse(
  status: number,
  body: unknown
): AdminTherapistsInterpretation {
  const transport = transportError(status, body);
  if (transport) return { ok: false, error: transport };

  if (!body || typeof body !== 'object') return { ok: false, error: GENERIC_THERAPISTS_ERROR };
  const candidate = body as Record<string, unknown>;
  if (candidate.success === false) return { ok: false, error: messageIn(body) ?? GENERIC_THERAPISTS_ERROR };

  if (typeof candidate.generatedAtIso !== 'string' || !isRosterScan(candidate.roster)) {
    return { ok: false, error: GENERIC_THERAPISTS_ERROR };
  }

  return {
    ok: true,
    payload: {
      generatedAtIso: candidate.generatedAtIso,
      roster: candidate.roster as AdminTherapistRosterScan,
    },
  };
}

export function interpretAdminTherapistDetailResponse(
  status: number,
  body: unknown
): AdminTherapistDetailInterpretation {
  const transport = transportError(status, body);
  if (transport) return { ok: false, error: transport };

  if (!body || typeof body !== 'object') return { ok: false, error: GENERIC_THERAPISTS_ERROR };
  const candidate = body as Record<string, unknown>;
  if (candidate.success === false) return { ok: false, error: messageIn(body) ?? GENERIC_THERAPISTS_ERROR };

  if (
    typeof candidate.generatedAtIso !== 'string' ||
    !isIdentity(candidate.therapist) ||
    !isRuleScan(candidate.rules) ||
    !isOverrideScan(candidate.overrides)
  ) {
    return { ok: false, error: GENERIC_THERAPISTS_ERROR };
  }

  return {
    ok: true,
    payload: {
      generatedAtIso: candidate.generatedAtIso,
      therapist: candidate.therapist as AdminTherapistIdentity,
      rules: candidate.rules as RuleScan,
      overrides: candidate.overrides as OverrideScan,
    },
  };
}
