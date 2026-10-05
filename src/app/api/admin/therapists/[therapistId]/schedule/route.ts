import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
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
import { checkRateLimit } from '../../../../_lib/rateLimit';
import { isReadableTherapistId } from '../../therapistIdGuard';
import {
  adminScheduleWriteSchema,
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

export const dynamic = 'force-dynamic';

/**
 * Changing a therapist's working schedule, as an admin operation.
 *
 * A dedicated endpoint rather than a reuse of `/api/therapist/availability/*`.
 * That route authorizes the *therapist who owns the schedule*; this one authorizes
 * an admin, and the two are not interchangeable — widening the therapist route's
 * check to also admit admins would weaken the guard protecting every therapist's
 * own schedule in order to add a capability only admins need. The therapist route
 * is left exactly as it is.
 *
 * This endpoint changes *hours*, and nothing else. It cannot switch a therapist on
 * or off: `therapists/{id}.active` decides whether anyone can book them at all,
 * which is a different operation with a different blast radius, and conflating the
 * two would let "I closed Tuesday" and "I made this therapist unbookable" look like
 * the same click. Only the two availability subcollections are written here.
 *
 * The protocol is two-step whenever a change has consequences:
 *
 *  1. A request whose impact needs a person's judgement is answered
 *     `{ applied: false, impact }` and **nothing is written**. The impact names the
 *     bookings that would fall outside the new hours, whether the booking scan hit
 *     its cap, and whether the change would leave the therapist with no schedule at
 *     all (which the booking validator reads as "available at any time").
 *  2. The same request with `acknowledgeImpact: true` applies. The impact is
 *     recomputed on that second request rather than trusted from the first, so a
 *     booking made in between is counted, and the set the operator was shown is
 *     written into the audit entry.
 *
 * No booking is ever created, modified or cancelled here. A session that ends up
 * outside the new hours stays exactly as it was and is left for a person to move —
 * silently rewriting someone's appointment to fit a schedule edit would be a far
 * worse failure than an inconvenient list.
 */
export async function POST(req: Request, context: { params: Promise<{ therapistId: string }> }) {
  // Auth before the rate limit: the limiter is keyed by IP, so checking it first
  // would let unauthenticated traffic exhaust the bucket an operator needs.
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;
  const session = authorized;

  const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
  const rateCheck = checkRateLimit(clientIp, 'admin_schedule_write', 30, 60000);
  if (!rateCheck.success) {
    return NextResponse.json(
      { success: false, error: 'Too many schedule changes in a short time. Wait a moment and try again.' },
      { status: 429 }
    );
  }

  const { therapistId } = await context.params;
  if (!isReadableTherapistId(therapistId)) {
    return NextResponse.json({ success: false, error: 'That is not a valid therapist id.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'The request body was not valid JSON.' }, { status: 400 });
  }

  const parsed = adminScheduleWriteSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    logger.warn('THERAPIST_MUTATION', 'Admin schedule write rejected as malformed', {
      therapistId,
      adminUid: session.uid,
      issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    });
    return NextResponse.json(
      { success: false, error: first?.message ?? 'That is not a change this endpoint accepts.' },
      { status: 400 }
    );
  }

  const request = parsed.data;

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
      logger.info('THERAPIST_MUTATION', 'Admin schedule write awaiting confirmation', {
        therapistId,
        adminUid: session.uid,
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
      actorUid: session.uid,
      impact,
    });

    logger.info('THERAPIST_MUTATION', 'Admin schedule write applied', {
      therapistId,
      adminUid: session.uid,
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
      logger.warn('THERAPIST_MUTATION', 'Admin schedule write refused', {
        therapistId,
        adminUid: session.uid,
        action: request.action,
        reason: error.message,
      });
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    // Everything else — a Firestore failure naming the project, a transaction that
    // could not commit — stays in the log. The browser gets one fixed sentence.
    logger.error('THERAPIST_MUTATION', 'Admin schedule write failed', error, {
      therapistId,
      adminUid: session.uid,
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

