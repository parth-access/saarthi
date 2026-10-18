import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readTherapistRoster } from './therapistSources';
import { logger } from '../../_lib/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { checkRateLimit, getClientIp } from '../../_lib/rateLimit';
import { therapistProfileSchema, firstIssue } from './profileSchema';
import { assertSlugFree, resolveAuthLink, toProfileDoc, ProfileConflictError } from './profileWrite';

export const dynamic = 'force-dynamic';

/**
 * The therapist roster: who is on the books, and who is switched off.
 *
 * Lists every therapist, active and inactive, with a glance-level schedule
 * summary (how many days they work, whether any rule has drifted from the
 * 45-minute cadence). The detail page carries the full weekly schedule and the
 * editing affordances; this is the way in.
 *
 * Read-only, and `requireAdmin`-guarded with live role verification. A Firestore
 * error is logged server-side and the browser gets fixed copy, so an index URL
 * or project id in an error message is never rendered.
 */
export async function GET(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  try {
    const roster = await readTherapistRoster();
    return NextResponse.json(
      { success: true, generatedAtIso: new Date().toISOString(), roster },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    logger.error('THERAPIST_MUTATION', 'Admin therapist roster failed to assemble', error);
    return NextResponse.json(
      { success: false, error: 'We could not load therapists right now. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * Create a therapist.
 *
 * New therapists start NOT bookable (`active: false`): an operator adds their
 * weekly schedule on the detail page, then switches bookability on — so a
 * half-set-up profile is never offered to clients. Audited as THERAPIST_CREATED.
 */
export async function POST(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;
  const session = authorized;

  if (!checkRateLimit(getClientIp(req), 'admin_therapist_create', 10, 60_000).success) {
    return NextResponse.json({ error: 'Too many changes in a short time. Wait a minute and try again.' }, { status: 429 });
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
    await assertSlugFree(parsed.data.slug);
    const link = await resolveAuthLink(parsed.data.loginEmail);
    const profile = toProfileDoc(parsed.data, link);

    const ref = adminDb.collection('therapists').doc();
    await ref.set({
      ...profile,
      id: ref.id,
      active: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection('audit_logs').add({
      eventType: 'THERAPIST_CREATED',
      userId: session.uid,
      therapistId: ref.id,
      before: null,
      after: profile,
      details: `Therapist ${ref.id} (${profile.name}) created by admin ${session.uid}`,
      timestamp: FieldValue.serverTimestamp(),
    });

    logger.info('THERAPISTS', 'Admin created therapist', { adminUid: session.uid, therapistId: ref.id });

    return NextResponse.json({
      success: true,
      therapistId: ref.id,
      accountLinked: link.linked,
      summary: link.email && !link.linked
        ? 'Therapist created. No sign-in account exists for that email yet — once they sign up, save the profile again to link it.'
        : 'Therapist created. Add their weekly schedule, then mark them bookable.',
    });
  } catch (error) {
    if (error instanceof ProfileConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    logger.error('THERAPIST_MUTATION', 'Admin therapist create failed', error);
    return NextResponse.json({ error: 'The therapist could not be created. Please try again.' }, { status: 500 });
  }
}
