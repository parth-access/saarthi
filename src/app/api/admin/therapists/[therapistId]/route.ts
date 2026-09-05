import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readTherapistDetail } from '../therapistSources';
import { isReadableTherapistId } from '../therapistIdGuard';
import { logger } from '../../../_lib/logger';

export const dynamic = 'force-dynamic';

const GENERIC_DETAIL_ERROR = 'We could not load this therapist right now. Please try again.';

/**
 * One therapist: identity, active status, and the full working schedule —
 * recurring weekly rules and date overrides.
 *
 * The browser runs `buildWeeklySchedule` over the rules this returns, so the
 * bookable grid an operator sees on this page is computed by the same generator
 * the booking flow uses, and cannot drift from it. The rule and override reads
 * each degrade on their own: if one fails, the page still renders and says which
 * half is missing, because a schedule that half-loaded must never read as a
 * therapist who simply has no hours.
 *
 * Read-only. Editing the schedule is a separate, audited write route.
 */
export async function GET(req: Request, context: { params: Promise<{ therapistId: string }> }) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  const { therapistId } = await context.params;

  if (!isReadableTherapistId(therapistId)) {
    // Not 404: a malformed id is a bad request, and saying so stops an operator
    // concluding a therapist they can see in the roster has been deleted.
    return NextResponse.json({ success: false, error: 'That is not a valid therapist id.' }, { status: 400 });
  }

  try {
    const detail = await readTherapistDetail(therapistId);
    if (!detail) {
      return NextResponse.json({ success: false, error: 'No therapist exists with that id.' }, { status: 404 });
    }
    return NextResponse.json(
      { success: true, ...detail },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    logger.error('THERAPIST_MUTATION', 'Admin therapist detail read failed', error, { therapistId });
    return NextResponse.json({ success: false, error: GENERIC_DETAIL_ERROR }, { status: 500 });
  }
}
