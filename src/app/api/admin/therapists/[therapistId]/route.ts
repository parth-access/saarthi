import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readTherapistDetail } from '../therapistSources';
import { isReadableTherapistId } from '../therapistIdGuard';
import { logger } from '../../../_lib/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { checkRateLimit, getClientIp } from '../../../_lib/rateLimit';
import { therapistProfileSchema, firstIssue } from '../profileSchema';
import { assertSlugFree, resolveAuthLink, toProfileDoc, pickProfile, ProfileConflictError } from '../profileWrite';

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

/**
 * Edit a therapist's public profile: name, slug, specialization, experience,
 * bio, photo, sign-in email and prices. Bookability and schedule have their
 * own routes. Writes a before/after THERAPIST_PROFILE_UPDATED audit row.
 */
export async function PATCH(req: Request, context: { params: Promise<{ therapistId: string }> }) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;
  const session = authorized;

  if (!checkRateLimit(getClientIp(req), 'admin_therapist_profile', 20, 60_000).success) {
    return NextResponse.json({ error: 'Too many changes in a short time. Wait a minute and try again.' }, { status: 429 });
  }

  const { therapistId } = await context.params;
  if (!isReadableTherapistId(therapistId)) {
    return NextResponse.json({ error: 'That is not a valid therapist id.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
  }
  const parsed = therapistProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  try {
    const ref = adminDb.collection('therapists').doc(therapistId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'No therapist exists with that id.' }, { status: 404 });
    }
    const before = pickProfile((snap.data() ?? {}) as Record<string, unknown>);

    await assertSlugFree(parsed.data.slug, therapistId);
    const link =
      parsed.data.loginEmail !== undefined ? await resolveAuthLink(parsed.data.loginEmail, therapistId) : null;
    const update = toProfileDoc(parsed.data, link);

    await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp() });

    const after = { ...before, ...update };
    await adminDb.collection('audit_logs').add({
      eventType: 'THERAPIST_PROFILE_UPDATED',
      userId: session.uid,
      therapistId,
      before,
      after,
      details: `Therapist ${therapistId} profile updated by admin ${session.uid}`,
      timestamp: FieldValue.serverTimestamp(),
    });

    logger.info('THERAPISTS', 'Admin updated therapist profile', { adminUid: session.uid, therapistId });

    return NextResponse.json({
      success: true,
      accountLinked: link ? link.linked : Boolean(before.authId),
      summary:
        link && link.email && !link.linked
          ? 'Profile saved. No sign-in account exists for that email yet — save again after they sign up to link it.'
          : 'Profile saved.',
    });
  } catch (error) {
    if (error instanceof ProfileConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    logger.error('THERAPIST_MUTATION', 'Admin therapist profile update failed', error, { therapistId });
    return NextResponse.json({ error: 'The profile could not be saved. Please try again.' }, { status: 500 });
  }
}
