import { adminDb } from '@/lib/firebase/admin';
import {
  summarizeSchedule,
  type AdminScheduleOverride,
  type AdminScheduleRule,
  type AvailabilityBreak,
  type ScheduleSummary,
} from '@/domains/admin/therapistSchedule';
import { logger } from '../../_lib/logger';

/**
 * Reading a therapist's roster and schedule out of Firestore, for the admin
 * console. Read-only: this module never writes. Three collections back it —
 * `therapists`, and each therapist's `therapistAvailability/{id}/recurringRules`
 * and `.../overrides` subcollections — and every read here uses `adminDb`, so
 * the browser never touches Firestore directly.
 *
 * Two constraints carried from the other admin sources:
 *
 *  1. **A failed read is data, not an exception.** The roster's per-therapist
 *     schedule summary, and each subcollection on the detail, report their own
 *     failure so one broken read never blanks the whole page — and a Firestore
 *     error (which can carry an index URL or project id) stays in the server log
 *     while the browser gets a fixed sentence.
 *  2. **A document is narrowed, never trusted whole.** Each rule and override is
 *     coerced to well-typed fields. A rule whose `dayOfWeek` cannot be placed on
 *     a weekday is counted as unreadable rather than dropped in silence; a rule
 *     with an unusable duration is kept with a `0` the schedule view surfaces as
 *     "offers no slots", so a broken rule is visible to be fixed, not hidden.
 */

/** The one sentence a failed read is allowed to say — matches the other sections. */
const UNREADABLE = 'Could not be read just now. Reload to try again.';

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/** Unparseable numbers become 0 — a finite sentinel the cadence check flags, never a guess. */
function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toBreaks(value: unknown): AvailabilityBreak[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      return { startTime: stringOr(record.startTime, ''), endTime: stringOr(record.endTime, '') };
    })
    .filter((b) => b.startTime.length > 0 && b.endTime.length > 0);
}

/** A recurring rule, or `null` when it cannot be placed on a weekday. */
function toScheduleRule(id: string, data: Record<string, unknown>): AdminScheduleRule | null {
  const dayOfWeek = data.dayOfWeek;
  if (typeof dayOfWeek !== 'number' || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return null;
  }
  return {
    id,
    dayOfWeek,
    // Absent `isActive` is treated as active, matching the availability lister.
    isActive: data.isActive !== false,
    startTime: stringOr(data.startTime, ''),
    endTime: stringOr(data.endTime, ''),
    slotDuration: finiteOr(data.slotDuration, 0),
    cooldownGap: finiteOr(data.cooldownGap, 0),
    breaks: toBreaks(data.breaks),
  };
}

function toScheduleOverride(id: string, data: Record<string, unknown>): AdminScheduleOverride | null {
  const date = trimmedOrNull(data.date);
  if (!date) return null;
  const type = data.type === 'available' ? 'available' : 'blocked';
  return {
    id,
    date,
    type,
    startTime: trimmedOrNull(data.startTime),
    endTime: trimmedOrNull(data.endTime),
    slotDuration: typeof data.slotDuration === 'number' && Number.isFinite(data.slotDuration) ? data.slotDuration : null,
    cooldownGap: typeof data.cooldownGap === 'number' && Number.isFinite(data.cooldownGap) ? data.cooldownGap : null,
    breaks: toBreaks(data.breaks),
    reason: trimmedOrNull(data.reason),
  };
}

/* ------------------------------------------------------------------ *
 * The roster
 * ------------------------------------------------------------------ */

/** One therapist as the roster lists them, with a glance-level schedule summary. */
export interface AdminTherapistRosterRow {
  readonly id: string;
  readonly name: string;
  readonly specialization: string | null;
  readonly active: boolean;
  readonly email: string | null;
  /** `null` when this therapist's rules could not be read — the row still lists. */
  readonly summary: ScheduleSummary | null;
}

async function readRulesFor(therapistId: string): Promise<AdminScheduleRule[] | null> {
  if (!adminDb) return null;
  try {
    const snapshot = await adminDb.collection(`therapistAvailability/${therapistId}/recurringRules`).get();
    return snapshot.docs
      .map((doc) => toScheduleRule(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
      .filter((rule): rule is AdminScheduleRule => rule !== null);
  } catch (error) {
    logger.error('THERAPIST_MUTATION', 'Admin therapist rules failed to read', error, { therapistId });
    return null;
  }
}

export type AdminTherapistRosterScan =
  | { readonly ok: true; readonly rows: readonly AdminTherapistRosterRow[] }
  | { readonly ok: false; readonly reason: string };

export async function readTherapistRoster(): Promise<AdminTherapistRosterScan> {
  if (!adminDb) return { ok: false, reason: UNREADABLE };
  try {
    // Every therapist, active and inactive — the roster is where an operator sees
    // who has been switched off, so it must not filter them out.
    const snapshot = await adminDb.collection('therapists').get();
    const rows = await Promise.all(
      snapshot.docs.map(async (doc): Promise<AdminTherapistRosterRow> => {
        const data = (doc.data() ?? {}) as Record<string, unknown>;
        const rules = await readRulesFor(doc.id);
        return {
          id: doc.id,
          name: trimmedOrNull(data.name) ?? 'Unnamed therapist',
          specialization: trimmedOrNull(data.specialization),
          active: data.active !== false,
          email: trimmedOrNull(data.email),
          summary: rules ? summarizeSchedule(rules) : null,
        };
      })
    );
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, rows };
  } catch (error) {
    logger.error('THERAPIST_MUTATION', 'Admin therapist roster failed to read', error);
    return { ok: false, reason: UNREADABLE };
  }
}

/* ------------------------------------------------------------------ *
 * One therapist's detail
 * ------------------------------------------------------------------ */

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

async function readRuleScan(therapistId: string): Promise<RuleScan> {
  if (!adminDb) return { ok: false, reason: UNREADABLE };
  try {
    const snapshot = await adminDb.collection(`therapistAvailability/${therapistId}/recurringRules`).get();
    const parsed = snapshot.docs.map((doc) => toScheduleRule(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
    const rows = parsed.filter((rule): rule is AdminScheduleRule => rule !== null);
    return { ok: true, rows, unreadable: parsed.length - rows.length };
  } catch (error) {
    logger.error('THERAPIST_MUTATION', 'Admin therapist rule scan failed', error, { therapistId });
    return { ok: false, reason: UNREADABLE };
  }
}

async function readOverrideScan(therapistId: string): Promise<OverrideScan> {
  if (!adminDb) return { ok: false, reason: UNREADABLE };
  try {
    const snapshot = await adminDb.collection(`therapistAvailability/${therapistId}/overrides`).get();
    const parsed = snapshot.docs.map((doc) => toScheduleOverride(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
    const rows = parsed.filter((o): o is AdminScheduleOverride => o !== null);
    return { ok: true, rows, unreadable: parsed.length - rows.length };
  } catch (error) {
    logger.error('THERAPIST_MUTATION', 'Admin therapist override scan failed', error, { therapistId });
    return { ok: false, reason: UNREADABLE };
  }
}

/** `null` when the therapist id matches no document — the route turns that into a 404. */
export async function readTherapistDetail(
  therapistId: string,
  now: Date = new Date()
): Promise<AdminTherapistDetailPayload | null> {
  if (!adminDb) throw new Error('Firestore adminDb is not initialized.');

  const doc = await adminDb.collection('therapists').doc(therapistId).get();
  if (!doc.exists) return null;
  const data = (doc.data() ?? {}) as Record<string, unknown>;

  const [rules, overrides] = await Promise.all([readRuleScan(therapistId), readOverrideScan(therapistId)]);

  return {
    generatedAtIso: now.toISOString(),
    therapist: {
      id: doc.id,
      name: trimmedOrNull(data.name) ?? 'Unnamed therapist',
      specialization: trimmedOrNull(data.specialization),
      experience: trimmedOrNull(data.experience),
      bio: trimmedOrNull(data.bio),
      active: data.active !== false,
      email: trimmedOrNull(data.email),
    },
    rules,
    overrides,
  };
}
