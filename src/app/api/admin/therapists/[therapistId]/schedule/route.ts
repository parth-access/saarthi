import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { logger } from '../../../../_lib/logger';
import { getClientIp, checkRateLimit } from '../../../../_lib/rateLimit';
import { isReadableTherapistId } from '../../therapistIdGuard';
import { adminScheduleWriteSchema } from './adminScheduleRequest';
import { runScheduleWrite } from './runScheduleWrite';

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

  const clientIp = getClientIp(req);
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

  return runScheduleWrite(therapistId, parsed.data, { uid: session.uid, label: 'Admin' });
}
