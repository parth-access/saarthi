import { NextResponse } from 'next/server';
import {
  assessScheduleImpact,
  checkOverrideDraft,
  checkRuleDraft,
  describeImpact,
  projectOverrides,
  projectRules,
  type ScheduleImpact,
} from '@/domains/admin/therapistScheduleWrite';
import type { AdminScheduleOverride, AdminScheduleRule } from '@/domains/admin/therapistSchedule';
import { getIstNow } from '@/shared/scheduling/slots';
import { logger } from '../../../../_lib/logger';
import {
  type AdminScheduleWriteRequest,
  describeApplied,
  toOverrideDraft,
  toRuleDraft,
} from './adminScheduleRequest';
import {
  applyScheduleWrite,
  readScheduleForWrite,
  scanBookingsForImpact,
  ScheduleWriteRefusal,
  type ScheduleChange,
} from './scheduleWriteSources';

/** Who is changing the schedule, for the log and the audit entry. */
export interface ScheduleWriteActor {
  readonly uid: string;
  /** "Admin" or "Therapist": the role that authorized this write. */
  readonly label: 'Admin' | 'Therapist';
}

/**
 * Validate, assess and apply one schedule change for an already-authorized
 * actor. Shared by the admin console's route and the therapist's own: each
 * route decides who may change which therapist; this decides whether the
 * change is storable and what it does to existing bookings, identically for
 * both. See the admin route for the two-step confirmation protocol.
 */
export async function runScheduleWrite(
  therapistId: string,
  request: AdminScheduleWriteRequest,
  actor: ScheduleWriteActor
): Promise<NextResponse> {
  try {
    const stored = await readScheduleForWrite(therapistId);
    if (!stored) {
      return NextResponse.json({ success: false, error: 'No therapist exists with that id.' }, { status: 404 });
    }

    // Validate, and build the schedule as it would be stored. Both happen before
    // anything is written, and both run again inside the transaction.
    let change: ScheduleChange;
    let proposed: {
      readonly rules: readonly AdminScheduleRule[];
      readonly overrides: readonly AdminScheduleOverride[];
    };
    const warnings: string[] = [];

    switch (request.action) {
      case 'save_rule': {
        const draft = toRuleDraft(request.rule);
        const check = checkRuleDraft(draft, stored.rules, request.ruleId);
        if (!check.ok) {
          return NextResponse.json({ success: false, error: check.problem }, { status: 400 });
        }
        warnings.push(...check.warnings);
        change = { action: 'save_rule', ruleId: request.ruleId, draft };
        proposed = {
          rules: projectRules(stored.rules, {
            kind: 'save',
            // The id only matters for matching an existing row; a new rule's real
            // id is minted inside the transaction.
            rule: { id: request.ruleId ?? '__new__', ...draft },
          }),
          overrides: stored.overrides,
        };
        break;
      }

      case 'delete_rule': {
        if (!stored.rules.some((rule) => rule.id === request.ruleId)) {
          return NextResponse.json(
            { success: false, error: 'Those working hours no longer exist. Reload to see the current schedule.' },
            { status: 404 }
          );
        }
        change = { action: 'delete_rule', ruleId: request.ruleId };
        proposed = {
          rules: projectRules(stored.rules, { kind: 'delete', ruleId: request.ruleId }),
          overrides: stored.overrides,
        };
        break;
      }

      case 'save_override': {
        const draft = toOverrideDraft(request.override);
        const check = checkOverrideDraft(draft, stored.overrides, request.overrideId);
        if (!check.ok) {
          return NextResponse.json({ success: false, error: check.problem }, { status: 400 });
        }
        warnings.push(...check.warnings);
        change = { action: 'save_override', overrideId: request.overrideId, draft };
        proposed = {
          rules: stored.rules,
          overrides: projectOverrides(stored.overrides, {
            kind: 'save',
            override: { id: request.overrideId ?? '__new__', ...draft },
          }),
        };
        break;
      }

      case 'delete_override': {
        if (!stored.overrides.some((row) => row.id === request.overrideId)) {
          return NextResponse.json(
            { success: false, error: 'That date exception no longer exists. Reload to see the current schedule.' },
            { status: 404 }
          );
        }
        change = { action: 'delete_override', overrideId: request.overrideId };
        proposed = {
          rules: stored.rules,
          overrides: projectOverrides(stored.overrides, { kind: 'delete', overrideId: request.overrideId }),
        };
        break;
      }
    }

    // Today in IST, not UTC: a booking at 09:00 tomorrow IST must not be judged
    // "already past" because the server's clock is still on yesterday's UTC date.
    const fromDate = getIstNow().date;
    const scan = await scanBookingsForImpact(therapistId);
    const impact: ScheduleImpact = assessScheduleImpact({
      current: { rules: stored.rules, overrides: stored.overrides },
      proposed,
      bookings: scan.candidates,
      fromDate,
      atLeast: scan.atLeast,
    });
    const notes = describeImpact(impact);

    if (impact.needsConfirmation && !request.acknowledgeImpact) {
      logger.info('THERAPIST_MUTATION', `${actor.label} schedule write awaiting confirmation`, {
        therapistId,
        actorUid: actor.uid,
        action: request.action,
        strandedCount: impact.stranded.length,
        scanTruncated: impact.atLeast,
      });
      return NextResponse.json(
        { success: true, applied: false, impact, notes, warnings },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const applied = await applyScheduleWrite({
      therapistId,
      therapistName: stored.therapistName,
      change,
      actorUid: actor.uid,
      actorLabel: actor.label,
      impact,
    });

    logger.info('THERAPIST_MUTATION', `${actor.label} schedule write applied`, {
      therapistId,
      actorUid: actor.uid,
      action: request.action,
      targetId: applied.targetId,
      strandedCount: impact.stranded.length,
      strandNotesWritten: applied.strandNotesWritten,
    });

    return NextResponse.json(
      {
        success: true,
        applied: true,
        summary: describeApplied(request),
        targetId: applied.targetId,
        impact,
        notes,
        warnings,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );

  } catch (error) {
    if (error instanceof ScheduleWriteRefusal) {
      logger.warn('THERAPIST_MUTATION', `${actor.label} schedule write refused`, {
        therapistId,
        actorUid: actor.uid,
        action: request.action,
        reason: error.message,
      });
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    // Everything else — a Firestore failure naming the project, a transaction that
    // could not commit — stays in the log. The browser gets one fixed sentence.
    logger.error('THERAPIST_MUTATION', `${actor.label} schedule write failed`, error, {
      therapistId,
      actorUid: actor.uid,
      action: request.action,
    });
    return NextResponse.json(
      {
        success: false,
        error:
          'The schedule could not be changed just now and nothing was written. The details are in the server log.',
      },
      { status: 500 }
    );
  }

}
