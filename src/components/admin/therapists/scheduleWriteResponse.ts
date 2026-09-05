'use client';

/**
 * Reading the schedule endpoint's answer.
 *
 * The endpoint has two successful answers that both arrive as `200 { success:
 * true }` and mean opposite things, which is the whole reason this is a separate,
 * tested module rather than a few checks inside a component:
 *
 *  - `applied: false` — **nothing was written.** The change has consequences a
 *    person must see first, and they are in `impact`. Reading this as a success
 *    would tell an operator their edit had landed when the schedule is untouched.
 *  - `applied: true` — the change is stored, and `impact` now describes what was
 *    true at the moment it was stored.
 *
 * Failures are split by whether a retry is safe:
 *
 *  - `refused` — the server explained why and wrote nothing (400 validation, 404
 *    a row that has gone, 409 another admin got there first). The operator's next
 *    move is to fix a field or reload, and the sentence is the server's own.
 *  - `unknown` — it is not known whether the write landed. The UI must offer a
 *    reload and never a retry, because the retry is the thing that could apply a
 *    change twice.
 *
 * A malformed `impact` on an `applied: false` answer is a `refused`, not a
 * `confirm`: nothing was written, and a confirmation step that cannot show the
 * list it exists to show must not be entered. On an `applied: true` answer the
 * write has already happened, so an unreadable impact degrades to an applied
 * result with the detail missing — telling an operator a successful write failed
 * is the worse error.
 */
import type { AdminScheduleOverride } from '@/domains/admin/therapistSchedule';

export const SCHEDULE_SESSION_ERROR =
  'Your admin session is no longer valid. Sign in again, then reload this therapist.';

export const SCHEDULE_NETWORK_ERROR =
  'The request did not reach the server, so the schedule was not changed. Check your connection and try again.';

export const SCHEDULE_UNKNOWN_OUTCOME =
  'The server answered in a form this console could not read, so it is not known whether the schedule changed. Reload this therapist to see its current state — do not retry until you have.';

export const SCHEDULE_UNREADABLE_IMPACT =
  'The server reported that this change needs confirming but the console could not read what it would affect, so nothing was written and no confirmation is offered. Reload this therapist and try again.';

/** A booking sitting at a time the proposed schedule would no longer offer. */
export interface StrandedRow {
  readonly id: string;
  readonly date: string;
  readonly time: string;
  readonly status: string;
  readonly clientName: string | null;
}

export interface WriteImpact {
  readonly stranded: readonly StrandedRow[];
  /** True when the booking scan hit its cap, so `stranded` is a floor. */
  readonly atLeast: boolean;
  readonly scanLimit: number;
  readonly losesAllConfiguration: boolean;
  readonly needsConfirmation: boolean;
}

export type ScheduleWriteResult =
  | {
      readonly kind: 'applied';
      readonly summary: string;
      readonly notes: readonly string[];
      readonly warnings: readonly string[];
      /** From the impact as recomputed at write time; 0 when it was unreadable. */
      readonly strandedCount: number;
    }
  | {
      readonly kind: 'confirm';
      readonly impact: WriteImpact;
      readonly notes: readonly string[];
      readonly warnings: readonly string[];
    }
  | { readonly kind: 'refused'; readonly error: string }
  | { readonly kind: 'unknown'; readonly error: string };

/** What the editor sends. Mirrors the endpoint's zod schema, which is stricter. */
export interface RuleWire {
  readonly dayOfWeek: number;
  readonly isActive: boolean;
  readonly startTime: string;
  readonly endTime: string;
  readonly slotDuration: number;
  readonly cooldownGap: number;
  readonly breaks: readonly { readonly startTime: string; readonly endTime: string }[];
}

export type OverrideWire = Omit<AdminScheduleOverride, 'id'>;

export type ScheduleWriteRequest =
  | { readonly action: 'save_rule'; readonly ruleId: string | null; readonly rule: RuleWire; readonly acknowledgeImpact?: boolean }
  | { readonly action: 'delete_rule'; readonly ruleId: string; readonly acknowledgeImpact?: boolean }
  | { readonly action: 'save_override'; readonly overrideId: string | null; readonly override: OverrideWire; readonly acknowledgeImpact?: boolean }
  | { readonly action: 'delete_override'; readonly overrideId: string; readonly acknowledgeImpact?: boolean };

/** Kept for the editor's own typing of what it is replacing. */
export type ExistingOverride = AdminScheduleOverride;

function stringsIn(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

/**
 * The impact, or null when any part of it is not what it claims to be.
 *
 * Whole-payload rejection rather than per-row skipping: a stranded list quietly
 * one row short is worse than no list, because the operator confirms against it.
 */
function readImpact(value: unknown): WriteImpact | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.stranded)) return null;
  if (typeof record.atLeast !== 'boolean') return null;
  if (typeof record.losesAllConfiguration !== 'boolean') return null;
  if (typeof record.needsConfirmation !== 'boolean') return null;
  if (typeof record.scanLimit !== 'number' || !Number.isFinite(record.scanLimit)) return null;

  const stranded: StrandedRow[] = [];
  for (const entry of record.stranded) {
    if (!entry || typeof entry !== 'object') return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id.length === 0) return null;
    if (typeof row.date !== 'string' || typeof row.time !== 'string') return null;
    if (typeof row.status !== 'string') return null;
    if (row.clientName !== null && typeof row.clientName !== 'string') return null;
    stranded.push({
      id: row.id,
      date: row.date,
      time: row.time,
      status: row.status,
      clientName: row.clientName,
    });
  }

  return {
    stranded,
    atLeast: record.atLeast,
    scanLimit: record.scanLimit,
    losesAllConfiguration: record.losesAllConfiguration,
    needsConfirmation: record.needsConfirmation,
  };
}

export function interpretScheduleWriteResponse(status: number, body: unknown): ScheduleWriteResult {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const serverError =
    typeof record?.error === 'string' && record.error.length > 0 ? record.error : null;

  if (status === 401 || status === 403) {
    // 403 is also what `requireAdmin` answers a signed-in non-admin, so the
    // server's own sentence is preferred when it sent one.
    return { kind: 'refused', error: serverError ?? SCHEDULE_SESSION_ERROR };
  }

  if (status < 200 || status >= 300) {
    // Already operator-facing copy: the 400s from zod and the domain checks, the
    // 404 for a row that has gone, the 409 for a concurrent edit, the fixed 500.
    // Substituting a friendlier sentence here would lose the reason.
    if (serverError) return { kind: 'refused', error: serverError };
    // A 5xx with nothing readable in it could have committed before failing.
    return { kind: 'unknown', error: SCHEDULE_UNKNOWN_OUTCOME };
  }

  if (!record || record.success !== true || typeof record.applied !== 'boolean') {
    return { kind: 'unknown', error: SCHEDULE_UNKNOWN_OUTCOME };
  }

  const notes = stringsIn(record.notes);
  const warnings = stringsIn(record.warnings);
  const impact = readImpact(record.impact);

  if (record.applied === false) {
    // Nothing was written, so this is safe to refuse outright when the list the
    // confirmation step exists to show cannot be read.
    if (!impact) return { kind: 'refused', error: SCHEDULE_UNREADABLE_IMPACT };
    return { kind: 'confirm', impact, notes, warnings };
  }

  if (typeof record.summary !== 'string' || record.summary.length === 0) {
    // Applied, but the console cannot say what was applied. Reload, don't retry.
    return { kind: 'unknown', error: SCHEDULE_UNKNOWN_OUTCOME };
  }

  return {
    kind: 'applied',
    summary: record.summary,
    notes,
    warnings,
    strandedCount: impact ? impact.stranded.length : 0,
  };
}
