import { NextResponse } from 'next/server';
import { checkTherapistAccess } from '../_lib/authCheck';
import { getClientIp, checkRateLimit } from '../../_lib/rateLimit';
import { logger } from '../../_lib/logger';
import { adminScheduleWriteSchema } from '../../admin/therapists/[therapistId]/schedule/adminScheduleRequest';
import { runScheduleWrite } from '../../admin/therapists/[therapistId]/schedule/runScheduleWrite';

export const dynamic = 'force-dynamic';

/**
 * A therapist changing their OWN working hours and closed dates.
 *
 * The same validation, booking-impact check, transaction and audit entry as the
 * admin console's schedule route (both call `runScheduleWrite`). Only the
 * authorization differs: the schedule written is always the one linked to the
 * session's account, found server-side. No therapist id is accepted from the
 * request, so there is nothing to point at someone else's schedule. Admins use
 * their own route and are refused here.
 *
 * Replaces the old POST/DELETE on /api/therapist/availability/*, which stored
 * whatever the browser sent: overlapping windows, windows that fit no session,
 * and the removal of a last working day, which the booking validator reads as
 * "available at any time".
 */
export async function POST(req: Request) {
  const access = await checkTherapistAccess(req, undefined, 'THERAPIST_SCHEDULE_WRITE');
  if (!access.authorized) {
    return access.errorResponse ?? NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  if (access.role !== 'therapist' || !access.therapistId || !access.uid) {
    return NextResponse.json(
      { success: false, error: 'Only the therapist can change their own hours here.' },
      { status: 403 }
    );
  }

  if (!checkRateLimit(getClientIp(req), 'therapist_schedule_write', 30, 60_000).success) {
    return NextResponse.json(
      { success: false, error: 'Too many schedule changes in a short time. Wait a moment and try again.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'The request body was not valid JSON.' }, { status: 400 });
  }

  const parsed = adminScheduleWriteSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn('THERAPIST_MUTATION', 'Therapist schedule write rejected as malformed', {
      therapistId: access.therapistId,
      actorUid: access.uid,
      issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    });
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'That is not a change this endpoint accepts.' },
      { status: 400 }
    );
  }

  return runScheduleWrite(access.therapistId, parsed.data, { uid: access.uid, label: 'Therapist' });
}
